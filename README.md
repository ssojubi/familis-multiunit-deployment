# FaMiLiS Multi-Unit Deployment

Distributed Facial Emotion Recognition (FER) system for multiple kiosks.

The central server runs in Docker. The kiosk camera agent runs natively on each kiosk machine because webcam access is more reliable outside Docker, especially on Windows and macOS.

## Architecture

```text
Kiosk camera agent
  -> FastAPI central server
  -> Kafka topic: video-frames
  -> FER processor
  -> MySQL emotion_results
  -> Saved frame files
```

## Repository Layout

```text
familis-multiunit-deployment/
  central-server/
    app/
    models/
    Dockerfile
    docker-compose.yaml
    requirements.txt
  client-agent/
    agent.py
    requirements.txt
  send_start.py
  send_stop.py
  README.md
```

## Requirements

Central server machine:

- Docker Desktop
- Docker Compose

Kiosk/client machine:

- Python 3.11
- Webcam
- Python dependencies from `client-agent/requirements.txt`

## 1. Start The Central Server

From the repo root:

```powershell
cd central-server
docker compose up -d --build
```

This starts:

```text
central-server
central-mysql
kafka
zookeeper
kafka-init
```

`kafka-init` creates the `video-frames` topic automatically.

## 2. Check The Central Server

```powershell
docker compose ps
```

Health check:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/api/health
```

Expected content:

```json
{"status":"ok","kiosks_connected":0,"kafka_ready":true}
```

## 3. Run The Kiosk Agent

Open a new PowerShell terminal from the repo root:

```powershell
cd client-agent
pip install -r requirements.txt
python agent.py
```

Expected log:

```text
Registered as kiosk-01
```

The default kiosk id is `kiosk-01`.

To run a different kiosk:

```powershell
$env:KIOSK_ID="kiosk-02"
python agent.py
```

## 4. Send Test Start And Stop Commands

Open another PowerShell terminal from the repo root:

```powershell
python send_start.py
```

Then stop:

```powershell
python send_stop.py
```

Defaults:

```text
KIOSK_ID=kiosk-01
SESSION_ID=testv5
CENTRAL_SERVER_HTTP=http://localhost:8000
```

Override them if needed:

```powershell
$env:KIOSK_ID="kiosk-02"
$env:SESSION_ID="session-001"
$env:CENTRAL_SERVER_HTTP="http://localhost:8000"
python send_start.py
```

## 5. Saved Frames

Frames are saved on the central server host at:

```text
C:\frames
```

Default test path:

```text
C:\frames\kiosk-01\testv5
```

Open it:

```powershell
explorer C:\frames\kiosk-01\testv5
```

## 6. Check MySQL Results

From `central-server/`:

```powershell
docker exec -it central-mysql mysql -uroot -proot
```

Inside MySQL:

```sql
SHOW DATABASES;
USE familis_central;
SHOW TABLES;
SELECT COUNT(*) FROM emotion_results;
SELECT * FROM emotion_results ORDER BY id DESC LIMIT 10;
```

One-shot command:

```powershell
docker exec central-mysql mysql -uroot -proot -e "USE familis_central; SHOW TABLES; SELECT COUNT(*) AS emotion_result_count FROM emotion_results; SELECT * FROM emotion_results ORDER BY id DESC LIMIT 10;"
```

## 7. Check Kafka

List topics:

```powershell
docker exec kafka kafka-topics --bootstrap-server kafka:9092 --list
```

Expected:

```text
__consumer_offsets
video-frames
```

List consumer groups:

```powershell
docker exec kafka kafka-consumer-groups --bootstrap-server kafka:9092 --list
```

Expected:

```text
fer-processor-group
```

## Running On Separate Machines

If the kiosk agent runs on a different laptop from the central server, set the central server IP.

Example central server IP:

```text
192.168.1.50
```

On the kiosk machine:

```powershell
$env:CENTRAL_SERVER_HTTP="http://192.168.1.50:8000"
$env:KIOSK_ID="kiosk-01"
python agent.py
```

For start/stop commands from another machine:

```powershell
$env:CENTRAL_SERVER_HTTP="http://192.168.1.50:8000"
python send_start.py
python send_stop.py
```

Make sure the central server machine allows inbound traffic on port `8000`.

## Agent Configuration

Environment variables:

```text
KIOSK_ID              Default: kiosk-01
CENTRAL_SERVER_HTTP   Default: http://localhost:8000
CENTRAL_SERVER_WS     Default: derived from CENTRAL_SERVER_HTTP
WEBCAM_ID             Default: 0
SHOW_PREVIEW          Default: 1
WARM_CAMERA_ON_CONNECT Default: 0
CAMERA_BACKEND        Windows default: dshow, macOS default: avfoundation
```

Disable preview:

```powershell
$env:SHOW_PREVIEW="0"
python agent.py
```

Warm camera immediately when the agent connects:

```powershell
$env:WARM_CAMERA_ON_CONNECT="1"
python agent.py
```

Use another camera:

```powershell
$env:WEBCAM_ID="1"
python agent.py
```

## Stop The System

Stop the central server stack:

```powershell
cd central-server
docker compose down
```

Stop the kiosk agent:

```text
Ctrl+C
```

## Troubleshooting

Check central server logs:

```powershell
docker logs central-server
```

Check Kafka init logs:

```powershell
docker logs kafka-init
```

Check registered kiosks:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/api/commands/kiosks
```

If `send_start.py` says the kiosk is not connected:

```text
1. Make sure agent.py is running.
2. Make sure the agent log says Registered as kiosk-01.
3. Make sure send_start.py is targeting the same KIOSK_ID.
```

If Kafka shows temporary `GroupCoordinatorNotAvailableError`:

```text
This can happen briefly while Kafka starts.
It is okay if the app becomes healthy and fer-processor-group appears.
```

Verify:

```powershell
docker exec kafka kafka-consumer-groups --bootstrap-server kafka:9092 --list
```

If the camera opens slowly on Windows:

```powershell
$env:CAMERA_BACKEND="dshow"
python agent.py
```

If the camera opens slowly on macOS:

```powershell
$env:CAMERA_BACKEND="avfoundation"
python agent.py
```

## Deployment Recommendation

Recommended final setup:

```text
Central server: Docker Compose
Kiosk agents: native Python or packaged native app
```

Do not containerize the kiosk agent unless the kiosk is Linux and webcam access has been tested with Docker device passthrough.
