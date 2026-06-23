"""供 bat 脚本读取 tts_voice/config.yaml 中的 engine 名。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tts_voice"))

from tts_config import read_engine_name  # noqa: E402


def main() -> int:
    if "--labeled" in sys.argv:
        print(f"  engine = {read_engine_name()}")
    else:
        print(read_engine_name())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
