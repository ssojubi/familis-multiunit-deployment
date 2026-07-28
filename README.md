# FaMiLiS Multi-Unit Deployment

FaMiLiS is a browser-based food testing system with live kiosk monitoring,
facial valence processing, surveys, and centralized reporting.

The Kubernetes deployment contains:

- `familis`: React/Vite web application, Express API, and Socket.IO
- `central-api`: FastAPI frame ingestion and kiosk registry
- `kafka` and `zookeeper`: frame queue
- `fer-worker`: autoscaled FER processing workers
- `mysql`: application database
- `traefik`: HTTPS ingress

```text
Kiosk -> Express API -> Central API -> Kafka -> FER workers
      -> MySQL and shared frame storage -> Dashboard
```

## Requirements

- Windows 10/11 or macOS
- Docker Desktop with Kubernetes enabled
- Git
- `kubectl`
- Helm
- OpenSSL 3
- Cloudflare Tunnel client (`cloudflared`) for optional public mobile access

Run all commands from the repository root.

### macOS Tools

```bash
brew install git kubectl helm openssl@3
brew install --cask docker
```

On an Apple Silicon Mac, enable Docker Desktop's Rosetta support for
`x86_64/amd64` emulation:

```bash
softwareupdate --install-rosetta --agree-to-license
```

In Docker Desktop, select the Apple Virtualization Framework and enable
**Use Rosetta for x86_64/amd64 emulation**.

## 1. Verify Docker and Kubernetes

Start Docker Desktop and wait for Kubernetes to become ready.

**Windows PowerShell**

```powershell
docker info
kubectl config use-context docker-desktop
kubectl get nodes
```

**macOS Terminal**

```bash
docker info
kubectl config use-context docker-desktop
kubectl get nodes
```

The node status must be `Ready`.

## 2. Install Traefik

**Windows PowerShell**

```powershell
helm repo add traefik https://traefik.github.io/charts --force-update
helm repo update
helm upgrade --install traefik traefik/traefik `
  --namespace traefik `
  --create-namespace `
  --set service.type=ClusterIP `
  --set providers.kubernetesIngress.enabled=true `
  --set "additionalArguments[0]=--serversTransport.insecureSkipVerify=true" `
  --wait `
  --timeout 5m
```

**macOS Terminal**

```bash
helm repo add traefik https://traefik.github.io/charts --force-update
helm repo update
helm upgrade --install traefik traefik/traefik \
  --namespace traefik \
  --create-namespace \
  --set service.type=ClusterIP \
  --set providers.kubernetesIngress.enabled=true \
  --set "additionalArguments[0]=--serversTransport.insecureSkipVerify=true" \
  --wait \
  --timeout 5m
```

Verify Traefik:

```bash
kubectl -n traefik get pods
kubectl get ingressclass traefik
```

## 3. Install Metrics Server

Metrics Server provides CPU measurements for FER worker autoscaling.

**Windows PowerShell**

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.8.1/components.yaml
kubectl -n kube-system patch deployment metrics-server `
  --type=json `
  --patch-file .\k8s\metrics-server-docker-desktop-patch.json
kubectl -n kube-system rollout status deployment/metrics-server --timeout=180s
kubectl top nodes
```

**macOS Terminal**

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.8.1/components.yaml
kubectl -n kube-system patch deployment metrics-server \
  --type=json \
  --patch-file ./k8s/metrics-server-docker-desktop-patch.json
kubectl -n kube-system rollout status deployment/metrics-server --timeout=180s
kubectl top nodes
```

## 4. Determine the Server IP

**Windows PowerShell**

```powershell
$route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" |
  Sort-Object RouteMetric |
  Select-Object -First 1
$lanIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex |
  Where-Object { $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1).IPAddress
