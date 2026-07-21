# FaMiLiS Multi-Unit Deployment

FaMiLiS Multi-Unit Deployment runs the browser-based kiosk UI, central dashboard, emotion service, MySQL database, and Kafka-based FER processing pipeline.

The current deployment target is Kubernetes. Docker is still used to build the application images, while Kubernetes runs those images as containers inside pods and manages service networking, restarts, and worker scaling.

## Architecture Summary

```text
Kiosks / admin browser
  -> HTTPS server IP or local test port-forward
  -> Traefik Ingress
  -> familis-web Service
  -> familis pod
  -> MySQL / Kafka / central-api / fer-worker services
```

Main components:

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

  scripts/
    start-familis.ps1        Builds, deploys, waits, and opens local access
    check-familis.ps1        Shows Kubernetes and access status
    stop-familis.ps1         Stops local access or removes the deployment
    backup-familis.ps1       Exports a MySQL backup

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

  client-agent/              Deprecated native camera implementation
  send_start.py              Deprecated central command helper
  send_stop.py               Deprecated central command helper
  README.md
```

## Admin Operation

For a simple admin/server setup on Windows with Docker Desktop Kubernetes enabled, use the scripts in `scripts/`.

Start FaMiLiS:

```powershell
.\scripts\start-familis.ps1
```

That command builds the Docker images, applies the Kubernetes manifests, waits for the app to become healthy, and starts a local access tunnel for the web app.

After it finishes, open:

```text
https://localhost:5173
```

For another device on the same network:

```text
https://<ADMIN-SERVER-IP>:5173
```

The start script automatically detects the admin machine's current LAN address
and creates or refreshes its server certificate. To generate it manually, run:

```powershell
.\scripts\new-familis-certificate.ps1
```

Install `certs\familis-ca.cer` on the device. On iPadOS, install the downloaded
profile and enable it under **Settings > General > About > Certificate Trust
Settings**. This trust approval is required once per device and cannot be
automated by the server. If the admin machine's LAN IP changes, start FaMiLiS
normally; the server certificate is refreshed automatically and the already
trusted root remains valid. Reinstall the device certificate only when the local
root CA is explicitly reset.

Example:

```text
https://10.159.90.87:5173
```

If the images were already built and you only want to redeploy:

```powershell
.\scripts\start-familis.ps1 -SkipBuild
```

Check status:

```powershell
.\scripts\check-familis.ps1
```

Stop only the local access tunnel:

```powershell
.\scripts\stop-familis.ps1
```

Stop and delete the Kubernetes app:

```powershell
.\scripts\stop-familis.ps1 -DeleteNamespace
```

Back up the database:

```powershell
.\scripts\backup-familis.ps1
```

Backups are written to `.familis\backups`.

For the final client installation, the preferred setup is a dedicated server or mini-PC on the client's LAN. Kiosks connect to that server by IP address or local DNS name. Port forwarding is only used for local Windows/Docker Desktop testing; the final setup should expose HTTPS through Traefik on the server.

## Kubernetes Deployment

### 1. Build Images

From the repository root:

```powershell
docker build -t familis-central-server:latest .\central-server
docker build -t familis-app:k8s .\kiosk-image
```

`docker build -t` names the images. Kubernetes then runs those images as containers inside pods.

### 2. Confirm Kubernetes Is Running

For Docker Desktop Kubernetes:

```powershell
kubectl config use-context docker-desktop
kubectl get nodes
```

You should see a `Ready` node.

### 3. Deploy

```powershell
kubectl apply -f .\k8s\base\namespace.yaml
kubectl -n familis create secret tls familis-tls --cert=.\certs\cert.pem --key=.\certs\key.pem
kubectl apply -k .\k8s\base
kubectl -n familis get pods -w
```

Expected healthy state:

```text
central-api   1/1 Running
familis       1/1 Running
fer-worker    1/1 Running
kafka         1/1 Running
kafka-init    0/1 Completed
mysql         1/1 Running
zookeeper     1/1 Running
```

If the TLS secret already exists:

```powershell
kubectl -n familis delete secret familis-tls
kubectl -n familis create secret tls familis-tls --cert=.\certs\cert.pem --key=.\certs\key.pem
```

### 4. Access The Website

For local testing:

```powershell
kubectl -n familis port-forward svc/familis-web 5173:443
```

Keep that terminal open, then visit:

```text
https://localhost:5173
```

For kiosk devices on the same LAN, use the admin/server machine IP or a local DNS name:

```text
https://<SERVER-IP>
https://familis.local
```

Kiosks must be on the same Wi-Fi/LAN unless a VPN, public domain, or secure tunnel is configured.

## Network Exposure

These manifests do not require MetalLB.

`familis-web` is a private `ClusterIP` service. Traefik is the public HTTPS entry point and routes traffic to internal Kubernetes services.

```text
Kiosks
  -> server IP / local DNS
  -> Traefik Ingress
  -> familis-web ClusterIP
  -> familis pod
