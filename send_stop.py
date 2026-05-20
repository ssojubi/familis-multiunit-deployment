import json
import os
import urllib.request
import urllib.error

KIOSK_ID = os.getenv("KIOSK_ID", "kiosk-01")
SESSION_ID = os.getenv("SESSION_ID", "testv5")
CENTRAL_SERVER_HTTP = "http://localhost:8000"

payload = {
    "kiosk_id": KIOSK_ID,
    "session_id": SESSION_ID
}

request = urllib.request.Request(
    f"{CENTRAL_SERVER_HTTP}/api/commands/stop",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(request, timeout=10) as response:
        print(response.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(e.read().decode("utf-8"))
    raise SystemExit(e.code)