$lanIP
```

**macOS Terminal**

```bash
interface=$(route get default | awk '/interface:/{print $2}')
lanIP=$(ipconfig getifaddr "$interface")
echo "$lanIP"
```

## 5. Generate the HTTPS Certificate

### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force .\certs

openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 3650 `
  -keyout .\certs\familis-root-ca-key.pem `
  -out .\certs\familis-root-ca.pem `
  -subj "/CN=FaMiLiS Local Root CA" `
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" `
  -addext "keyUsage=critical,keyCertSign,cRLSign"

openssl req -new -nodes -newkey rsa:3072 -sha256 `
  -keyout .\certs\key.pem `
  -out .\certs\familis-server.csr `
  -subj "/CN=$lanIP" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$lanIP" `
  -addext "basicConstraints=critical,CA:FALSE" `
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" `
  -addext "extendedKeyUsage=serverAuth"

openssl x509 -req `
  -in .\certs\familis-server.csr `
  -CA .\certs\familis-root-ca.pem `
  -CAkey .\certs\familis-root-ca-key.pem `
  -CAcreateserial `
  -days 365 `
  -sha256 `
  -copy_extensions copy `
  -out .\certs\cert.pem

openssl x509 -in .\certs\familis-root-ca.pem -outform der -out .\certs\familis-ca.cer
Remove-Item .\certs\familis-server.csr

Copy-Item .\certs\cert.pem .\central-server\cert.pem -Force
Copy-Item .\certs\key.pem .\central-server\key.pem -Force
Copy-Item .\certs\cert.pem .\kiosk-image\FaMiLiS\cert.pem -Force
Copy-Item .\certs\key.pem .\kiosk-image\FaMiLiS\key.pem -Force
```

Trust the root certificate on the Windows server:

```powershell
certutil -addstore -f Root .\certs\familis-ca.cer
```

### macOS Terminal

```bash
OPENSSL="$(brew --prefix openssl@3)/bin/openssl"
mkdir -p ./certs

"$OPENSSL" req -x509 -nodes -newkey rsa:3072 -sha256 -days 3650 \
  -keyout ./certs/familis-root-ca-key.pem \
  -out ./certs/familis-root-ca.pem \
  -subj "/CN=FaMiLiS Local Root CA" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

"$OPENSSL" req -new -nodes -newkey rsa:3072 -sha256 \
  -keyout ./certs/key.pem \
  -out ./certs/familis-server.csr \
  -subj "/CN=$lanIP" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$lanIP" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

"$OPENSSL" x509 -req \
  -in ./certs/familis-server.csr \
  -CA ./certs/familis-root-ca.pem \
  -CAkey ./certs/familis-root-ca-key.pem \
  -CAcreateserial \
  -days 365 \
  -sha256 \
  -copy_extensions copy \
  -out ./certs/cert.pem

"$OPENSSL" x509 \
  -in ./certs/familis-root-ca.pem \
  -outform der \
  -out ./certs/familis-ca.cer

rm ./certs/familis-server.csr
cp ./certs/cert.pem ./central-server/cert.pem
cp ./certs/key.pem ./central-server/key.pem
cp ./certs/cert.pem ./kiosk-image/FaMiLiS/cert.pem
cp ./certs/key.pem ./kiosk-image/FaMiLiS/key.pem
```

Trust the root certificate on the Mac server:

```bash
sudo security add-trusted-cert \
  -d \
  -r trustRoot \
  -k /Library/Keychains/System.keychain \
  ./certs/familis-root-ca.pem
