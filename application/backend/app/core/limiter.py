from fastapi import Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import math

limiter = Limiter(key_func=get_remote_address)


def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Custom HTTP 429 handler returning JSON error and Retry-After header."""
    retry_after = getattr(exc, 'retry_after', 900) or 900
    retry_seconds = math.ceil(retry_after)
    
    return JSONResponse(
        status_code=429,
        content={
            "detail": f"Too many login attempts. Please try again after {retry_seconds} seconds."
        },
        headers={
            "Retry-After": str(retry_seconds),
            "X-RateLimit-Reset": str(retry_seconds)
        }
    )
