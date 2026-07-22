# FaMiLiS Multi-Unit Deployment

## Overview

FaMiLiS is a browser-based product testing system with facial valence processing, survey collection, session monitoring, and centralized reporting.

The system runs on Kubernetes and consists of:

- `familis`: React/Vite browser app, Express API, Socket.IO, and local emotion service
- `central-api`: FastAPI API, WebSocket kiosk registry, and Kafka producer
- `fer-worker`: scalable Kafka consumer for FER video-frame processing
- `kafka` and `zookeeper`: queue layer for frame load balancing
- `mysql`: central database initialized from `server_database/schema.sql`
- `traefik`: ingress router for HTTPS traffic

The active kiosk flow is handled by the FaMiLiS web app in the browser. The old native `client-agent` workflow is deprecated.

## File Structure

```text
familis-multiunit-deployment/
  central-server/
    app/                     FastAPI service, Kafka producer/consumer, dashboard APIs
    models/                  FER model files for central processing
    Dockerfile
    docker-compose.yaml      Legacy/local Docker Compose stack
    requirements.txt
    .dockerignore

  certs/
    cert.pem                 HTTPS certificate used for local testing
    key.pem                  HTTPS key used for local testing

  k8s/
    base/                    Kubernetes manifests and kustomization

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

  README.md
```

## Kubernetes Deployment

### 1. Build Images

From the repository root:

```powershell
docker build -t familis-central-server:latest .\central-server
docker build -t familis-app:k8s .\kiosk-image
```

Confirm that the images were created:

```powershell
docker images
```

### 3. Create the Namespace and TLS Secret

```powershell
kubectl apply -f .\k8s\base\namespace.yaml
kubectl -n familis create secret tls familis-tls --cert=.\certs\cert.pem --key=.\certs\key.pem --dry-run=client -o yaml | kubectl apply -f -
```

### 4. Deploy the Application

```powershell
kubectl apply -k .\k8s\base --validate=false
```

Wait for the deployments:

```powershell
kubectl -n familis rollout status deployment/mysql --timeout=180s
kubectl -n familis rollout status deployment/zookeeper --timeout=180s
kubectl -n familis rollout status deployment/kafka --timeout=180s
kubectl -n familis rollout status deployment/central-api --timeout=180s
kubectl -n familis rollout status deployment/fer-worker --timeout=180s
kubectl -n familis rollout status deployment/familis --timeout=180s
```

Check the pods:

```powershell
kubectl -n familis get pods
```

Application pods must show `Running`. The `kafka-init` pod shows `Completed`.

### 5. Open Local Access

```powershell
kubectl -n familis port-forward svc/familis-web 5173:443
```

Keep the terminal open and visit:

```text
https://localhost:5173
```

### 6. Open LAN Access

Use this command instead of the local-only port-forward:

```powershell
kubectl -n familis port-forward --address 0.0.0.0 svc/familis-web 5173:443
```

Find the server computer's IPv4 address:

```powershell
ipconfig
```

Open the following address on a device connected to the same network:

```text
https://<SERVER-IP>:5173
```

## Temporary Public Access

Keep the LAN access command running in one terminal:

```powershell
kubectl -n familis port-forward --address 0.0.0.0 svc/familis-web 5173:443
```

Download `cloudflared` once:

```powershell
New-Item -ItemType Directory -Force .\.familis\tools
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile ".\.familis\tools\cloudflared.exe"
```

Open another terminal and start the public tunnel:

```powershell
.\.familis\tools\cloudflared.exe tunnel --no-autoupdate --url https://127.0.0.1:5173 --no-tls-verify
```

Open the `https://...trycloudflare.com` address printed in the terminal. Press `Ctrl+C` to stop the tunnel.

Tester accounts are created from the participant management page.

## Check Services

```powershell
kubectl -n familis get pods
kubectl -n familis get services
kubectl -n familis get ingress
```

## View Logs

```powershell
kubectl -n familis logs deployment/familis --tail=120
kubectl -n familis logs deployment/central-api --tail=120
kubectl -n familis logs deployment/fer-worker --tail=120
kubectl -n familis logs deployment/kafka --tail=120
kubectl -n familis logs deployment/mysql --tail=120
```

## Restart a Service

```powershell
kubectl -n familis rollout restart deployment/familis
kubectl -n familis rollout status deployment/familis
```

Restart the FER workers:

```powershell
kubectl -n familis rollout restart deployment/fer-worker
kubectl -n familis rollout status deployment/fer-worker
```

## Back Up the Database

```powershell
$mysqlPod = kubectl -n familis get pod -l app=mysql -o jsonpath='{.items[0].metadata.name}'
kubectl -n familis exec $mysqlPod -- mysqldump -uroot -proot familis_central > familis-backup.sql
```

## Stop the System

Press `Ctrl+C` in the port-forward terminal.

Delete the Kubernetes deployment:

```powershell
kubectl delete namespace familis
```
