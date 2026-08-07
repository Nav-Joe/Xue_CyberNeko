from __future__ import annotations

from stt_service.ports import find_free_port, STT_PORT_CANDIDATES


def test_find_free_port_returns_candidate() -> None:
    port = find_free_port()
    assert port in STT_PORT_CANDIDATES
