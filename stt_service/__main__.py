"""python -m stt_service：探测端口并启动 uvicorn。"""

from __future__ import annotations

import sys
from pathlib import Path

import uvicorn

from stt_service import app as app_module
from stt_service.ports import HOST, find_free_port, write_port_file

_REPO_ROOT = Path(__file__).resolve().parent.parent
_PORT_FILE = _REPO_ROOT / ".runtime" / "stt-server.port"


def main() -> None:
    try:
        port = find_free_port()
    except RuntimeError as exc:
        print(f"[stt_service] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    app_module.bound_port = port
    try:
        write_port_file(port, _PORT_FILE)
        print(f"[stt_service] wrote port file {_PORT_FILE} -> {port}")
    except OSError as exc:
        print(f"[stt_service] warn: could not write port file: {exc}", file=sys.stderr)

    print(f"[stt_service] listening on http://{HOST}:{port}")
    uvicorn.run(app_module.app, host=HOST, port=port, log_level="info")


if __name__ == "__main__":
    main()
