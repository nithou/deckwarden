import asyncio
import hashlib
import os
import stat
import zipfile
from logging import Logger

# Pinned Bitwarden CLI (OSS build). Update version AND checksum together.
BW_VERSION = "2026.10.1"
BW_ZIP_NAME = f"bw-oss-linux-{BW_VERSION}.zip"
BW_URL = f"https://github.com/bitwarden/clients/releases/download/cli-v{BW_VERSION}/{BW_ZIP_NAME}"
BW_SHA256 = "53384064abe7555039281bc2e6fe51846368ba60db9b7ba89de183409d7f6738"


class BwInstaller:

    logger: Logger

    install_state: str = "initial"

    def __init__(self, logger: Logger, bin_dir: str):
        self.logger = logger
        self.bin_dir = bin_dir
        self.bw_path = os.path.join(bin_dir, "bw")

    def _sha256(self, path: str) -> str:
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    async def _download(self, target: str):
        # curl is used instead of urllib because the Python bundled with Decky
        # may not find the system CA bundle.
        process = await asyncio.create_subprocess_exec(
            "curl", "-fsSL", "--retry", "3", "-o", target, BW_URL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "LD_LIBRARY_PATH": ""},
        )
        _, stderr = await process.communicate()
        if process.returncode != 0:
            raise ValueError(f"Download failed: {stderr.decode(errors='replace')}")

    def _extract(self, zip_path: str):
        with zipfile.ZipFile(zip_path) as zf:
            data = zf.read("bw")
        tmp_path = self.bw_path + ".tmp"
        with open(tmp_path, "wb") as f:
            f.write(data)
        os.chmod(tmp_path, stat.S_IRWXU)
        os.replace(tmp_path, self.bw_path)

    async def install(self):
        self.install_state = "installing"
        os.makedirs(self.bin_dir, exist_ok=True)
        zip_path = os.path.join(self.bin_dir, BW_ZIP_NAME)

        try:
            self.logger.info(f"Downloading Bitwarden CLI {BW_VERSION}")
            await self._download(zip_path)

            checksum = await asyncio.to_thread(self._sha256, zip_path)
            if checksum != BW_SHA256:
                raise ValueError(f"Checksum mismatch: expected {BW_SHA256}, got {checksum}")

            await asyncio.to_thread(self._extract, zip_path)
            self.logger.info("Bitwarden CLI installed successfully")
            self.install_state = "done"
        except Exception:
            self.install_state = "error"
            self.logger.error("Failed to install Bitwarden CLI", exc_info=True)
            raise
        finally:
            if os.path.exists(zip_path):
                os.remove(zip_path)
