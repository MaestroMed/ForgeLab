"""Video upload endpoint for web browser clients (no local filesystem access)."""

import logging
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Max upload size: 10 GB
MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024

# Allowed video MIME types
ALLOWED_MIME = {
    "video/mp4", "video/x-matroska", "video/avi", "video/quicktime",
    "video/x-msvideo", "video/webm", "video/mpeg", "video/x-flv",
    "video/x-ms-wmv", "application/octet-stream",  # some browsers use this
}


@router.post("")
async def upload_video(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    channel_name: str = Form(default=""),
):
    """
    Upload a video file from a web browser.

    Accepts multipart/form-data with a 'file' field.
    Returns a source_path that can be used with /ingest.

    Max size: 10 GB. Supported formats: mp4, mkv, avi, mov, webm.
    """
    # Validate MIME type (browsers sometimes send wrong type, so we check extension too)
    content_type = file.content_type or ""
    filename = file.filename or "upload.mp4"
    ext = Path(filename).suffix.lower()

    if ext not in {".mp4", ".mkv", ".avi", ".mov", ".webm", ".mpeg", ".mpg", ".flv", ".wmv"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension: {ext}. Use mp4, mkv, avi, mov or webm."
        )

    # Destination
    uploads_dir = settings.LIBRARY_PATH / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    upload_id = str(uuid.uuid4())
    dest_path = uploads_dir / f"{upload_id}{ext}"

    # Stream to disk
    total_bytes = 0
    try:
        async with aiofiles.open(dest_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)  # 1 MB chunks
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    await out.close()
                    dest_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File too large (max 10 GB)")
                await out.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        dest_path.unlink(missing_ok=True)
        logger.error("Upload failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    logger.info("Uploaded %s → %s (%.1f MB)", filename, dest_path, total_bytes / 1e6)

    return JSONResponse({
        "upload_id": upload_id,
        "source_path": str(dest_path),
        "filename": filename,
        "size_bytes": total_bytes,
        "size_mb": round(total_bytes / 1e6, 1),
        "message": "Upload successful. Use source_path with POST /v1/projects to create a project.",
    })


@router.delete("/{upload_id}")
async def delete_upload(upload_id: str):
    """Delete a pending upload file."""
    # Security: upload_id must be a UUID
    try:
        uuid.UUID(upload_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid upload_id")

    uploads_dir = settings.LIBRARY_PATH / "uploads"
    for ext in [".mp4", ".mkv", ".avi", ".mov", ".webm", ".mpeg", ".mpg", ".flv", ".wmv"]:
        path = uploads_dir / f"{upload_id}{ext}"
        if path.exists():
            path.unlink()
            return {"deleted": True, "upload_id": upload_id}

    raise HTTPException(status_code=404, detail="Upload not found")