```

Install `certs/familis-ca.cer` on other LAN devices that access FaMiLiS.

## 6. Build the Container Images

### Windows PowerShell

```powershell
$version = "local-" + (Get-Date -Format "yyyyMMddHHmmss")
docker build -t "familis-central-server:$version" .\central-server
docker build -t "familis-app:$version" .\kiosk-image
```

### macOS Terminal

Intel Mac:

```bash
version="local-$(date +%Y%m%d%H%M%S)"
docker build -t "familis-central-server:$version" ./central-server
docker build -t "familis-app:$version" ./kiosk-image
```

Apple Silicon Mac:

```bash
version="local-$(date +%Y%m%d%H%M%S)"
docker build --platform linux/amd64 -t "familis-central-server:$version" ./central-server
docker build --platform linux/amd64 -t "familis-app:$version" ./kiosk-image
```

## 7. Load the Images into Kubernetes

### Windows PowerShell

```powershell
$node = kubectl get nodes -o jsonpath='{.items[0].metadata.name}'
$archiveName = "familis-images-$version.tar"
$imageArchive = ".\$archiveName"
$nodeImageArchive = "/root/$archiveName"

docker save -o $imageArchive `
  "familis-central-server:$version" `
  "familis-app:$version"

docker cp $imageArchive "${node}:$nodeImageArchive"
docker exec $node ctr -n k8s.io images import --all-platforms $nodeImageArchive

docker exec $node ctr -n k8s.io images tag --force `
  "docker.io/library/familis-central-server:$version" `
  docker.io/library/familis-central-server:latest

docker exec $node ctr -n k8s.io images tag --force `
  "docker.io/library/familis-app:$version" `
  docker.io/library/familis-app:k8s

docker exec $node rm -f $nodeImageArchive
Remove-Item $imageArchive
```

### macOS Terminal

```bash
node=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
archive_name="familis-images-$version.tar"
image_archive="./$archive_name"
node_image_archive="/root/$archive_name"

docker save -o "$image_archive" \
  "familis-central-server:$version" \
  "familis-app:$version"

docker cp "$image_archive" "$node:$node_image_archive"
docker exec "$node" ctr -n k8s.io images import --all-platforms "$node_image_archive"

docker exec "$node" ctr -n k8s.io images tag --force \
  "docker.io/library/familis-central-server:$version" \
  docker.io/library/familis-central-server:latest

docker exec "$node" ctr -n k8s.io images tag --force \
  "docker.io/library/familis-app:$version" \
  docker.io/library/familis-app:k8s

docker exec "$node" rm -f "$node_image_archive"
rm "$image_archive"
```

## 8. Create the Namespace and TLS Secret

**Windows PowerShell**

```powershell
kubectl apply -f .\k8s\base\namespace.yaml
kubectl -n familis create secret tls familis-tls `
  --cert=.\certs\cert.pem `
  --key=.\certs\key.pem `
  --dry-run=client `
  -o yaml |
  kubectl apply -f -
```

**macOS Terminal**

```bash
kubectl apply -f ./k8s/base/namespace.yaml
kubectl -n familis create secret tls familis-tls \
  --cert=./certs/cert.pem \
  --key=./certs/key.pem \
  --dry-run=client \
  -o yaml |
  kubectl apply -f -
