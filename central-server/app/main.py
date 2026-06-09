from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .api import commands, dashboard, ingest
from .services.kafka_consumer import start_fer_consumer
from .services.kafka_producer import KafkaProducerService, set_kafka_producer
from .services.kiosk_registry import KioskRegistry, set_kiosk_registry


kafka_producer = None
kiosk_registry = KioskRegistry()
set_kiosk_registry(kiosk_registry)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global kafka_producer

    for attempt in range(1, 31):
        try:
            kafka_producer = KafkaProducerService()
            await kafka_producer.start()
            set_kafka_producer(kafka_producer)
            print("Kafka producer ready")
            break
        except Exception as e:
            print(f"Kafka not ready ({attempt}/30): {e}")
            await asyncio.sleep(2)
    else:
        raise RuntimeError("Kafka unavailable after retrying")

    consumer_task = asyncio.create_task(start_fer_consumer())

    try:
        yield
    finally:
        consumer_task.cancel()
        try:
            await consumer_task
        except asyncio.CancelledError:
            pass

        if kafka_producer:
            await kafka_producer.stop()


app = FastAPI(lifespan=lifespan)

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
        kiosk_registry.unregister(kiosk_id, websocket)
    except Exception as e:
        print(f"WebSocket error for {kiosk_id}: {e}")
        kiosk_registry.unregister(kiosk_id, websocket)


app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(commands.router, prefix="/api/commands", tags=["commands"])


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "kiosks_connected": kiosk_registry.count(),
        "kafka_ready": kafka_producer.is_ready() if kafka_producer else False,
    }
