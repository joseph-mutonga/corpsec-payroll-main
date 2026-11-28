"""Shared Kenyan mobile phone number validation and normalization utilities."""

import re
from typing import List, Optional, Tuple


def normalize_kenyan_phone(phone_str: Optional[str]) -> Optional[str]:
    """
    Normalize a Kenyan mobile number to canonical 10-digit format (e.g. '0712345678' or '0112345678').

    Accepts formats such as:
    - 0712345678 / 0112345678
    - +254712345678 / +254112345678
    - 254712345678 / 254112345678
    - 00254712345678 / 00254112345678
    With optional spaces, hyphens, or parentheses. Returns None if invalid.
    """
    if phone_str is None:
        return None
    raw = str(phone_str).strip()
    if not raw:
        return None

    # Allow only leading +, digits, spaces, hyphens, and parentheses
    if re.search(r"[^\d\s\-\+\(\)]", raw):
        return None

    cleaned = re.sub(r"[\s\-\+\(\)]", "", raw)
    if not cleaned.isdigit():
        return None

    if cleaned.startswith("00254") and len(cleaned) == 14:
        cleaned = "0" + cleaned[5:]
    elif cleaned.startswith("254") and len(cleaned) == 12:
        cleaned = "0" + cleaned[3:]

    if len(cleaned) == 10 and (cleaned.startswith("07") or cleaned.startswith("01")):
        return cleaned

    return None


def validate_kenyan_phone(phone_str: Optional[str]) -> Tuple[bool, str, Optional[str]]:
    """
    Validate and normalize a Kenyan phone number.
    Returns (is_valid, normalized_phone, error_message).
    """
    if not phone_str or not str(phone_str).strip():
        return False, "", "Phone number is missing"

    normalized = normalize_kenyan_phone(phone_str)
    if normalized:
        return True, normalized, None

    return (
        False,
        str(phone_str),
        f"Invalid Kenyan phone format: '{phone_str}'. Expected e.g. 0712345678, +254712345678, or 254712345678.",
    )


def kenyan_phone_variants(phone_str: Optional[str]) -> List[str]:
    """
    Return all equivalent database lookup strings for a phone input so queries match
    legacy un-normalized rows as well as normalized rows.
    """
    if not phone_str or not str(phone_str).strip():
        return []

    raw = str(phone_str).strip()
    variants: List[str] = []
    normalized = normalize_kenyan_phone(raw)
    if normalized:
        variants.extend([
            normalized,
            f"254{normalized[1:]}",
            f"+254{normalized[1:]}",
        ])
    if raw and raw not in variants:
        variants.append(raw)
    return variants
