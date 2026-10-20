from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from chain import ChainUnavailable

from . import routes_read
from .networks import build_registry

DEV_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"]


def create_app(registry=None, static_dir=None) -> FastAPI:
    app = FastAPI(title="Witness API", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.registry = registry if registry is not None else build_registry()
    app.add_middleware(CORSMiddleware, allow_origins=DEV_ORIGINS, allow_methods=["*"],
                       allow_headers=["*"])

    @app.exception_handler(ChainUnavailable)
    async def chain_unavailable(request: Request, exc: ChainUnavailable):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    app.include_router(routes_read.router, prefix="/api")

    if static_dir is not None and Path(static_dir).exists():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
    return app
