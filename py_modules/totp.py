import base64
import hashlib
import hmac
import struct
import time
from urllib.parse import parse_qs, urlparse

STEAM_ALPHABET = "23456789BCDFGHJKMNPQRTVWXY"

_ALGORITHMS = {
    "SHA1": hashlib.sha1,
    "SHA256": hashlib.sha256,
    "SHA512": hashlib.sha512,
}


class TotpConfig:
    def __init__(self, secret: bytes, digits: int = 6, period: int = 30,
                 algorithm: str = "SHA1", steam: bool = False):
        self.secret = secret
        self.digits = digits
        self.period = period
        self.algorithm = algorithm
        self.steam = steam


def _decode_base32(value: str) -> bytes:
    cleaned = value.replace(" ", "").replace("-", "").upper().rstrip("=")
    if not cleaned:
        raise ValueError("Empty TOTP secret")
    return base64.b32decode(cleaned + "=" * (-len(cleaned) % 8))


def parse_totp(value: str) -> TotpConfig:
    """Parse a Bitwarden TOTP field: otpauth:// URI, steam:// secret or raw base32."""
    value = value.strip()
    lower = value.lower()

    if lower.startswith("steam://"):
        return TotpConfig(_decode_base32(value[len("steam://"):]), digits=5, steam=True)

    if lower.startswith("otpauth://"):
        uri = urlparse(value)
        params = {k.lower(): v[0] for k, v in parse_qs(uri.query).items()}
        algorithm = params.get("algorithm", "SHA1").upper()
        if algorithm not in _ALGORITHMS:
            raise ValueError(f"Unsupported TOTP algorithm {algorithm}")
        steam = params.get("encoder", "").lower() == "steam"
        return TotpConfig(
            _decode_base32(params.get("secret", "")),
            digits=5 if steam else int(params.get("digits", 6)),
            period=int(params.get("period", 30)),
            algorithm=algorithm,
            steam=steam,
        )

    return TotpConfig(_decode_base32(value))


def generate_totp(config: TotpConfig, now: float | None = None) -> tuple[str, int]:
    """Return (code, seconds remaining in the current period)."""
    now = time.time() if now is None else now
    counter = int(now // config.period)
    digest = hmac.new(config.secret, struct.pack(">Q", counter), _ALGORITHMS[config.algorithm]).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF

    if config.steam:
        chars = []
        for _ in range(config.digits):
            value, idx = divmod(value, len(STEAM_ALPHABET))
            chars.append(STEAM_ALPHABET[idx])
        code = "".join(chars)
    else:
        code = str(value % (10 ** config.digits)).zfill(config.digits)

    remaining = config.period - int(now % config.period)
    return code, remaining
