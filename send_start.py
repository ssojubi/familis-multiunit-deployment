import asyncio
import websockets
import json
import socket

KIOSK_ID = socket.gethostname()

async def start():
    uri = f"ws://localhost:8000/ws/kiosk/{KIOSK_ID}"
    print(f"Connecting to {uri}")
    async with websockets.connect(uri) as ws:
        # Send start command
        await ws.send(json.dumps({
            "type": "start_session",
            "session_id": "test-001",
            "food_name": "Potato Bites"
        }))
        # Wait for response from agent
        response = await ws.recv()
        print("Response:", response)

asyncio.run(start())