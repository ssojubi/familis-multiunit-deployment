import json
import socket
import urllib.request

KIOSK_ID = socket.gethostname()
CENTRAL_SERVER_HTTP = "http://localhost:8000"

payload = {
    "kiosk_id": KIOSK_ID,
    "session_id": "test-001"
}

request = urllib.request.Request(
    f"{CENTRAL_SERVER_HTTP}/api/commands/stop",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

with urllib.request.urlopen(request, timeout=10) as response:
    print(response.read().decode("utf-8"))
