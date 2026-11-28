"""
Reusable Multi-Layer Login Security Middleware for FastAPI / Starlette.

Implements:
1. IP-based Rate Limiting (default: 20 login attempts per 15 minutes per IP -> HTTP 429).
2. Account-based Lockout & Progressive Delays (increasing delay after 3 failed attempts;
   15-minute lockout after 20 consecutive failures; reset counter on successful login).
3. In-memory thread-safe store by default, with automatic Redis support when REDIS_URL is set.
"""

import asyncio
from collections import deque
import json
import logging
import math
import os
import threading
import time
from typing import Callable, Deque, Dict, Optional, Sequence, Tuple

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class BaseLoginSecurityStore:
    """Interface for login rate-limiting and account lockout tracking stores."""

    def __init__(
        self,
        ip_max_attempts: int = 20,
        ip_window_seconds: int = 900,
        delay_threshold: int = 3,
        lockout_threshold: int = 20,
        lockout_seconds: int = 900,
        base_delay_seconds: float = 2.0,
        max_delay_seconds: float = 16.0,
        enabled: Optional[bool] = None,
    ):
        self.ip_max_attempts = ip_max_attempts
        self.ip_window_seconds = ip_window_seconds
        self.delay_threshold = delay_threshold
        self.lockout_threshold = lockout_threshold
        self.lockout_seconds = lockout_seconds
        self.base_delay_seconds = base_delay_seconds
        self.max_delay_seconds = max_delay_seconds
        if enabled is None:
            self.enabled = os.getenv("TESTING") != "1"
        else:
            self.enabled = enabled

    def compute_delay(self, consecutive_failures: int) -> float:
        """Return progressive backoff seconds once failures reach delay_threshold."""
        if consecutive_failures < self.delay_threshold:
            return 0.0
        exponent = consecutive_failures - self.delay_threshold
        delay = self.base_delay_seconds * (2 ** exponent)
        return min(delay, self.max_delay_seconds)

    def check_and_record_ip(self, ip: str) -> Tuple[bool, int]:
        raise NotImplementedError

    def get_account_status(self, identifier: str) -> Tuple[bool, int, int]:
        """Return (is_locked, retry_after_seconds, consecutive_failures)."""
        raise NotImplementedError

    def record_account_failure(self, identifier: str) -> Tuple[int, bool, int]:
        """Record a failed attempt; return (failures, is_now_locked, lockout_retry_after)."""
        raise NotImplementedError

    def reset_account(self, identifier: str) -> None:
        raise NotImplementedError

    def reset(self) -> None:
        raise NotImplementedError


