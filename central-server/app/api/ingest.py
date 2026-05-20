from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
import base64
import uuid
import os

from ..services.kafka_producer import get_kafka_producer
from ..services.kiosk_registry import get_kiosk_registry

router = APIRouter()

class FrameData(BaseModel):
    kiosk_id: str
    session_id: str
    frame: str  # base64 encoded JPEG
    timestamp: datetime

@router.post("/frame")
async def ingest_frame(frame_data: FrameData):
    """
    Receive video frame from kiosk client agent
    Pushes to Kafka for async processing
    """
    try:
        registry = get_kiosk_registry()
        if not registry or not registry.is_recording_session(frame_data.kiosk_id, frame_data.session_id):
            raise HTTPException(
                status_code=409,
                detail=f"Session {frame_data.session_id} is not active for kiosk {frame_data.kiosk_id}"
            )

        producer = get_kafka_producer()
        
        # Decode base64 frame and save temporarily
        frame_bytes = base64.b64decode(frame_data.frame)
        frame_id = f"{frame_data.kiosk_id}_{frame_data.session_id}_{uuid.uuid4().hex}"
        
        # Send to Kafka topic "video-frames"
        await producer.send("video-frames", {
            "frame_id": frame_id,
            "kiosk_id": frame_data.kiosk_id,
            "session_id": frame_data.session_id,
            "frame_bytes": frame_bytes.hex(),  # Convert to hex for JSON
            "timestamp": frame_data.timestamp.isoformat()
        })
        
        return {"status": "queued", "frame_id": frame_id}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
