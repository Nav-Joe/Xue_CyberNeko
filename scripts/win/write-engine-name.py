"""供 bat 脚本写入 tts_voice/config.yaml 中的 engine 名。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tts_voice"))

from tts_config import read_engine_name, write_engine_name  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print("[错误] 用法: write-engine-name.py <engine>", file=sys.stderr)
        return 1
    write_engine_name(sys.argv[1])
    print(f"[完成] 已切换为 {read_engine_name()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
