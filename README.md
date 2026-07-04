# FaMiLiS Multi-Unit Deployment

FaMiLiS Multi-Unit Deployment runs the browser-based kiosk UI, central dashboard, emotion service, MySQL database, and Kafka pipeline through Docker Compose.

The active kiosk flow is handled by the FaMiLiS web app. The `client-agent` folder is kept as a legacy native camera implementation.

## File Structure

```text
familis-multiunit-deployment/
  central-server/
    app/                     FastAPI service, Kafka producer/consumer, dashboard APIs
    models/                  FER model files for central processing
    Dockerfile
    docker-compose.yaml      Main Docker Compose stack
    requirements.txt
    .dockerignore

  certs/
    cert.pem                 HTTPS certificate used by the FaMiLiS container
    key.pem                  HTTPS key used by the FaMiLiS container

  kiosk-image/
    Dockerfile               FaMiLiS app container image
    start.sh                 Starts frontend, Express API, and emotion service
    .dockerignore
    FaMiLiS/
      backend/               Python emotion service and model files
      server/                Express API and Socket.IO server
      server_database/       MySQL schema
      src/                   React frontend
      package.json
      package-lock.json

  client-agent/              Legacy native kiosk camera agent
  send_start.py              Legacy start command helper
  send_stop.py               Legacy stop command helper
  README.md
```

## Services

```text
5173  FaMiLiS React app
8080  Express API + Socket.IO
8765  Python emotion service
8000  FastAPI central service
3308  MySQL exposed on host
9092  Kafka
2181  Zookeeper
```

Docker Compose starts these containers:

```text
zookeeper
kafka
kafka-init
central-mysql
central-server
familis
```

## Install And Run

Install Docker Desktop, then start the full stack from the repository root:

```powershell
cd central-server
docker compose up -d --build
```

Open the app:

```text
https://localhost:5173
```

Check running containers:

```powershell
docker compose ps
```

Check the central service:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/api/health
```

Check Kafka topics:

```powershell
docker exec kafka kafka-topics --bootstrap-server kafka:9092 --list
```

Check MySQL:

```powershell
docker exec central-mysql mysql -uroot -proot -e "USE familis_central; SHOW TABLES;"
```

Stop the stack:

```powershell
docker compose down
```

Reset the database volume and start fresh:

```powershell
docker compose down -v
docker compose up -d --build
```
