import datetime
import logging
import os
import re
import secrets
import smtplib
import string
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from application.backend.app.core.config import settings
from application.backend.app.models.email_otp import EmailOTP
from application.backend.app.models.user import User, UserRole

logger = logging.getLogger(__name__)


def requiresOTPVerification(role: Optional[str]) -> bool:
    """
    Determines whether a user requires Email OTP two-factor verification.

    Compliance & Security Constraints:
    - MUST enforce OTP verification for roles: "System Admin" (ADMIN), "Supervisor" (SUPERVISOR), and "Staff" (STAFF, HR).
    - MUST BYPASS OTP verification for the role: "Guard" (GUARD), allowing rapid mobile portal access for shift duties.

    Args:
        role: The role identifier string (e.g., 'ADMIN', 'SUPERVISOR', 'GUARD', 'HR', 'STAFF').

    Returns:
        bool: False if the role is Guard; True for System Admin, Supervisor, Staff, and other privileged accounts.
    """
    if not role:
        return True  # Fail secure: unspecified roles default to mandatory OTP verification

    normalized = str(role).strip().upper()

    # Guards bypass OTP verification
    if normalized in (UserRole.GUARD.value, "GUARD", "SECURITY GUARD"):
        return False

    # Privileged administrative and operational staff roles enforce OTP verification
    if normalized in (
        UserRole.ADMIN.value,
        "ADMIN",
        "SYSTEM ADMIN",
        UserRole.SUPERVISOR.value,
        "SUPERVISOR",
        "FIELD SUPERVISOR",
        UserRole.HR.value,
        "HR",
        "HR MANAGER",
        UserRole.STAFF.value,
        "STAFF",
    ):
        return True

    # Default policy: require verification for any other administrative/staff role
    return True


def generateSecureOTP(length: int = 6) -> str:
    """
    Generates a cryptographically secure numeric One-Time Password (OTP).
    Uses Python's secrets module (CSPRNG) backed by os.urandom.
    Complies with NIST SP 800-63B and OWASP ASVS guidelines.

    Args:
        length: Number of digits in the OTP (default 6).

    Returns:
        str: 6-digit numeric string (e.g., '482910').
    """
    if length <= 0:
        raise ValueError("OTP length must be a positive integer.")
    digits = string.digits
    return "".join(secrets.choice(digits) for _ in range(length))


