from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.core.config import settings
from app.api.v1 import api_router
from app.core.database import disconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import logging
import os

# Configure concise logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.PROJECT_NAME)
logger.info("BOSQUE API RELOADED AND READY...")

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Set CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Serve static files from frontend/ directory
# Use a path relative to the current file (main.py is in backend/app/)
FRONTEND_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))

if os.path.exists(FRONTEND_PATH):
    app.mount("/static", StaticFiles(directory=FRONTEND_PATH), name="static")
    # Also mount subdirectories for easier access if needed by the index.html relative paths
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_PATH, "js")), name="js")
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_PATH, "css")), name="css")

@app.on_event("shutdown")
def shutdown_event():
    disconnect()

@app.get("/")
async def root():
    index_file = os.path.join(FRONTEND_PATH, "Index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Bosque API is running", "docs": "/docs", "error": "Index.html not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
