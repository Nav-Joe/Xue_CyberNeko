# -*- coding: utf-8 -*-
"""引擎运行时隔离：不污染 Qwen 配置与 app_config。"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from app_config.voice_config import TtsRequest
from engines.runtime_isolation import (
    prepare_bert_vits2_runtime,
    prepare_qwen_runtime,
    purge_bert_vits2_modules,
    release_engine_runtime,
)

BASE_DIR = Path(__file__).resolve().parent.parent
QWEN_CONFIG = BASE_DIR / "qwen_config.json"


class RuntimeIsolationTest(unittest.TestCase):
    def test_purge_does_not_remove_app_config(self) -> None:
        import app_config.voice_config as voice_config

        sys.modules["config"] = object()
        sys.modules["text.fake"] = object()
        purge_bert_vits2_modules()
        self.assertIn("app_config.voice_config", sys.modules)
        self.assertIs(sys.modules["app_config.voice_config"], voice_config)
        self.assertNotIn("config", sys.modules)
        self.assertNotIn("text.fake", sys.modules)

    def test_prepare_qwen_keeps_qwen_config_file(self) -> None:
        if not QWEN_CONFIG.is_file():
            self.skipTest("qwen_config.json missing")
        before = QWEN_CONFIG.read_text(encoding="utf-8")
        prepare_qwen_runtime(use_clone=False)
        after = QWEN_CONFIG.read_text(encoding="utf-8")
        self.assertEqual(before, after)
        json.loads(after)

    def test_prepare_bert_clears_qwen_clone_env(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "QWEN_USE_CLONE": "1",
                "HF_HUB_OFFLINE": "1",
            },
            clear=False,
        ):
            prepare_bert_vits2_runtime()
            self.assertIsNone(__import__("os").environ.get("QWEN_USE_CLONE"))
            self.assertIsNone(__import__("os").environ.get("HF_HUB_OFFLINE"))

    def test_tts_request_model_still_importable(self) -> None:
        release_engine_runtime()
        prepare_qwen_runtime()
        req = TtsRequest(text="你好")
        self.assertEqual(req.text, "你好")


if __name__ == "__main__":
    unittest.main()
