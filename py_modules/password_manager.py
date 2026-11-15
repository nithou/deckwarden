import hashlib
import hmac
import os
import re
import secrets
import time
from logging import Logger

from bw_cli import BwCli
from totp import generate_totp, parse_totp

# Bitwarden cipher type for login items
LOGIN_ITEM_TYPE = 1

PIN_PATTERN = re.compile(r"^\d{4,8}$")
MAX_PIN_ATTEMPTS = 5


def _hash_pin(pin: str, salt: bytes) -> bytes:
    try:
        return hashlib.scrypt(pin.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    except (AttributeError, ValueError):
        # Python built without OpenSSL scrypt
        return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, 300_000)


class PinError(Exception):
    """Wrong PIN or PIN unlock no longer possible; the message is shown to the user."""


class PasswordManager:
    """
    Vault states:
    - open: the frontend holds a valid security token
    - PIN-locked: the bw session key is kept in memory (and nothing else),
      the token is revoked; the PIN gives a new token
    - locked: no session; the master password is needed
    The PIN and its hash only ever live in memory, so a restart of Decky or
    of the Deck always requires the master password.
    """

    logger: Logger

    bw: BwCli

    def __init__(self, logger: Logger, bw: BwCli):
        self.logger = logger
        self.bw = bw
        self.security_token = ""
        self._session = ""
        # Explicit flag: during an unlock the session exists before the token
        # does, and that transient state must not look like a PIN lock.
        self._pin_locked = False
        self._items: dict[str, dict] = {}
        self.last_activity = time.monotonic()
        self._clear_pin()

    # ---- state -----------------------------------------------------------

    def is_open(self):
        return self.security_token != ""

    def is_pin_locked(self):
        return self._pin_locked and self._session != ""

    def has_pin(self):
        return self._pin_hash is not None

    def pin_attempts_left(self):
        return MAX_PIN_ATTEMPTS - self._pin_failures

    def seconds_since_password_unlock(self) -> float:
        return time.monotonic() - self._password_unlocked_at

    def are_dependencies_setup(self):
        return self.bw.is_setup()

    # ---- unlocking -------------------------------------------------------

    async def open(self, password: str):
        if self._session:
            await self.close()
        return await self.open_with_session(await self.bw.unlock(password))

    async def open_with_session(self, session: str):
        """Take over an unlocked bw session (from unlock or login --raw)."""
        if self._session:
            await self.close()

        self._session = session
        try:
            await self._load_items()
        except Exception:
            await self.close()
            raise

        self._password_unlocked_at = time.monotonic()
        self._generate_security_token()
        self.touch()
        return self.security_token

    async def unlock_with_pin(self, pin: str):
        if not self.is_pin_locked() or not self.has_pin():
            raise PinError("PIN unlock is not available. Use your master password.")

        candidate = _hash_pin(pin, self._pin_salt)
        if not hmac.compare_digest(candidate, self._pin_hash):
            self._pin_failures += 1
            if self._pin_failures >= MAX_PIN_ATTEMPTS:
                self.logger.info("Too many wrong PINs, locking vault completely")
                await self.close()
                raise PinError("Too many wrong PINs. Use your master password.")
            raise PinError(f"Wrong PIN. {self.pin_attempts_left()} attempts left.")

        self._pin_failures = 0
        try:
            # Items were dropped on PIN lock; reload (and sync) them
            await self._load_items()
        except Exception:
            await self.close()
            raise
        self._pin_locked = False
        self._generate_security_token()
        self.touch()
        return self.security_token

    # ---- PIN management --------------------------------------------------

    def set_pin(self, security_token: str, pin: str):
        self._validate_security_token(security_token)
        if not PIN_PATTERN.match(pin):
            raise PinError("The PIN must be 4 to 8 digits.")
        self._pin_salt = os.urandom(16)
        self._pin_hash = _hash_pin(pin, self._pin_salt)
        self._pin_failures = 0

    def _clear_pin(self):
        self._pin_hash: bytes | None = None
        self._pin_salt = b""
        self._pin_failures = 0
        self._password_unlocked_at = 0.0

    async def remove_pin(self):
        """Forget the PIN; if PIN-locked, that means locking completely."""
        if self.is_pin_locked():
            await self.close()
        self._clear_pin()

    # ---- locking ---------------------------------------------------------

    async def lock(self):
        """PIN lock if a PIN is set, otherwise lock completely."""
        if self.has_pin() and self._session:
            self.pin_lock()
        else:
            await self.close()

    def pin_lock(self):
        # Keep only the session key; drop decrypted items and revoke the token
        self._items = {}
        self.security_token = ""
        self._pin_locked = True

    async def close(self):
        had_session = self._session != ""
        self._items = {}
        self.security_token = ""
        self._session = ""
        self._pin_locked = False
        self._clear_pin()
        if had_session:
            await self.bw.lock()

    # ---- vault data ------------------------------------------------------

    async def sync(self, security_token: str):
        self._validate_security_token(security_token)
        await self._load_items()

    async def _load_items(self):
        await self.bw.sync(self._session)
        folders = await self.bw.list_folders(self._session)
        items = await self.bw.list_items(self._session)

        folder_names = {f["id"]: f["name"] for f in folders if f.get("id")}

        self._items = {}
        for item in items:
            if item.get("type") != LOGIN_ITEM_TYPE or item.get("deletedDate"):
                continue
            folder = folder_names.get(item.get("folderId"))
            name = item.get("name") or "(unnamed)"
            login = item.get("login") or {}
            uris = [u.get("uri") for u in (login.get("uris") or []) if u.get("uri")]
            self._items[item["id"]] = {
                "uris": uris,
                "path": f"{folder}/{name}" if folder else name,
                "username": login.get("username") or "",
                "password": login.get("password") or "",
                "totp": login.get("totp") or "",
            }

    async def get_entries(self, security_token: str):
        self._validate_security_token(security_token)
        entries = [
            [item_id, item["path"], item["totp"] != "", item["uris"]]
            for item_id, item in self._items.items()
        ]
        entries.sort(key=lambda e: e[1].lower())
        return entries

    async def get_entry_details(self, security_token: str, entry_id: str):
        self._validate_security_token(security_token)
        item = self._items.get(entry_id)
        if item is None:
            raise ValueError("Unknown entry!")
        return [item["username"], item["password"]]

    async def get_entry_totp(self, security_token: str, entry_id: str, user_action: bool = True):
        # The on-screen code refreshes itself every period; that must not
        # count as activity or a displayed code would prevent auto-lock.
        self._validate_security_token(security_token, record_activity=user_action)
        item = self._items.get(entry_id)
        if item is None or not item["totp"]:
            raise ValueError("Entry has no TOTP!")
        code, remaining = generate_totp(parse_totp(item["totp"]))
        return [code, remaining]

    # ---- helpers ---------------------------------------------------------

    def touch(self):
        self.last_activity = time.monotonic()

    def idle_seconds(self) -> float:
        return time.monotonic() - self.last_activity

    def _generate_security_token(self):
        self.security_token = secrets.token_urlsafe(32)

    def _validate_security_token(self, security_token: str, record_activity: bool = True):
        if not self.security_token or not hmac.compare_digest(self.security_token, security_token):
            raise ValueError("Invalid security token!")
        if record_activity:
            self.touch()
