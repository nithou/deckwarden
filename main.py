import os
import sys
import asyncio

from bw_cli import BwCli, BwCliError
from bw_installer import BwInstaller
from password_manager import PasswordManager
from updater import Updater

import decky


class Plugin:

    bw: BwCli
    bw_installer: BwInstaller
    pm: PasswordManager

    def _init_components(self):
        bin_dir = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "bin")
        self.bw_installer = BwInstaller(decky.logger, bin_dir)
        self.bw = BwCli(
            decky.logger,
            bw_path=self.bw_installer.bw_path,
            data_dir=os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "bw-data"),
            # Optional custom CA for self-signed Vaultwarden certificates
            ca_cert_path=os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "ca.pem"),
        )
        self.pm = PasswordManager(decky.logger, self.bw)
        self.updater = Updater(decky.logger, decky.DECKY_PLUGIN_VERSION)

    async def _handle_error(self, error_message: str, exec_info: bool, close_password_manager: bool):
        # Must be called from inside an except block.
        cause = sys.exc_info()[1]
        if close_password_manager:
            await self.close_password_manager()
        decky.logger.error(error_message, exc_info=exec_info)
        # bw's own error text (from stderr) never contains secrets we passed
        # in, so surface it to the UI; hide details of any other exception.
        if isinstance(cause, BwCliError):
            raise ValueError(f"{error_message} {cause}") from None
        raise ValueError(error_message) from None

    async def check_setup_state(self):
        try:
            if not self.pm.are_dependencies_setup():
                return False, "unauthenticated", None, None

            status = await asyncio.wait_for(self.bw.status(), 30)
            return True, status.get("status"), status.get("serverUrl"), status.get("userEmail")
        except Exception:
            await self._handle_error("Failed to check setup state!", True, False)

    async def check_bw_install_state(self):
        return self.bw_installer.install_state

    async def install_bw(self):
        try:
            await self.bw_installer.install()
        except Exception:
            await self._handle_error("Failed to install Bitwarden CLI!", True, False)

    async def configure_server(self, url: str):
        try:
            url = url.strip().rstrip("/")
            if not url.startswith("https://") and not url.startswith("http://"):
                raise ValueError("Server URL must start with https://")
            await self.close_password_manager()
            await asyncio.wait_for(self.bw.set_server(url), 30)
        except Exception:
            await self._handle_error("Failed to configure server!", True, False)

    async def login_apikey(self, client_id: str, client_secret: str):
        try:
            await asyncio.wait_for(self.bw.login_apikey(client_id.strip(), client_secret.strip()), 90)
        except Exception:
            await self._handle_error("Failed to log in!", True, False)

    async def login_password(self, email: str, password: str, method: int | None, code: str | None):
        """
        Returns [state, security_token]:
        - ["unlocked", token]: logged in and vault unlocked in one step
        - ["code_required", ""]: two-step login needed (for Email, the code
          has just been sent)
        - ["method_required", ""]: several 2FA methods, none chosen
        """
        email = email.strip()
        code = (code or "").replace(" ", "").strip() or None
        try:
            try:
                session = await asyncio.wait_for(
                    self.bw.login_password(email, password, method, code), 120
                )
            except BwCliError as e:
                if e.detail == "Code is required." and code is None:
                    return ["code_required", ""]
                if e.detail == "Code is required.":
                    # A code was given but bw still wants one: this is the
                    # "new device verification" prompt, which bw cannot take
                    # non-interactively.
                    raise BwCliError("login", "New device verification required. Use the API key login instead.")
                if e.detail.startswith("Login failed. No provider selected"):
                    return ["method_required", ""]
                raise

            decky.logger.info("Logged in with email and password, loading vault")
            token = await asyncio.wait_for(self.pm.open_with_session(session), 120)
            return ["unlocked", token]
        except Exception:
            await self._handle_error("Failed to log in!", False, True)

    async def logout(self):
        try:
            await self.close_password_manager()
            await asyncio.wait_for(self.bw.logout(), 30)
        except Exception:
            await self._handle_error("Failed to log out!", True, False)

    async def open_password_manager(self, password: str):
        try:
            decky.logger.info("Unlocking vault")
            return await asyncio.wait_for(self.pm.open(password), 120)
        except Exception:
            # No exc_info: the traceback could contain locals of the unlock call
            await self._handle_error("Failed to unlock vault!", False, True)

    async def sync(self, security_token: str):
        try:
            await asyncio.wait_for(self.pm.sync(security_token), 120)
        except Exception:
            await self._handle_error("Failed to sync vault!", False, False)

    async def get_entries(self, security_token: str):
        try:
            return await self.pm.get_entries(security_token)
        except Exception:
            await self._handle_error("Failed to get entries!", False, True)

    async def get_entry_details(self, security_token: str, entry_id: str):
        try:
            return await self.pm.get_entry_details(security_token, entry_id)
        except Exception:
            await self._handle_error("Failed to get entry details!", False, True)

    async def get_entry_totp(self, security_token: str, entry_id: str):
        try:
            return await self.pm.get_entry_totp(security_token, entry_id)
        except Exception:
            # Keep the vault open: a malformed TOTP secret on one entry
            # should not lock everything.
            await self._handle_error("Failed to generate TOTP code!", False, False)

    async def close_password_manager(self):
        decky.logger.info("Locking vault")
        try:
            await asyncio.wait_for(self.pm.close(), 30)
        except Exception:
            decky.logger.error("Failed to lock vault!")

    async def check_for_update(self, force: bool = False):
        """Returns [current_version, update or None]."""
        try:
            update = await asyncio.wait_for(self.updater.check(force), 30)
            return [decky.DECKY_PLUGIN_VERSION, update]
        except Exception:
            await self._handle_error("Failed to check for updates!", True, False)

    async def _main(self):
        decky.logger.info("Loading DeckWarden...")
        self._init_components()
        decky.logger.info("Done loading DeckWarden")

    async def _unload(self):
        decky.logger.info("Unloaded DeckWarden")
        await self.close_password_manager()

    async def _uninstall(self):
        decky.logger.info("Uninstalled DeckWarden")

    async def _migration(self):
        decky.logger.info("Migrated DeckWarden")