```

Private internal services:

- `familis-web`
- `familis-api`
- `central-api`
- `mysql`
- `kafka`
- `zookeeper`

Check services and ingress:

```powershell
kubectl -n familis get svc
kubectl -n familis get ingress
```

## Kafka FER Processing

`kafka-init` creates the `video-frames` topic with 6 partitions. The `fer-worker` Deployment starts with 3 replicas using the same consumer group, so Kafka distributes frame messages across workers.

Scale FER processing:

```powershell
kubectl -n familis scale deployment/fer-worker --replicas=6
```

For more than 6 active workers, increase the Kafka topic partition count.

## Useful Kubernetes Commands

Check pod state:

```powershell
kubectl -n familis get pods
```

View logs:

```powershell
kubectl -n familis logs deployment/familis --tail=120
kubectl -n familis logs deployment/central-api --tail=120
kubectl -n familis logs deployment/fer-worker --tail=120
```

Describe a pod:

```powershell
kubectl -n familis describe pod <pod-name>
```

Restart a deployment:

```powershell
kubectl -n familis rollout restart deployment/familis
kubectl -n familis rollout restart deployment/fer-worker
```

Delete the deployment namespace:

```powershell
kubectl delete namespace familis
```

## Docker Notes

Images are shown under Docker Desktop's **Images** tab, not **Containers**.

```powershell
docker images
```

The images should include:

```text
familis-central-server:latest
familis-app:k8s
```

Random container names such as `sad_sinoussi` only appear when a container is run manually without `--name`. Kubernetes pod names come from the manifests.

## Full Cleanup

Warning: these commands delete Docker images, containers, volumes, build cache, and the Kubernetes app namespace.

```powershell
kubectl delete namespace familis
docker rm -f $(docker ps -aq)
docker rmi -f $(docker images -aq)
docker volume rm $(docker volume ls -q)
docker builder prune -af
docker system prune -af --volumes
```

Restart Docker Desktop after a full cleanup, then rebuild and redeploy.

## Legacy Docker Compose

Docker Compose is still available for local/legacy testing:

```powershell
cd central-server
docker compose up -d --build
```

Open:

```text
https://localhost:5173
```

Check:

```powershell
docker compose ps
curl.exe -k https://localhost:8000/api/health
docker exec kafka kafka-topics --bootstrap-server kafka:9092 --list
docker exec central-mysql mysql -uroot -proot -e "USE familis_central; SHOW TABLES;"
```

Stop:

```powershell
docker compose down
```

Reset Compose volumes:

```powershell
docker compose down -v
docker compose up -d --build
```

## Storage Note

The `fer-worker` frame PVC uses `ReadWriteOnce`, which is fine for single-node local clusters. For multi-node clusters with multiple FER workers, switch `fer-frames` to a `ReadWriteMany` storage class or replace frame file storage with object storage.
