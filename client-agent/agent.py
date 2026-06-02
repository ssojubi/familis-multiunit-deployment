#!/usr/bin/env python3
"""
Kiosk Client Agent - Stable version with aiohttp
- Non-blocking HTTP frame uploads
- WebSocket heartbeat and automatic reconnection
- Proper session cleanup
"""

import asyncio
import websockets
import json
import cv2
import base64
import socket
import logging
import aiohttp
import os
import platform
import time
from datetime import datetime
from websockets.exceptions import ConnectionClosed

# ========== CONFIGURATION ==========
CENTRAL_SERVER_HTTP = os.getenv("CENTRAL_SERVER_HTTP", "http://localhost:8000")
CENTRAL_SERVER_WS = os.getenv(
    "CENTRAL_SERVER_WS",
    CENTRAL_SERVER_HTTP.replace("http://", "ws://").replace("https://", "wss://"),
)
KIOSK_ID = os.getenv("KIOSK_ID", "kiosk-01")
WEBCAM_ID = os.getenv("WEBCAM_ID", "auto").lower()
CAMERA_SCAN_MAX_INDEX = int(os.getenv("CAMERA_SCAN_MAX_INDEX", "5"))
FPS = 30
CAMERA_BACKEND = os.getenv("CAMERA_BACKEND", "auto").lower()
WS_HEARTBEAT_INTERVAL = 5
WS_PING_INTERVAL = 20
WS_PING_TIMEOUT = 30
SHOW_PREVIEW = os.getenv("SHOW_PREVIEW", "1") != "0"
PREVIEW_WINDOW_NAME = "Kiosk Agent Camera"
WARM_CAMERA_ON_CONNECT = os.getenv("WARM_CAMERA_ON_CONNECT", "0") != "0"
# ====================================

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class KioskAgent:
    def __init__(self):
        self.websocket = None
        self.is_recording = False
        self.current_session_id = None
        self.cap = None
        self.running = True
        self.session = None  # aiohttp session
        self.heartbeat_task = None
        self.frame_task = None
        self.websocket_send_lock = asyncio.Lock()
        self.frames_uploaded = 0
        self.camera_open_lock = asyncio.Lock()
        self.camera_warmup_task = None
        self.preview_initialized = False

    async def connect_websocket(self):
        """Maintain WebSocket connection with automatic reconnection"""
        while self.running:
            ws = None
            try:
                uri = f"{CENTRAL_SERVER_WS}/ws/kiosk/{KIOSK_ID}"
                logger.info(f"Connecting to {uri}")
                async with websockets.connect(
                    uri,
                    ping_interval=WS_PING_INTERVAL,
                    ping_timeout=WS_PING_TIMEOUT,
                    close_timeout=5,
                    max_queue=16
                ) as ws:
                    self.websocket = ws
                    await self.register()
                    if WARM_CAMERA_ON_CONNECT and not self.camera_warmup_task:
                        self.camera_warmup_task = asyncio.create_task(
                            self.ensure_camera_open("warming up camera")
                        )
                    await self.resume_active_session()
                    self.heartbeat_task = asyncio.create_task(self.send_heartbeat(ws))
                    async for message in ws:
                        await self.handle_command(message)
            except ConnectionClosed as e:
                logger.warning(f"WebSocket closed: code={e.code} reason={e.reason}")
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
            finally:
                if self.heartbeat_task:
                    self.heartbeat_task.cancel()
                    try:
                        await self.heartbeat_task
                    except asyncio.CancelledError:
                        pass
                    self.heartbeat_task = None
                if self.websocket is ws:
                    self.websocket = None
                await asyncio.sleep(5)

    async def send_ws_json(self, payload):
        if not self.websocket:
            raise RuntimeError("WebSocket is not connected")

        async with self.websocket_send_lock:
            await self.websocket.send(json.dumps(payload))

    async def register(self):
        await self.send_ws_json({
            "type": "register",
            "kiosk_id": KIOSK_ID,
            "ip": socket.gethostbyname(socket.gethostname()),
            "status": "idle"
        })
        logger.info(f"Registered as {KIOSK_ID}")

    async def resume_active_session(self):
        if not self.is_recording or not self.current_session_id:
            return

        await self.send_ws_json({
            "type": "session_started",
            "kiosk_id": KIOSK_ID,
            "session_id": self.current_session_id
        })
        logger.info(f"Resumed active session {self.current_session_id} after reconnect")

    async def send_heartbeat(self, ws):
        while self.websocket is ws and self.running:
            try:
                await self.send_ws_json({
                    "type": "heartbeat",
                    "kiosk_id": KIOSK_ID,
                    "status": "recording" if self.is_recording else "idle"
                })
                await asyncio.sleep(WS_HEARTBEAT_INTERVAL)
            except (ConnectionClosed, asyncio.CancelledError):
                break
            except Exception as e:
                logger.warning(f"Heartbeat failed: {e}")
                break

    async def handle_command(self, message):
        data = json.loads(message)
        cmd = data.get("type")
        logger.info(f"Received command: {cmd} session={data.get('session_id')}")
        if cmd == "start_session":
            await self.start_session(data)
        elif cmd == "stop_session":
            await self.stop_session(data.get("session_id"))

    async def start_session(self, data):
        if self.is_recording:
            return
        self.current_session_id = data.get("session_id")
        logger.info(f"Starting session {self.current_session_id}")

        if not await self.ensure_camera_open("starting camera for session"):
            logger.error("Cannot open webcam")
            self.current_session_id = None
            return

        self.is_recording = True
        logger.info("Webcam ready")

        # Create aiohttp session for non-blocking uploads
        self.session = aiohttp.ClientSession()
        self.frames_uploaded = 0
        self.frame_task = asyncio.create_task(self.send_frames())
        await self.send_ws_json({
            "type": "session_started",
            "kiosk_id": KIOSK_ID,
            "session_id": self.current_session_id
        })

    async def ensure_camera_open(self, reason="opening camera"):
        async with self.camera_open_lock:
            if self.cap and self.cap.isOpened():
                logger.info(f"Webcam already open ({reason})")
                return True

            logger.info(f"{reason.capitalize()} with webcam setting {WEBCAM_ID}")
            self.cap = await asyncio.to_thread(self.open_camera)
            if not self.cap.isOpened():
                self.cap.release()
                self.cap = None
                return False

            if not await asyncio.to_thread(self.camera_has_frames):
                logger.error("Webcam opened but did not return frames")
                self.cap.release()
                self.cap = None
                return False

            logger.info("Webcam opened successfully")
            return True

    def open_camera(self):
        backends = {
            "any": cv2.CAP_ANY,
            "dshow": getattr(cv2, "CAP_DSHOW", cv2.CAP_ANY),
            "msmf": getattr(cv2, "CAP_MSMF", cv2.CAP_ANY),
            "avfoundation": getattr(cv2, "CAP_AVFOUNDATION", cv2.CAP_ANY),
        }
        system = platform.system()
        if CAMERA_BACKEND != "auto":
            backend_names = [CAMERA_BACKEND]
        elif system == "Windows":
            backend_names = ["dshow", "msmf", "any"]
        elif system == "Darwin":
            backend_names = ["avfoundation", "any"]
        else:
            backend_names = ["any"]

        indexes = (
            range(0, CAMERA_SCAN_MAX_INDEX + 1)
            if WEBCAM_ID == "auto"
            else [int(WEBCAM_ID)]
        )

        for index in indexes:
            for backend_name in backend_names:
                backend = backends.get(backend_name, cv2.CAP_ANY)
                logger.info(f"Creating VideoCapture index={index} backend={backend_name}")
                cap = cv2.VideoCapture(index, backend)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    cap.set(cv2.CAP_PROP_FPS, FPS)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    logger.info(f"Selected webcam index={index} backend={backend_name}")
                    return cap
                cap.release()
                logger.warning(f"Webcam index {index} failed with backend={backend_name}")

        return cv2.VideoCapture()

    def camera_has_frames(self):
        logger.info("Waiting for first webcam frame")
        for _ in range(10):
            ret, frame = self.cap.read()
            if ret and frame is not None:
                height, width = frame.shape[:2]
                logger.info(f"Webcam frame received: {width}x{height}")
                return True
            time.sleep(0.1)
        return False

    def read_frame(self):
        if not self.cap:
            return None

        ret, frame = self.cap.read()
        if not ret:
            return None

        return frame

    def show_preview(self, frame):
        if not SHOW_PREVIEW:
            return

        if not self.preview_initialized:
            cv2.namedWindow(PREVIEW_WINDOW_NAME, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(PREVIEW_WINDOW_NAME, 640, 480)
            self.preview_initialized = True

        cv2.imshow(PREVIEW_WINDOW_NAME, frame)
        cv2.waitKey(1)

    def encode_frame(self, frame):
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        return base64.b64encode(buffer).decode('utf-8')

    async def send_frames(self):
        frame_interval = 1.0 / FPS
        retry_count = 0
        try:
            while self.is_recording and self.running:
                start = asyncio.get_event_loop().time()
                frame = await asyncio.to_thread(self.read_frame)
                if frame is None:
                    await asyncio.sleep(0.01)
                    continue
                self.show_preview(frame)
                frame_b64 = await asyncio.to_thread(self.encode_frame, frame)

                # Attempt upload with retries
                uploaded = False
                for attempt in range(3):  # max 3 retries
                    if not self.is_recording:
                        break

                    try:
                        # Recreate session if it's closed or None
                        if self.session is None or self.session.closed:
                            self.session = aiohttp.ClientSession()

                        async with self.session.post(
                            f"{CENTRAL_SERVER_HTTP}/api/ingest/frame",
                            json={
                                "kiosk_id": KIOSK_ID,
                                "session_id": self.current_session_id,
                                "frame": frame_b64,
                                "timestamp": datetime.now().isoformat()
                            },
                            timeout=aiohttp.ClientTimeout(total=2.0)  # increased timeout
                        ) as resp:
                            if resp.status == 200:
                                uploaded = True
                                self.frames_uploaded += 1
                                if self.frames_uploaded == 1:
                                    logger.info("First frame uploaded successfully")
                                retry_count = 0  # reset on success
                                break
                            if resp.status == 409:
                                logger.warning("Server says this session is inactive; stopping frame upload")
                                self.is_recording = False
                                break

                            logger.warning(f"HTTP {resp.status}, retry {attempt+1}")
                    except Exception as e:
                        if not self.is_recording:
                            break
                        logger.error(f"Upload attempt {attempt+1} failed: {e}")
                        # Close and invalidate session to force recreation
                        if self.session:
                            await self.session.close()
                            self.session = None
                        await asyncio.sleep(0.1 * (2 ** attempt))  # exponential backoff

                if not self.is_recording:
                    break

                if not uploaded:
                    retry_count += 1
                    if retry_count > 10:
                        logger.error("Persistent upload failure, aborting session")
                        self.is_recording = False
                        break

                elapsed = asyncio.get_event_loop().time() - start
                sleep = max(0, frame_interval - elapsed)
                await asyncio.sleep(sleep)
        except asyncio.CancelledError:
            pass
        finally:
            logger.info("Frame upload stopped")

    async def stop_session(self, requested_session_id=None):
        if not self.is_recording:
            logger.info(f"Ignoring stop command for {requested_session_id}; agent is already idle")
            return
        if requested_session_id and requested_session_id != self.current_session_id:
            logger.info(
                f"Ignoring stop command for {requested_session_id}; active session is {self.current_session_id}"
            )
            return

        logger.info("Stopping session")
        self.is_recording = False
        if self.frame_task:
            try:
                await asyncio.wait_for(self.frame_task, timeout=2.0)
            except asyncio.TimeoutError:
                logger.warning("Frame upload task did not stop quickly; cancelling")
                self.frame_task.cancel()
                try:
                    await self.frame_task
                except asyncio.CancelledError:
                    pass
            self.frame_task = None
        await asyncio.sleep(0.5)
        try:
            await self.send_ws_json({
                "type": "session_stopped",
                "kiosk_id": KIOSK_ID,
                "session_id": self.current_session_id
            })
        except (ConnectionClosed, RuntimeError):
            logger.warning("Could not send session_stopped because WebSocket is disconnected")

        logger.info("Closing camera")
        if self.cap:
            self.cap.release()
            self.cap = None
            logger.info("Camera closed")
        if SHOW_PREVIEW:
            try:
                logger.info("Closing camera preview")
                cv2.destroyWindow(PREVIEW_WINDOW_NAME)
                cv2.destroyAllWindows()
                cv2.waitKey(1)
                self.preview_initialized = False
                logger.info("Camera preview closed")
            except cv2.error:
                logger.warning("Camera preview was already closed")
                self.preview_initialized = False
        if self.session:
            await self.session.close()
            self.session = None
        self.current_session_id = None

    async def run(self):
        await self.connect_websocket()

if __name__ == "__main__":
    agent = KioskAgent()
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        logger.info("Agent stopped by user")
