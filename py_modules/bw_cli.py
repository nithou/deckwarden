import asyncio
import json
import os
from logging import Logger


class BwCliError(Exception):
    pass


class BwCli:
    """
    Thin wrapper around the Bitwarden CLI binary.

    Secrets (API key, master password, session key) are only ever passed via
    environment variables of the child process, never via argv, so they do not
    show up in the process list.
    """

    logger: Logger

    def __init__(self, logger: Logger, bw_path: str, data_dir: str, ca_cert_path: str):
        self.logger = logger
        self.bw_path = bw_path
        self.data_dir = data_dir
        self.ca_cert_path = ca_cert_path
        # bw stores its state in a single data.json; serialize all calls.
        self._lock = asyncio.Lock()

    def _env(self, extra_env: dict[str, str] | None):
        env = {k: v for k, v in os.environ.items() if not k.startswith("BW_")}
        env.update({
            "LD_LIBRARY_PATH": "",
            "BITWARDENCLI_APPDATA_DIR": self.data_dir,
            "BW_NOINTERACTION": "true",
        })
        if os.path.isfile(self.ca_cert_path):
            env["NODE_EXTRA_CA_CERTS"] = self.ca_cert_path
        if extra_env:
            env.update(extra_env)
        return env

    async def _run(self, args: list[str], extra_env: dict[str, str] | None = None, timeout: float = 30) -> str:
        os.makedirs(self.data_dir, exist_ok=True)
        async with self._lock:
            process = await asyncio.create_subprocess_exec(
                self.bw_path, *args, "--nointeraction",
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                close_fds=True,
                env=self._env(extra_env),
            )
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                raise BwCliError(f"(bw {args[0]}: timed out)")

        if process.returncode != 0:
            # stderr never contains secrets we passed in; safe to log.
            lines = [l.strip() for l in stderr.decode(errors="replace").splitlines() if l.strip()]
            detail = lines[-1][:200] if lines else f"exit code {process.returncode}"
            raise BwCliError(f"(bw {args[0]}: {detail})")

        return stdout.decode()

    def is_setup(self) -> bool:
        return os.path.isfile(self.bw_path) and os.access(self.bw_path, os.X_OK)

    async def status(self, session: str | None = None) -> dict:
        extra = {"BW_SESSION": session} if session else None
        return json.loads(await self._run(["status"], extra))

    async def set_server(self, url: str):
        status = await self.status()
        if status.get("status") != "unauthenticated":
            await self.logout()
        await self._run(["config", "server", url])

    async def login_apikey(self, client_id: str, client_secret: str):
        await self._run(
            ["login", "--apikey"],
            {"BW_CLIENTID": client_id, "BW_CLIENTSECRET": client_secret},
            timeout=60,
        )

    async def logout(self):
        await self._run(["logout"])

    async def unlock(self, password: str) -> str:
        session = await self._run(
            ["unlock", "--passwordenv", "BW_PASSWORD", "--raw"],
            {"BW_PASSWORD": password},
            timeout=60,
        )
        session = session.strip()
        if not session:
            raise BwCliError("(bw unlock: no session key returned)")
        return session

    async def sync(self, session: str):
        await self._run(["sync"], {"BW_SESSION": session}, timeout=60)

    async def list_items(self, session: str) -> list[dict]:
        return json.loads(await self._run(["list", "items"], {"BW_SESSION": session}, timeout=60))

    async def list_folders(self, session: str) -> list[dict]:
        return json.loads(await self._run(["list", "folders"], {"BW_SESSION": session}))

    async def lock(self):
        await self._run(["lock"])
