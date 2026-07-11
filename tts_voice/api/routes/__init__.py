from api.routes.cache_tts import router as cache_tts_router
from api.routes.system import router as system_router
from api.routes.voice_forge import router as voice_forge_router

__all__ = ["system_router", "voice_forge_router", "cache_tts_router"]
