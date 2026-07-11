from services.runtime_state import AppRuntime, get_runtime


def runtime_dep() -> AppRuntime:
    """FastAPI Depends 注入点；P2a 起路由使用。"""
    return get_runtime()
