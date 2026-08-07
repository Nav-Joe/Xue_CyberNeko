"""Download SenseVoice int8 for stt_service into .runtime/stt-models/ (not committed)."""

from __future__ import annotations

import sys
import tarfile
import urllib.error
import urllib.request
from pathlib import Path

MODEL_DIR_NAME = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09"
ARCHIVE_NAME = f"{MODEL_DIR_NAME}.tar.bz2"
OFFICIAL_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/" + ARCHIVE_NAME
)
# Prefer mirrors in CN; fall back to GitHub last (same idea as llama zip).
MIRROR_PREFIXES = (
    "https://ghproxy.net/",
    "https://mirror.ghproxy.com/",
)
MIN_MODEL_BYTES = 100 * 1024 * 1024  # truncated download guard


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def model_ready(model_dir: Path) -> bool:
    tokens = model_dir / "tokens.txt"
    model = model_dir / "model.int8.onnx"
    if not model.is_file():
        model = model_dir / "model.onnx"
    if not tokens.is_file() or not model.is_file():
        return False
    return model.stat().st_size >= MIN_MODEL_BYTES


def candidate_urls() -> list[str]:
    mirrored = [f"{prefix}{OFFICIAL_URL}" for prefix in MIRROR_PREFIXES]
    return [*mirrored, OFFICIAL_URL]


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".partial")
    if partial.exists():
        partial.unlink()
    print(f"[stt-models] GET {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Xue_CyberNeko-stt-setup"})
    with urllib.request.urlopen(req, timeout=120) as resp, partial.open("wb") as out:
        total = resp.headers.get("Content-Length")
        total_n = int(total) if total and total.isdigit() else None
        done = 0
        last_pct = -1
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if total_n:
                pct = min(100, done * 100 // total_n)
                if pct != last_pct and pct % 5 == 0:
                    print(f"[stt-models] {pct}% ({done // (1024 * 1024)} MB)")
                    last_pct = pct
    partial.replace(dest)


def extract_archive(archive: Path, dest_parent: Path) -> None:
    print(f"[stt-models] extract -> {dest_parent}")
    with tarfile.open(archive, "r:bz2") as tar:
        # Python 3.12+ has filter=; 3.10 needs plain extractall
        tar.extractall(path=dest_parent)


def main() -> int:
    root = repo_root()
    models_root = root / ".runtime" / "stt-models"
    target = models_root / MODEL_DIR_NAME
    if model_ready(target):
        print(f"[stt-models] already ready: {target}")
        return 0

    archive = models_root / ARCHIVE_NAME
    last_err: Exception | None = None
    for url in candidate_urls():
        try:
            download(url, archive)
            last_err = None
            break
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = exc
            print(f"[stt-models] failed: {exc}")
            if archive.exists():
                archive.unlink(missing_ok=True)
            continue

    if last_err is not None or not archive.is_file():
        print("[stt-models] all download sources failed.", file=sys.stderr)
        print(f"[stt-models] official URL: {OFFICIAL_URL}", file=sys.stderr)
        return 1

    try:
        extract_archive(archive, models_root)
    except (OSError, tarfile.TarError) as exc:
        print(f"[stt-models] extract failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if archive.exists():
            archive.unlink(missing_ok=True)

    if not model_ready(target):
        print(f"[stt-models] missing files under {target}", file=sys.stderr)
        return 1

    print(f"[stt-models] ready: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
