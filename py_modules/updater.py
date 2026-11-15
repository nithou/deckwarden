import asyncio
import json
import os
import re
import time
from logging import Logger

REPO = "nithou/deckwarden"
ASSET_NAME = "DeckWarden.zip"
LATEST_RELEASE_API = f"https://api.github.com/repos/{REPO}/releases/latest"
DOWNLOAD_PREFIX = f"https://github.com/{REPO}/releases/download/"
CACHE_SECONDS = 60 * 60

_VERSION = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


def parse_version(value: str) -> tuple[int, int, int] | None:
    match = _VERSION.match(value.strip())
    return tuple(int(p) for p in match.groups()) if match else None


class Updater:
    """Checks the latest GitHub release; installing is left to Decky's installer."""

    def __init__(self, logger: Logger, current_version: str):
        self.logger = logger
        self.current_version = current_version
        self._cached: dict | None = None
        self._checked_at = 0.0

    async def _fetch_latest_release(self) -> dict:
        # curl instead of urllib: Decky's bundled Python may lack the CA bundle
        process = await asyncio.create_subprocess_exec(
            "curl", "-fsSL", "--max-time", "20",
            "-H", "Accept: application/vnd.github+json",
            "-H", "User-Agent: DeckWarden-updater",
            LATEST_RELEASE_API,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "LD_LIBRARY_PATH": ""},
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise ValueError(f"Update check failed: {stderr.decode(errors='replace').strip()}")
        return json.loads(stdout)

    def _to_update(self, release: dict) -> dict | None:
        latest = parse_version(release.get("tag_name", ""))
        current = parse_version(self.current_version)
        if latest is None or current is None or latest <= current:
            return None

        asset = next((a for a in release.get("assets", []) if a.get("name") == ASSET_NAME), None)
        if asset is None:
            return None

        url = asset.get("browser_download_url", "")
        digest = (asset.get("digest") or "").removeprefix("sha256:")
        # Only ever hand our own release asset, with a checksum Decky will
        # verify, to the installer.
        if not url.startswith(DOWNLOAD_PREFIX) or not _SHA256.match(digest):
            self.logger.warning("Latest release asset has unexpected URL or no SHA-256; ignoring")
            return None

        return {
            "version": ".".join(str(p) for p in latest),
            "url": url,
            "sha256": digest,
            "release_url": release.get("html_url", ""),
        }

    async def check(self, force: bool = False) -> dict | None:
        if not force and self._checked_at and time.time() - self._checked_at < CACHE_SECONDS:
            return self._cached

        release = await self._fetch_latest_release()
        self._cached = self._to_update(release)
        self._checked_at = time.time()
        return self._cached
