"""供 prepare-tts-env.cmd 读取 bert_vits2 在 config.yaml 中的路径。"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE_DIR = ROOT / "tts_voice"
sys.path.insert(0, str(BASE_DIR))

from tts_config import get_engine_config, read_engine_name  # noqa: E402


def _resolve(value: str | None, default: str) -> Path:
    raw = (value or default).strip()
    path = Path(raw)
    if not path.is_absolute():
        path = (BASE_DIR / path).resolve()
    return path


def main() -> int:
    engine = read_engine_name()
    if engine != "bert_vits2":
        print("ENGINE=%s" % engine)
        return 0

    cfg = get_engine_config("bert_vits2")
    config_path = _resolve(cfg.get("config_path"), "config.json")
    model_path = _resolve(cfg.get("model_path"), "G_900.pth")

    root_raw = cfg.get("root")
    if root_raw:
        bert_root = _resolve(str(root_raw), "../Bert-VITS2")
    else:
        env_root = os.environ.get("BERT_VITS2_ROOT", "").strip()
        if env_root:
            bert_root = Path(env_root).resolve()
        else:
            bert_root = (ROOT / "Bert-VITS2").resolve()

    print("ENGINE=bert_vits2")
    print("CONFIG_PATH=%s" % config_path)
    print("MODEL_PATH=%s" % model_path)
    print("BERT_ROOT=%s" % bert_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
