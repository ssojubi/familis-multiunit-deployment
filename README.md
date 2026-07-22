# FaMiLiS Multi-Unit Deployment

## Overview

FaMiLiS is a browser-based product testing system with facial valence processing, survey collection, session monitoring, and centralized reporting.

The system runs on Kubernetes and consists of:

- React and Vite frontend
- Express API and Socket.IO server
- FastAPI central service
- FER processing workers
- Apache Kafka and ZooKeeper
- MySQL database

## Requirements

- Windows 10 or 11
- Docker Desktop with Kubernetes enabled
- PowerShell
- `kubectl`
- OpenSSL

Run the commands below from the repository root.

## Run the System

### 1. Check Kubernetes

```powershell
kubectl config use-context docker-desktop
kubectl get nodes
```

The Docker Desktop node must show `Ready`.

### 2. Build the Docker Images

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

## iPhone and iPad Certificate

Transfer `certs\familis-ca.cer` to the device and install the profile.

Enable the certificate under:

```text
Settings > General > About > Certificate Trust Settings
```

The IP address used in the browser must be included in the server certificate.

Check the certificate addresses with:

```powershell
openssl x509 -in .\certs\cert.pem -noout -ext subjectAltName
```

## Login

Default administrator account:

```text
Email: admin@familis.com
Password: admin123
```

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

## Project Structure

```text
central-server/       FastAPI service and central FER worker code
k8s/base/             Kubernetes manifests
kiosk-image/          Browser application, Express API, and FER service
certs/                Local HTTPS certificates
scripts/              Optional deployment helper commands
```
