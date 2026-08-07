"""端口候选探测（CONTRACT §2.1：8767→8772）。"""

from __future__ import annotations

import socket
from pathlib import Path

# 与 CONTRACT 固定顺序一致；禁止静默改用随机高位端口
STT_PORT_CANDIDATES: tuple[int, ...] = (8767, 8768, 8769, 8770, 8771, 8772)

HOST = "127.0.0.1"


def find_free_port(host: str = HOST, candidates: tuple[int, ...] = STT_PORT_CANDIDATES) -> int:
    """返回第一个可在 host 上 bind 的端口；全部失败则抛 RuntimeError。"""
    tried: list[int] = []
    for port in candidates:
        tried.append(port)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, port))
            except OSError:
                continue
            return port
    raise RuntimeError(
        "No free STT port in candidates "
        f"{list(candidates)} (tried={tried}). Close the conflicting process and retry."
    )


def write_port_file(port: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{port}\n", encoding="utf-8")
