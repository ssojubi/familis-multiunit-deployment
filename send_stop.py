import asyncio
import websockets
import json
import socket

KIOSK_ID = socket.gethostname()

async def stop():
    uri = f"ws://localhost:8000/ws/kiosk/{KIOSK_ID}"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"type": "stop_session"}))
        response = await ws.recv()
        print("Response:", response)

asyncio.run(stop())