from fastapi import APIRouter, HTTPException, Request
from ..services.kiosk_registry import get_kiosk_registry
import json

router = APIRouter()

@router.post("/start")
async def start_session(request: Request):
    try:
        body = await request.json()
        kiosk_id = body.get("kiosk_id")
        session_id = body.get("session_id")
        food_name = body.get("food_name", "Unknown")
        
        if not kiosk_id or not session_id:
            raise HTTPException(status_code=400, detail="Missing kiosk_id or session_id")
        
        registry = get_kiosk_registry()
        websocket = registry.get_websocket(kiosk_id)
        if not websocket:
            raise HTTPException(status_code=404, detail=f"Kiosk {kiosk_id} not connected")
        
        # Send JSON string via send_text (not send)
        await websocket.send_text(json.dumps({
            "type": "start_session",
            "session_id": session_id,
            "food_name": food_name
        }))
        return {"status": "command_sent", "kiosk_id": kiosk_id, "session_id": session_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stop")
async def stop_session(request: Request):
    try:
        body = await request.json()
        kiosk_id = body.get("kiosk_id")
        session_id = body.get("session_id")
        
        if not kiosk_id or not session_id:
            raise HTTPException(status_code=400, detail="Missing kiosk_id or session_id")
        
        registry = get_kiosk_registry()
        websocket = registry.get_websocket(kiosk_id)
        if not websocket:
            raise HTTPException(status_code=404, detail=f"Kiosk {kiosk_id} not connected")
        
        await registry.set_idle(kiosk_id)
        await websocket.send_text(json.dumps({
            "type": "stop_session",
            "session_id": session_id
        }))
        return {"status": "command_sent", "kiosk_id": kiosk_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/kiosks")
async def list_kiosks():
    registry = get_kiosk_registry()
    return {"kiosks": registry.get_all_status()}
