import hmac
import secrets
from logging import Logger

from bw_cli import BwCli
from totp import generate_totp, parse_totp

# Bitwarden cipher type for login items
LOGIN_ITEM_TYPE = 1


class PasswordManager:

    logger: Logger

    bw: BwCli

    def __init__(self, logger: Logger, bw: BwCli):
        self.logger = logger
        self.bw = bw
        self.security_token = ""
        self._session = ""
        self._items: dict[str, dict] = {}

    def is_open(self):
        return self._session != ""

    def are_dependencies_setup(self):
        return self.bw.is_setup()

    async def open(self, password: str):
        if self.is_open():
            await self.close()
        return await self.open_with_session(await self.bw.unlock(password))

    async def open_with_session(self, session: str):
        """Take over an unlocked bw session (from unlock or login --raw)."""
        if self.is_open():
            await self.close()

        self._session = session
        try:
            await self._load_items()
        except Exception:
            await self.close()
            raise

        self._generate_security_token()
        return self.security_token

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
            self._items[item["id"]] = {
                "path": f"{folder}/{name}" if folder else name,
                "username": login.get("username") or "",
                "password": login.get("password") or "",
                "totp": login.get("totp") or "",
            }

    async def get_entries(self, security_token: str):
        self._validate_security_token(security_token)
        entries = [
            [item_id, item["path"], item["totp"] != ""]
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

    async def get_entry_totp(self, security_token: str, entry_id: str):
        self._validate_security_token(security_token)
        item = self._items.get(entry_id)
        if item is None or not item["totp"]:
            raise ValueError("Entry has no TOTP!")
        code, remaining = generate_totp(parse_totp(item["totp"]))
        return [code, remaining]

    async def close(self):
        was_open = self.is_open()
        self._items = {}
        self.security_token = ""
        self._session = ""
        if was_open:
            await self.bw.lock()

    def _generate_security_token(self):
        self.security_token = secrets.token_urlsafe(32)

    def _validate_security_token(self, security_token: str):
        if not self.security_token or not hmac.compare_digest(self.security_token, security_token):
            raise ValueError("Invalid security token!")