class InMemoryLoginSecurityStore(BaseLoginSecurityStore):
    """Thread-safe in-memory sliding-window IP limiter & account lockout tracker."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._lock = threading.Lock()
        self._ip_attempts: Dict[str, Deque[float]] = {}
        self._account_failures: Dict[str, int] = {}
        self._account_locked_until: Dict[str, float] = {}

    def check_and_record_ip(self, ip: str) -> Tuple[bool, int]:
        now = time.time()
        cutoff = now - self.ip_window_seconds
        with self._lock:
            q = self._ip_attempts.setdefault(ip, deque())
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= self.ip_max_attempts:
                retry_after = max(1, math.ceil(q[0] + self.ip_window_seconds - now))
                return False, retry_after
            q.append(now)
            return True, 0

    def get_account_status(self, identifier: str) -> Tuple[bool, int, int]:
        if not identifier:
            return False, 0, 0
        now = time.time()
        with self._lock:
            locked_until = self._account_locked_until.get(identifier)
            if locked_until is not None:
                if now < locked_until:
                    retry_after = max(1, math.ceil(locked_until - now))
                    return True, retry_after, self._account_failures.get(identifier, self.lockout_threshold)
                # Lockout window expired; clear stale state
                self._account_locked_until.pop(identifier, None)
                self._account_failures.pop(identifier, None)
            failures = self._account_failures.get(identifier, 0)
            return False, 0, failures

    def record_account_failure(self, identifier: str) -> Tuple[int, bool, int]:
        if not identifier:
            return 0, False, 0
        now = time.time()
        with self._lock:
            count = self._account_failures.get(identifier, 0) + 1
            self._account_failures[identifier] = count
            if count >= self.lockout_threshold:
                self._account_locked_until[identifier] = now + self.lockout_seconds
                return count, True, self.lockout_seconds
            return count, False, 0

    def reset_account(self, identifier: str) -> None:
        if not identifier:
            return
        with self._lock:
            self._account_failures.pop(identifier, None)
            self._account_locked_until.pop(identifier, None)

    def reset(self) -> None:
        with self._lock:
            self._ip_attempts.clear()
            self._account_failures.clear()
            self._account_locked_until.clear()


class RedisLoginSecurityStore(BaseLoginSecurityStore):
    """Redis-backed distributed store for multi-worker/multi-instance deployments."""

    def __init__(self, redis_url: str, **kwargs):
        super().__init__(**kwargs)
        import redis  # type: ignore

        self._client = redis.Redis.from_url(redis_url, decode_responses=True)
        self._prefix = "corpsec:login_sec:"

    def check_and_record_ip(self, ip: str) -> Tuple[bool, int]:
        key = f"{self._prefix}ip:{ip}"
        now = time.time()
        cutoff = now - self.ip_window_seconds
        pipe = self._client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, count = pipe.execute()
        if int(count) >= self.ip_max_attempts:
            oldest = self._client.zrange(key, 0, 0, withscores=True)
            oldest_ts = oldest[0][1] if oldest else now
            retry_after = max(1, math.ceil(oldest_ts + self.ip_window_seconds - now))
            return False, retry_after
        member = f"{now}:{os.urandom(4).hex()}"
        pipe = self._client.pipeline()
        pipe.zadd(key, {member: now})
        pipe.expire(key, self.ip_window_seconds)
        pipe.execute()
        return True, 0

    def get_account_status(self, identifier: str) -> Tuple[bool, int, int]:
        if not identifier:
            return False, 0, 0
        lock_key = f"{self._prefix}lock:{identifier}"
        fail_key = f"{self._prefix}fail:{identifier}"
        ttl = self._client.ttl(lock_key)
        if ttl and int(ttl) > 0:
            failures = int(self._client.get(fail_key) or self.lockout_threshold)
            return True, int(ttl), failures
        failures = int(self._client.get(fail_key) or 0)
        return False, 0, failures

    def record_account_failure(self, identifier: str) -> Tuple[int, bool, int]:
        if not identifier:
            return 0, False, 0
        fail_key = f"{self._prefix}fail:{identifier}"
        lock_key = f"{self._prefix}lock:{identifier}"
        count = int(self._client.incr(fail_key))
        self._client.expire(fail_key, self.lockout_seconds)
        if count >= self.lockout_threshold:
            self._client.setex(lock_key, self.lockout_seconds, "1")
            return count, True, self.lockout_seconds
        return count, False, 0

    def reset_account(self, identifier: str) -> None:
        if not identifier:
            return
        self._client.delete(
            f"{self._prefix}fail:{identifier}",
            f"{self._prefix}lock:{identifier}",
        )

    def reset(self) -> None:
        keys = list(self._client.scan_iter(f"{self._prefix}*"))
        if keys:
            self._client.delete(*keys)


def create_login_security_store(redis_url: Optional[str] = None, **kwargs) -> BaseLoginSecurityStore:
    """Build Redis store when configured and reachable, otherwise thread-safe in-memory store."""
    url = (redis_url or os.getenv("REDIS_URL") or "").strip()
    if url:
        try:
            store = RedisLoginSecurityStore(url, **kwargs)
            store._client.ping()
            logger.info("LoginSecurityMiddleware initialized with Redis store.")
            return store
        except Exception as exc:
            logger.warning("Redis store unavailable (%s); falling back to in-memory store.", exc)
    return InMemoryLoginSecurityStore(**kwargs)


# Shared default store instance used by FastAPI middleware and test controls
login_security_store: BaseLoginSecurityStore = create_login_security_store()


def _extract_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if forwarded:
        first_hop = forwarded.split(",")[0].strip()
        if first_hop:
            return first_hop
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _extract_login_identifier(body_bytes: bytes) -> str:
    if not body_bytes:
        return ""
    try:
        data = json.loads(body_bytes.decode("utf-8"))
        if isinstance(data, dict):
            raw = data.get("phone") or data.get("email") or data.get("username") or data.get("guard_id") or ""
            ident = str(raw).strip()
            from application.backend.app.core.phone import normalize_kenyan_phone
            norm_phone = normalize_kenyan_phone(ident)
            return norm_phone if norm_phone else ident.lower()
    except Exception:
        pass
    return ""


def _format_retry_message(prefix: str, retry_after_seconds: int) -> str:
    if retry_after_seconds >= 60:
        mins = math.ceil(retry_after_seconds / 60)
        return f"{prefix} Please try again in {mins} minute(s) ({retry_after_seconds} seconds)."
    return f"{prefix} Please try again in {retry_after_seconds} seconds."


class LoginSecurityMiddleware(BaseHTTPMiddleware):
    """
    Reusable FastAPI/Starlette middleware enforcing:
    - IP-based Rate Limiting (20 attempts / 15 min -> HTTP 429)
    - Progressive Delays after 3 failed login attempts
    - 15-minute Account Lockout after 20 consecutive failed attempts
    - Automatic failure-counter reset on successful authentication
    """

    def __init__(
        self,
        app,
        store: Optional[BaseLoginSecurityStore] = None,
        protected_paths: Sequence[str] = ("/api/v1/auth/login", "/api/v1/auth/login/guard"),
        sleep_func: Optional[Callable[[float], object]] = None,
    ):
        super().__init__(app)
        self.store = store if store is not None else login_security_store
        self.protected_paths = set(protected_paths)
        self.sleep_func = sleep_func

    async def dispatch(self, request: Request, call_next) -> Response:
        if (
            not self.store.enabled
            or request.method.upper() != "POST"
            or request.url.path.rstrip("/") not in self.protected_paths
        ):
            return await call_next(request)

        # Buffer request body cleanly so downstream FastAPI endpoints can read JSON normally
        body_bytes = await request.body()

        async def _receive():
            return {"type": "http.request", "body": body_bytes, "more_body": False}

        request._receive = _receive  # type: ignore[attr-defined]

        client_ip = _extract_client_ip(request)
        identifier = _extract_login_identifier(body_bytes)

        # 1. Layer 2 Pre-check: Account-based temporary lockout (prevents brute-force across IPs)
        is_locked, lock_retry, prior_failures = self.store.get_account_status(identifier)
        if is_locked:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": _format_retry_message(
                        "Too many failed login attempts. Access is temporarily locked.",
                        lock_retry,
                    )
                },
                headers={
                    "Retry-After": str(lock_retry),
                    "X-RateLimit-Reset": str(lock_retry),
                },
            )

        # 2. Layer 1: IP-based Rate Limiting (20 attempts per 15 minutes per IP)
        ip_allowed, ip_retry = self.store.check_and_record_ip(client_ip)
        if not ip_allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": _format_retry_message(
                        "Too many login attempts from this IP address.",
                        ip_retry,
                    )
                },
                headers={
                    "Retry-After": str(ip_retry),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(ip_retry),
                },
            )

        # 3. Layer 2: Progressive Delay after 3 failed attempts
        delay_seconds = self.store.compute_delay(prior_failures)
        if delay_seconds > 0:
            sleep_fn = self.sleep_func if self.sleep_func is not None else asyncio.sleep
            res = sleep_fn(delay_seconds)
            if asyncio.iscoroutine(res):
                await res

        # 4. Forward to route handler
        response = await call_next(request)

        # 5. Update failure/lockout state based on authentication outcome
        if identifier:
            if response.status_code == 200:
                self.store.reset_account(identifier)
            elif response.status_code in (401, 403):
                self.store.record_account_failure(identifier)

        return response
