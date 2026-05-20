from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json
from datetime import datetime

# Import services
from .services.kafka_producer import KafkaProducerService
from .services.kafka_consumer import start_fer_consumer
from .services.kiosk_registry import KioskRegistry
from .api import ingest, dashboard, commands
from .services.kafka_producer import KafkaProducerService, set_kafka_producer
from .services.kiosk_registry import KioskRegistry, set_kiosk_registry

# Global variables
kafka_producer = None
kiosk_registry = KioskRegistry()
set_kiosk_registry(kiosk_registry)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global kafka_producer
    kafka_producer = KafkaProducerService()
    await kafka_producer.start()
    set_kafka_producer(kafka_producer)
    
    # Start FER consumer in background
    asyncio.create_task(start_fer_consumer())
    
    yield
    
    # Shutdown
    await kafka_producer.stop()

app = FastAPI(lifespan=lifespan)

# CORS for React dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws/kiosk/{kiosk_id}")
async def websocket_endpoint(websocket: WebSocket, kiosk_id: str):
    await websocket.accept()
    await kiosk_registry.register(kiosk_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if data["type"] == "heartbeat":
                await kiosk_registry.update_heartbeat(kiosk_id)
            elif data["type"] == "session_started":
                await kiosk_registry.set_recording(kiosk_id, data["session_id"])
            elif data["type"] == "session_stopped":
                await kiosk_registry.set_idle(kiosk_id)
    except WebSocketDisconnect:
        kiosk_registry.unregister(kiosk_id)
    except Exception as e:
        # unexpected errors and clean up
        print(f"WebSocket error for {kiosk_id}: {e}")
        kiosk_registry.unregister(kiosk_id)

# API endpoints
app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(commands.router, prefix="/api/commands", tags=["commands"])

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "kiosks_connected": kiosk_registry.count(),
        "kafka_ready": kafka_producer.is_ready() if kafka_producer else False
    }