```

## 9. Deploy FaMiLiS

**Windows PowerShell**

```powershell
kubectl apply -k .\k8s\base --validate=false
kubectl -n familis set env deployment/familis --containers=familis HOST_LAN_IP=$lanIP
kubectl -n familis rollout restart deployment/central-api deployment/fer-worker deployment/familis
```

**macOS Terminal**

```bash
kubectl apply -k ./k8s/base --validate=false
kubectl -n familis set env deployment/familis --containers=familis "HOST_LAN_IP=$lanIP"
kubectl -n familis rollout restart deployment/central-api deployment/fer-worker deployment/familis
```

Wait for the deployments:

```bash
kubectl -n familis rollout status deployment/mysql --timeout=180s
kubectl -n familis rollout status deployment/zookeeper --timeout=180s
kubectl -n familis rollout status deployment/kafka --timeout=180s
kubectl -n familis rollout status deployment/central-api --timeout=180s
kubectl -n familis rollout status deployment/fer-worker --timeout=300s
kubectl -n familis rollout status deployment/familis --timeout=180s
```

## 10. Verify the Deployment

```bash
kubectl -n familis get pods
kubectl -n familis get services
kubectl -n familis get ingress
kubectl -n familis get hpa fer-worker
kubectl top pods -n familis
```

Expected state:

- Application pods show `Running`.
- `kafka-init` shows `Completed`.
- The FER HPA shows a minimum of `1` and maximum of `6`.
- Idle FER workers scale down.
- FER workers scale up when processing CPU exceeds the target.

Start the processing-health port-forward:

```bash
kubectl -n familis port-forward svc/familis-api 8080:8080
```

Run the health request in another terminal.

**Windows PowerShell**

```powershell
curl.exe -k https://localhost:8080/api/emotion/health
```

**macOS Terminal**

```bash
curl -k https://localhost:8080/api/emotion/health
```

The response must include:

```json
{
  "ok": true,
  "processing": "kubernetes-fer-workers"
}
```

Stop the health port-forward with `Ctrl+C`.

## 11. Open the Website

**Windows PowerShell or macOS Terminal**

```bash
kubectl -n traefik port-forward --address 0.0.0.0 svc/traefik 5173:443
```

Keep the terminal open.

Server computer:

```text
https://localhost:5173
```

Other devices on the same network:

```text
https://<SERVER-IP>:5173
```

## Public Mobile Access

Keep the Traefik port-forward running. Start a temporary Cloudflare tunnel in
another terminal:

```bash
cloudflared tunnel --no-autoupdate --url https://127.0.0.1:5173 --no-tls-verify
```

Copy the generated `https://<random-name>.trycloudflare.com` address.

**Windows PowerShell**

```powershell
$publicUrl = "https://<random-name>.trycloudflare.com"
kubectl -n familis set env deployment/familis `
  --containers=familis `
  "PUBLIC_ACCESS_URL=$publicUrl"
kubectl -n familis rollout status deployment/familis --timeout=180s
```

**macOS Terminal**

```bash
publicUrl="https://<random-name>.trycloudflare.com"
kubectl -n familis set env deployment/familis \
  --containers=familis \
  "PUBLIC_ACCESS_URL=$publicUrl"
kubectl -n familis rollout status deployment/familis --timeout=180s
```

The public address appears under **Manage Kiosks** as the mobile access URL.
It uses publicly trusted HTTPS, so mobile devices do not need the local
FaMiLiS certificate. The address remains valid only while the `cloudflared`
process is running. Live monitoring still uses WebRTC and may be blocked by
networks that restrict peer-to-peer media.

## Food Testing Workflow

1. The administrator opens **Food Management** and selects **Activate Testing**
   for a food item.
2. FaMiLiS creates one active testing room with a six-digit room code.
3. The administrator opens **Manage Kiosks** to monitor the room. The same room
   remains available from **Active Testing Rooms** after leaving the page.
4. Each tester opens FaMiLiS, logs in, selects the active food test, and enters
   the shared room code.
5. The tester completes consent, recording, and the survey. The tester is
   logged out after submission.
6. Multiple testers may use the same room code. Each recording is stored as a
   separate session.
7. The administrator selects **End Testing** after all active recordings finish.

## View Logs

```bash
kubectl -n familis logs deployment/familis --tail=120
kubectl -n familis logs deployment/central-api --tail=120
kubectl -n familis logs deployment/fer-worker --tail=120
kubectl -n familis logs deployment/kafka --tail=120
kubectl -n familis logs deployment/mysql --tail=120
```

## Restart the Application

```bash
kubectl -n familis rollout restart deployment/central-api deployment/fer-worker deployment/familis
kubectl -n familis rollout status deployment/central-api --timeout=180s
kubectl -n familis rollout status deployment/fer-worker --timeout=300s
kubectl -n familis rollout status deployment/familis --timeout=180s
```

## Stop the Website

Press `Ctrl+C` in the Traefik port-forward terminal. The Kubernetes services
remain running.
