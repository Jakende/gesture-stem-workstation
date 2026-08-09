from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

SAFE_NAME = re.compile(r"[^a-zA-Z0-9._ -]+")
ALLOWED_SUFFIXES = {".wav", ".mp3", ".flac", ".m4a"}


@dataclass(frozen=True)
class StoredAsset:
    asset_id: str
    filename: str
    sha256: str
    path: Path
    size: int


class AssetStore:
    def __init__(self, root: Path, max_upload_bytes: int = 1_000_000_000) -> None:
        self.root = root.resolve()
        self.max_upload_bytes = max_upload_bytes

    async def save(self, project_id: str, upload: UploadFile) -> StoredAsset:
        filename = Path(upload.filename or "upload").name
        suffix = Path(filename).suffix.lower()
        if suffix not in ALLOWED_SUFFIXES:
            raise ValueError("Unsupported audio type. Use WAV, MP3, FLAC or M4A.")

        safe_filename = SAFE_NAME.sub("_", filename)
        target_dir = (self.root / "projects" / project_id / "assets" / "originals").resolve()
        if self.root not in target_dir.parents:
            raise ValueError("Invalid project path.")
        target_dir.mkdir(parents=True, exist_ok=True)

        temporary = target_dir / f".{safe_filename}.upload"
        digest = hashlib.sha256()
        size = 0
        try:
            with temporary.open("wb") as destination:
                while chunk := await upload.read(1024 * 1024):
                    size += len(chunk)
                    if size > self.max_upload_bytes:
                        raise ValueError("Audio file exceeds the 1 GB local upload limit.")
                    digest.update(chunk)
                    destination.write(chunk)
            sha256 = digest.hexdigest()
            asset_id = f"asset_{sha256[:20]}"
            target = target_dir / f"{asset_id}{suffix}"
            if not target.exists():
                temporary.replace(target)
            else:
                temporary.unlink()
            return StoredAsset(asset_id, filename, sha256, target, size)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

    def resolve(self, project_id: str, asset_id: str) -> Path:
        if not project_id.replace("-", "").replace("_", "").isalnum():
            raise ValueError("Invalid project identifier.")
        if not asset_id.startswith("asset_") or not asset_id[6:].isalnum():
            raise ValueError("Invalid asset identifier.")
        originals = (self.root / "projects" / project_id / "assets" / "originals").resolve()
        if self.root not in originals.parents:
            raise ValueError("Invalid asset path.")
        matches = list(originals.glob(f"{asset_id}.*"))
        if len(matches) != 1:
            raise FileNotFoundError(asset_id)
        return matches[0].resolve()
