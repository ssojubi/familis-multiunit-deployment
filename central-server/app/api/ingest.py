from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from datetime import datetime
import base64
import binascii
import uuid
import os

from ..services.kafka_producer import get_kafka_producer
from ..services.kiosk_registry import get_kiosk_registry

router = APIRouter()

class FrameData(BaseModel):
    kiosk_id: str
    session_id: str
    frame: str
    timestamp: datetime

@router.post("/frame")
async def ingest_frame(
    frame_data: FrameData,
    internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
):
    """
    Receive video frame from a browser kiosk
    Pushes to Kafka for async processing
    """
    try:
        expected_token = os.getenv("INTERNAL_API_TOKEN", "")
        trusted_internal_request = bool(
            expected_token and internal_token == expected_token
        )
        registry = get_kiosk_registry()
        if not trusted_internal_request and (
            not registry
            or not registry.is_recording_session(
                frame_data.kiosk_id, frame_data.session_id
            )
        ):
            raise HTTPException(
                status_code=409,
                detail=f"Session {frame_data.session_id} is not active for kiosk {frame_data.kiosk_id}"
            )

        producer = get_kafka_producer()
        
        try:
            frame_bytes = base64.b64decode(frame_data.frame, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise HTTPException(status_code=400, detail="Invalid base64 frame") from exc
        if not frame_bytes:
            raise HTTPException(status_code=400, detail="Frame is empty")
        if len(frame_bytes) > 2 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Frame exceeds 2 MiB")

        frame_id = uuid.uuid4().hex

        await producer.send(
            "video-frames",
            {
                "frame_id": frame_id,
                "kiosk_id": frame_data.kiosk_id,
                "session_id": frame_data.session_id,
                "frame_bytes": frame_bytes.hex(),
                "timestamp": frame_data.timestamp.isoformat(),
            },
            key=f"{frame_data.kiosk_id}:{frame_data.session_id}",
        )
        
        return {"status": "queued", "frame_id": frame_id}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