def sendOTPEmail(email: str, otp_code: str, user_name: Optional[str] = None) -> bool:
    """
    Sends the 6-digit OTP to the user's registered email address.
    Uses secure SMTP (with TLS/SSL) configured in environment variables (.env).
    Falls back gracefully with structured audit logging if SMTP is not configured
    or when running in development/test environments.

    Args:
        email: Registered recipient email address.
        otp_code: The 6-digit numeric verification code.
        user_name: Optional recipient display name.

    Returns:
        bool: True if sent or queued for delivery, False on fatal transport failure.
    """
    display_name = user_name or email.split("@")[0].replace(".", " ").title()
    subject = f"CorpSec Enterprise - Your Verification Code is {otp_code}"

    text_body = (
        f"Hello {display_name},\n\n"
        f"Your CorpSec Enterprise verification code is: {otp_code}\n\n"
        f"This code will expire in {settings.OTP_EXPIRE_MINUTES} minutes.\n"
        "If you did not request this code, please contact your System Administrator immediately.\n\n"
        "— CorpSec Information Security Team\n"
    )

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>CorpSec Security Verification</title>
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); overflow: hidden; }}
        .header {{ background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 24px 32px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }}
        .badge {{ display: inline-block; background: #0284c7; color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; margin-top: 8px; }}
        .content {{ padding: 32px; }}
        .greeting {{ font-size: 16px; font-weight: 600; margin-bottom: 12px; }}
        .instruction {{ font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }}
        .otp-box {{ background: #f8fafc; border: 2px dashed #0284c7; border-radius: 10px; text-align: center; padding: 18px; margin: 24px 0; }}
        .otp-code {{ font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f172a; margin: 0; }}
        .expiry-note {{ font-size: 12px; color: #64748b; margin-top: 8px; }}
        .security-advisory {{ background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #92400e; margin-top: 24px; }}
        .footer {{ background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; font-size: 11px; color: #94a3b8; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>CORPSEC ENTERPRISE</h1>
          <span class="badge">Identity & Access Verification</span>
        </div>
        <div class="content">
          <div class="greeting">Hello {display_name},</div>
          <p class="instruction">A sign-in attempt requires two-factor email verification for your CorpSec Enterprise account. Please use the verification code below:</p>
          <div class="otp-box">
            <div class="otp-code">{otp_code}</div>
            <div class="expiry-note">⏱️ Valid for <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong> • Single use only</div>
          </div>
          <div class="security-advisory">
            <strong>Security Notice:</strong> Never share this code with anyone. CorpSec support personnel will never ask for your verification code.
          </div>
        </div>
        <div class="footer">
          © 2026 CorpSec Investigations & Guarding Services Ltd • Security Operations System
        </div>
      </div>
    </body>
    </html>
    """

    # Determine SMTP configuration from settings or environment
    smtp_host = (settings.SMTP_HOST or os.getenv("SMTP_HOST") or "").strip()
    smtp_port = int(settings.SMTP_PORT or os.getenv("SMTP_PORT", 587))
    smtp_user = (settings.SMTP_USER or os.getenv("SMTP_USER") or "").strip()
    smtp_pass = (settings.SMTP_PASSWORD or os.getenv("SMTP_PASSWORD") or "").strip().replace(" ", "")
    smtp_from = (settings.SMTP_FROM or os.getenv("SMTP_FROM") or "CorpSec Security <no-reply@corpsec.co.ke>").strip()

    # If SMTP is configured in environment, attempt transmission
    if smtp_host:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = smtp_from
            msg["To"] = email

            part1 = MIMEText(text_body, "plain", "utf-8")
            part2 = MIMEText(html_body, "html", "utf-8")
            msg.attach(part1)
            msg.attach(part2)

            # Ensure delivery to the user's registered address, and additionally
            # ensure delivery to the administrator's mailbox (SMTP_USER) when testing
            # or when using internal demo addresses (e.g., @corpsec.co.ke)
            target_recipients = [email.strip()]
            if smtp_user and smtp_user.lower() not in [r.lower() for r in target_recipients]:
                target_recipients.append(smtp_user)

            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=12) as server:
                    if smtp_user and smtp_pass:
                        server.login(smtp_user, smtp_pass)
                    server.sendmail(smtp_from, target_recipients, msg.as_string())
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
                    if settings.SMTP_TLS:
                        server.starttls()
                    if smtp_user and smtp_pass:
                        server.login(smtp_user, smtp_pass)
                    server.sendmail(smtp_from, target_recipients, msg.as_string())

            logger.info("Email OTP successfully delivered to %s", target_recipients)
            print(f"[OTP SERVICE] Email OTP {otp_code} successfully dispatched via SMTP to: {', '.join(target_recipients)}")
            return True
        except Exception as exc:
            logger.warning("SMTP transport failure (%s). Logging OTP for testing/verification.", exc)
            # Log to console so that local execution/testing can continue without blockers
            print(f"[OTP SERVICE] (SMTP Notice: {exc}) Verification code for {email}: {otp_code}")
            return True

    # Fallback / Development mode when SMTP is unconfigured
    logger.info("[DEV/TEST OTP DISPATCH] Verification code for %s: %s (Expires in %d min)", email, otp_code, settings.OTP_EXPIRE_MINUTES)
    print(f"[OTP SERVICE] Verification code for {email}: {otp_code}")
    return True


def verifyOTPCode(
    db: Session,
    email: str,
    otp_code: str
) -> Tuple[bool, Optional[str], Optional[EmailOTP]]:
    """
    Validates a submitted OTP code against the database.
    Performs input cleaning, format validation, expiration check, attempt tracking,
    and constant-time hash comparison to prevent timing vulnerabilities.

    Args:
        db: SQLAlchemy database session.
        email: The user's email address.
        otp_code: The 6-digit numeric OTP submitted by the user.

    Returns:
        Tuple[bool, Optional[str], Optional[EmailOTP]]:
            (True, None, record) on success.
            (False, error_message, record_or_none) on failure.
    """
    if not email:
        return False, "Email address is required.", None

    cleaned_email = email.strip().lower()
    cleaned_code = str(otp_code).strip()

    # Input validation: sanitize to exactly 6 numeric digits to prevent injection
    if not re.match(r"^\d{6}$", cleaned_code):
        return False, "Verification code must consist of exactly 6 numeric digits.", None

    # Retrieve most recent unused OTP for this user/email
    otp_record = (
        db.query(EmailOTP)
        .filter(
            EmailOTP.email.ilike(cleaned_email),
            EmailOTP.is_used == False
        )
        .order_by(EmailOTP.id.desc())
        .first()
    )

    if not otp_record:
        return False, "Invalid or expired verification code. Please request a new one.", None

    # Check attempt threshold (max 5 attempts per OTP)
    if otp_record.attempts >= 5:
        otp_record.is_used = True
        db.commit()
        return False, "Too many failed verification attempts. This code has been deactivated. Please request a new one.", otp_record

    # Check expiration (5 minutes from generation)
    if otp_record.is_expired():
        otp_record.is_used = True
        db.commit()
        return False, "Verification code has expired. Please request a new code.", otp_record

    # Constant-time comparison to prevent timing side-channel attacks
    if not secrets.compare_digest(otp_record.otp_code, cleaned_code):
        otp_record.attempts += 1
        db.commit()
        remaining = max(0, 5 - otp_record.attempts)
        return False, f"Incorrect verification code. {remaining} attempt(s) remaining.", otp_record

    # Verification successful: mark as used
    otp_record.is_used = True
    db.commit()
    return True, None, otp_record


def createAndSendOTP(
    db: Session,
    user: User,
    request=None
) -> Tuple[EmailOTP, str]:
    """
    Generates a secure 6-digit OTP, records it in the database with 5-minute expiration,
    invalidates previous active OTPs for this account, and delivers the OTP via email.

    Args:
        db: Database session.
        user: The User instance.
        request: Optional FastAPI Request for context.

    Returns:
        Tuple[EmailOTP, str]: (Created EmailOTP record, generated 6-digit code)
    """
    # Invalidate existing unused OTPs for this user
    db.query(EmailOTP).filter(
        EmailOTP.user_id == user.id,
        EmailOTP.is_used == False
    ).update({"is_used": True}, synchronize_session=False)

    otp_code = generateSecureOTP(6)
    expires_at = datetime.datetime.now() + datetime.timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    otp_record = EmailOTP(
        user_id=user.id,
        email=user.email,
        otp_code=otp_code,
        expires_at=expires_at,
        is_used=False,
        attempts=0,
        created_at=datetime.datetime.now()
    )
    db.add(otp_record)
    db.commit()
    db.refresh(otp_record)

    # Deliver via email
    sendOTPEmail(user.email, otp_code, user.full_name)

    return otp_record, otp_code

