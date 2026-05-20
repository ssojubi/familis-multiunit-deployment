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
from datetime import datetime

# ========== CONFIGURATION ==========
CENTRAL_SERVER_HTTP = "http://localhost:8000"        # Change to central server IP
KIOSK_ID = socket.gethostname()
WEBCAM_ID = 0
FPS = 30
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

    async def connect_websocket(self):
        """Maintain WebSocket connection with automatic reconnection"""
        while self.running:
            try:
                uri = f"ws://localhost:8000/ws/kiosk/{KIOSK_ID}"
                logger.info(f"Connecting to {uri}")
                async with websockets.connect(uri, ping_interval=10, ping_timeout=5) as ws:
                    self.websocket = ws
                    await self.register()
                    asyncio.create_task(self.send_heartbeat())
                    async for message in ws:
                        await self.handle_command(message)
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                await asyncio.sleep(5)

    async def register(self):
        await self.websocket.send(json.dumps({
            "type": "register",
            "kiosk_id": KIOSK_ID,
            "ip": socket.gethostbyname(socket.gethostname()),
            "status": "idle"
        }))
        logger.info(f"Registered as {KIOSK_ID}")

    async def send_heartbeat(self):
        while self.websocket and self.running:
            try:
                await self.websocket.send(json.dumps({
                    "type": "heartbeat",
                    "kiosk_id": KIOSK_ID,
                    "status": "recording" if self.is_recording else "idle"
                }))
                await asyncio.sleep(5)
            except:
                break

    async def handle_command(self, message):
        data = json.loads(message)
        cmd = data.get("type")
        if cmd == "start_session":
            await self.start_session(data)
        elif cmd == "stop_session":
            await self.stop_session()

    async def start_session(self, data):
        if self.is_recording:
            return
        self.current_session_id = data.get("session_id")
        self.is_recording = True
        logger.info(f"Starting session {self.current_session_id}")

        # Open webcam
        self.cap = cv2.VideoCapture(WEBCAM_ID)
        if not self.cap.isOpened():
            logger.error("Cannot open webcam")
            self.is_recording = False
            return

        # Create aiohttp session for non-blocking uploads
        self.session = aiohttp.ClientSession()
        asyncio.create_task(self.send_frames())
        await self.websocket.send(json.dumps({
            "type": "session_started",
            "kiosk_id": KIOSK_ID,
            "session_id": self.current_session_id
        }))

    async def send_frames(self):
        frame_interval = 1.0 / FPS
        retry_count = 0
        while self.is_recording and self.running:
            start = asyncio.get_event_loop().time()
            ret, frame = self.cap.read()
            if not ret:
                await asyncio.sleep(0.01)
                continue

            # Encode JPEG
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_b64 = base64.b64encode(buffer).decode('utf-8')

            # Attempt upload with retries
            uploaded = False
            for attempt in range(3):  # max 3 retries
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
                            retry_count = 0  # reset on success
                            break
                        else:
                            logger.warning(f"HTTP {resp.status}, retry {attempt+1}")
                except Exception as e:
                    logger.error(f"Upload attempt {attempt+1} failed: {e}")
                    # Close and invalidate session to force recreation
                    if self.session:
                        await self.session.close()
                        self.session = None
                    await asyncio.sleep(0.1 * (2 ** attempt))  # exponential backoff

            if not uploaded:
                retry_count += 1
                if retry_count > 10:
                    logger.error("Persistent upload failure, aborting session")
                    self.is_recording = False
                    break

            elapsed = asyncio.get_event_loop().time() - start
            sleep = max(0, frame_interval - elapsed)
            await asyncio.sleep(sleep)

    async def stop_session(self):
        if not self.is_recording:
            return
        logger.info("Stopping session")
        self.is_recording = False
        await asyncio.sleep(0.5)
        await self.websocket.send(json.dumps({
            "type": "session_stopped",
            "kiosk_id": KIOSK_ID,
            "session_id": self.current_session_id
        }))

    async def run(self):
        await self.connect_websocket()

if __name__ == "__main__":
    agent = KioskAgent()
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        logger.info("Agent stopped by user")