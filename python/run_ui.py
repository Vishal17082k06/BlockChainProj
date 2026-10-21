"""Start the Witness console: the API, plus the built frontend if it exists.

Run (from python/):
    .\\.venv\\Scripts\\python.exe run_ui.py
Then open http://127.0.0.1:8000 in your browser.

Build the frontend once with `npm run build` inside frontend/. While developing the frontend, run
this for the API and `npm run dev` in frontend/ for the live-reloading app at http://127.0.0.1:5173.
"""
import uvicorn

import settings
from api.app import create_app

HOST, PORT = "127.0.0.1", 8000          # localhost only: the Attack lab must never be reachable from outside
FRONTEND_DIST = settings.PROJECT_ROOT / "frontend" / "dist"


def main():
    if FRONTEND_DIST.exists():
        print(f"Witness console: http://{HOST}:{PORT}")
    else:
        print(f"API only: http://{HOST}:{PORT}/api/docs")
        print("The frontend is not built yet. Run `npm run build` in frontend/, or `npm run dev` "
              "for development at http://127.0.0.1:5173.")
    uvicorn.run(create_app(static_dir=FRONTEND_DIST), host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
