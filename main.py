import os
import sys
import asyncio

from bw_cli import BwCli, BwCliError
from bw_installer import BwInstaller
from password_manager import PasswordManager, PinError
from updater import Updater

import decky
from settings import SettingsManager

AUTO_LOCK_CHOICES = (0, 5, 10, 15, 30, 60)  # minutes; 0 = never
DEFAULT_AUTO_LOCK_MINUTES = 15
AUTO_LOCK_CHECK_SECONDS = 20
PIN_MAX_HOURS_CHOICES = (0, 1, 4, 8, 24)  # hours after a master password unlock; 0 = no limit
DEFAULT_PIN_MAX_HOURS = 8


class Plugin:

    bw: BwCli
    bw_installer: BwInstaller
    pm: PasswordManager
    settings: SettingsManager
    _auto_lock_task: asyncio.Task | None = None

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
        # When PIN-locked there is no valid token left to revoke; a stale
        # call from the UI must not wipe the PIN lock.
        if close_password_manager and not self.pm.is_pin_locked():
            await self.close_password_manager()
        decky.logger.error(error_message, exc_info=exec_info)
        # bw's own error text (from stderr) never contains secrets we passed
        # in, so surface it to the UI; hide details of any other exception.
        if isinstance(cause, BwCliError):
            raise ValueError(f"{error_message} {cause}") from None
        if isinstance(cause, PinError):
            raise ValueError(f"{error_message} (PIN: {cause})") from None
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

    async def get_entry_totp(self, security_token: str, entry_id: str, user_action: bool = True):
        try:
            return await self.pm.get_entry_totp(security_token, entry_id, user_action)
        except Exception:
            # Keep the vault open: a malformed TOTP secret on one entry
            # should not lock everything.
            await self._handle_error("Failed to generate TOTP code!", False, False)

    # ---- PIN unlock ------------------------------------------------------

    def _pin_enabled(self) -> bool:
        return self.settings.getSetting("pinUnlockEnabled", False) is True

    def _pin_max_hours(self) -> int:
        value = self.settings.getSetting("pinMaxHours", DEFAULT_PIN_MAX_HOURS)
        return value if value in PIN_MAX_HOURS_CHOICES else DEFAULT_PIN_MAX_HOURS

    async def _expire_pin_if_needed(self):
        hours = self._pin_max_hours()
        if self.pm.is_pin_locked() and hours and self.pm.seconds_since_password_unlock() >= hours * 3600:
            decky.logger.info(f"PIN unlock expired after {hours} h, locking vault completely")
            await self.close_password_manager()

    async def get_pin_state(self):
        """Returns [enabled, has_pin, pin_locked, attempts_left, max_hours]."""
        await self._expire_pin_if_needed()
        return [
            self._pin_enabled(),
            self.pm.has_pin(),
            self.pm.is_pin_locked(),
            self.pm.pin_attempts_left(),
            self._pin_max_hours(),
        ]

    async def set_pin_settings(self, enabled: bool, max_hours: int):
        if max_hours not in PIN_MAX_HOURS_CHOICES:
            raise ValueError("Unsupported PIN duration")
        self.settings.setSetting("pinUnlockEnabled", bool(enabled))
        self.settings.setSetting("pinMaxHours", max_hours)
        self.settings.commit()
        if not enabled:
            await self.pm.remove_pin()

    async def set_pin(self, security_token: str, pin: str):
        try:
            if not self._pin_enabled():
                raise PinError("PIN unlock is disabled.")
            self.pm.set_pin(security_token, pin)
        except Exception:
            await self._handle_error("Failed to set PIN!", False, False)

    async def unlock_with_pin(self, pin: str):
        try:
            await self._expire_pin_if_needed()
            decky.logger.info("Unlocking vault with PIN")
            return await asyncio.wait_for(self.pm.unlock_with_pin(pin), 120)
        except Exception:
            await self._handle_error("Failed to unlock with PIN!", False, False)

    async def lock_vault(self):
        """User-requested lock: PIN lock when a PIN is set, else full lock."""
        decky.logger.info("Locking vault")
        try:
            await asyncio.wait_for(self.pm.lock(), 30)
        except Exception:
            decky.logger.error("Failed to lock vault!")
        return self.pm.is_pin_locked()

    async def close_password_manager(self):
        decky.logger.info("Locking vault")
        try:
            await asyncio.wait_for(self.pm.close(), 30)
        except Exception:
            decky.logger.error("Failed to lock vault!")

    async def touch(self, security_token: str):
        """Called when the plugin panel is opened, so browsing counts as activity."""
        try:
            self.pm._validate_security_token(security_token)
        except Exception:
            await self._handle_error("Invalid session!", False, False)

    def _auto_lock_minutes(self) -> int:
        value = self.settings.getSetting("autoLockMinutes", DEFAULT_AUTO_LOCK_MINUTES)
        return value if value in AUTO_LOCK_CHOICES else DEFAULT_AUTO_LOCK_MINUTES

    async def get_auto_lock_minutes(self):
        return self._auto_lock_minutes()

    async def set_auto_lock_minutes(self, minutes: int):
        if minutes not in AUTO_LOCK_CHOICES:
            raise ValueError("Unsupported auto-lock delay")
        self.settings.setSetting("autoLockMinutes", minutes)
        self.settings.commit()
        # Restart the countdown so a shorter delay doesn't lock immediately
        self.pm.touch()

    async def _auto_lock_loop(self):
        while True:
            await asyncio.sleep(AUTO_LOCK_CHECK_SECONDS)
            try:
                minutes = self._auto_lock_minutes()
                if minutes and self.pm.is_open() and self.pm.idle_seconds() >= minutes * 60:
                    decky.logger.info(f"Auto-locking vault after {minutes} min of inactivity")
                    pin_locked = await self.lock_vault()
                    await decky.emit("vault_auto_locked", pin_locked)
                await self._expire_pin_if_needed()
            except Exception:
                decky.logger.error("Auto-lock check failed", exc_info=True)

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
        self.settings = SettingsManager(name="settings", settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR)
        self.settings.read()
        self._auto_lock_task = asyncio.get_event_loop().create_task(self._auto_lock_loop())
        decky.logger.info("Done loading DeckWarden")

    async def _unload(self):
        decky.logger.info("Unloaded DeckWarden")
        if self._auto_lock_task:
            self._auto_lock_task.cancel()
        await self.close_password_manager()

    async def _uninstall(self):
        decky.logger.info("Uninstalled DeckWarden")

    async def _migration(self):
        decky.logger.info("Migrated DeckWarden")
