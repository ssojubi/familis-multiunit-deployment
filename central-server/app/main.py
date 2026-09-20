from contextlib import asynccontextmanager
import asyncio
import time

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from fastapi.responses import JSONResponse, Response

from .api import commands, dashboard, ingest
from .services.kafka_producer import KafkaProducerService, set_kafka_producer
from .services.kiosk_registry import KioskRegistry, set_kiosk_registry
from .metrics import CONNECTED_KIOSKS, INGEST_REQUESTS, INGEST_REQUEST_SECONDS


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

    try:
        yield
    finally:
        if kafka_producer:
            await kafka_producer.stop()


app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def observe_ingest(request: Request, call_next):
    if request.url.path != "/api/ingest/frame":
        return await call_next(request)
    started = time.monotonic()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        INGEST_REQUESTS.labels(status_class=f"{status // 100}xx").inc()
        INGEST_REQUEST_SECONDS.observe(time.monotonic() - started)

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
    broker_ready = await kafka_producer.check_broker() if kafka_producer else False
    return JSONResponse(status_code=200 if broker_ready else 503, content={
        "status": "ok" if broker_ready else "degraded",
        "kiosks_connected": kiosk_registry.count(),
        "kafka_ready": broker_ready,
    })


@app.get("/metrics", include_in_schema=False)
async def metrics():
    CONNECTED_KIOSKS.set(kiosk_registry.count())
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
