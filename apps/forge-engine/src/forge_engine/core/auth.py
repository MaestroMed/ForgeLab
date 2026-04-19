"""JWT authentication utilities using stdlib only (no python-jose/passlib)."""

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from forge_engine.core.config import settings

_SECRET = getattr(settings, "JWT_SECRET", "FORGE_JWT_DEFAULT_SECRET_CHANGE_ME")
_ALGORITHM = "HS256"
_ACCESS_TTL = 3600 * 24 * 7    # 7 days
_REFRESH_TTL = 3600 * 24 * 30   # 30 days


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def _sign(header_payload: str) -> str:
    sig = hmac.new(_SECRET.encode(), header_payload.encode(), hashlib.sha256).digest()
    return _b64url_encode(sig)


def create_access_token(user_id: str, plan: str = "free") -> str:
    """Create a signed JWT access token."""
    now = int(time.time())
    header = _b64url_encode(json.dumps({"alg": _ALGORITHM, "typ": "JWT"}).encode())
    payload = _b64url_encode(json.dumps({
        "sub": user_id,
        "plan": plan,
        "iat": now,
        "exp": now + _ACCESS_TTL,
        "type": "access",
    }).encode())
    sig = _sign(f"{header}.{payload}")
    return f"{header}.{payload}.{sig}"


def create_refresh_token(user_id: str) -> str:
    """Create a signed refresh token."""
    now = int(time.time())
    header = _b64url_encode(json.dumps({"alg": _ALGORITHM, "typ": "JWT"}).encode())
    payload = _b64url_encode(json.dumps({
        "sub": user_id,
        "iat": now,
        "exp": now + _REFRESH_TTL,
        "type": "refresh",
        "jti": secrets.token_hex(16),
    }).encode())
    sig = _sign(f"{header}.{payload}")
    return f"{header}.{payload}.{sig}"


def decode_token(token: str) -> dict[str, Any] | None:
    """Decode and verify a JWT token. Returns payload dict or None if invalid."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_payload = f"{parts[0]}.{parts[1]}"
        expected_sig = _sign(header_payload)
        if not hmac.compare_digest(expected_sig, parts[2]):
            return None
        payload = json.loads(_b64url_decode(parts[1]))
        if payload.get("exp", 0) < int(time.time()):
            return None  # Expired
        return payload
    except Exception:
        return None


def hash_password(password: str) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 + random salt."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"pbkdf2$sha256${salt}${dk.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its PBKDF2 hash."""
    try:
        _, algo, salt, stored_hex = hashed.split("$")
        dk = hashlib.pbkdf2_hmac(algo, password.encode(), salt.encode(), 100_000)
        return hmac.compare_digest(dk.hex(), stored_hex)
    except Exception:
        return False
