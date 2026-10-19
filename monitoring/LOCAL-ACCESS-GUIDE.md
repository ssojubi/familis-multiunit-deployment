# FaMiLiS local application and metrics access

This guide is for the CachyOS laptop that hosts the local `kind-familis`
Kubernetes cluster. The web application and monitoring dashboard remain private
to the laptop.

## What stays open

Two terminals must remain open while using the system:

| Terminal | Purpose | Local address |
| --- | --- | --- |
| 1 | Main FaMiLiS web application | `https://localhost:5173` and the server LAN IP |
| 2 | Grafana metrics dashboard | `http://localhost:3000` |

The Grafana password command runs once and exits. It does not require a
permanent third terminal.

## 1. Start Docker

```bash
sudo systemctl start docker
```

To make Docker start automatically after future reboots:

```bash
sudo systemctl enable docker
```

Confirm that Docker is working:

```bash
docker info
```

If Docker reports a socket permission error:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker info
```

## 2. Check the Kubernetes cluster

```bash
kind get clusters
kubectl config current-context
kubectl get nodes
```

Expected results:

- `kind get clusters` includes `familis`.
- The current context is `kind-familis`.
- The `familis-control-plane` node is `Ready`.

If the cluster exists but its container is stopped:

```bash
docker ps -a --filter name=familis-control-plane
docker start familis-control-plane
kubectl wait --for=condition=Ready node/familis-control-plane --timeout=120s
```

If another Kubernetes context is selected:

```bash
kubectl config use-context kind-familis
```

## 3. Check application and monitoring health

```bash
kubectl -n familis get pods
kubectl -n traefik get pods
kubectl -n monitoring get pods
```

The application, Traefik, Grafana, and Prometheus pods should show `Running`.
The one-time `kafka-init` pod is healthy when it shows `Completed`.

After Docker starts, allow up to a few minutes for every pod to become ready.
Watch their progress with:

```bash
kubectl get pods -A --watch
```

Press `Ctrl+C` after the pods are ready.

## 4. Retrieve the Grafana password

Run this once in any terminal:

```bash
kubectl -n monitoring get secret monitoring-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

Grafana credentials:

- Username: `admin`
- Password: output of the command above

Do not store the password in the capstone paper, source control, screenshots, or
recordings.

## 5. Terminal 1: open the main web application

```bash
kubectl -n traefik port-forward --address 0.0.0.0 \
  service/traefik 5173:443
```

Keep this terminal open. Open:

```text
https://localhost:5173
```

Other devices on the same trusted LAN use:

```text
https://<ADMIN-LAPTOP-IP>:5173
```

Find the current address with `ip route get 1.1.1.1`; use the value after
`src`. The local firewall must allow inbound TCP port `5173`. This LAN
exposure applies only to the FaMiLiS application; Grafana stays bound to
`127.0.0.1`.

The browser may warn about the locally generated TLS certificate. Accept the
warning only for this local FaMiLiS address.

Verify the application from a separate shell if needed:

```bash
curl -k https://localhost:5173/api/health
```

The response should contain `"ok": true`.

## 6. Terminal 2: open Grafana

```bash
kubectl -n monitoring port-forward --address 127.0.0.1 \
  service/monitoring-grafana 3000:80
```

Keep this terminal open. Open:

```text
http://localhost:3000
```

Sign in, then open **Dashboards → FaMiLiS Stress Test**. The direct URL is:

```text
http://localhost:3000/d/familis-stress-test/familis-stress-test
```

Set the dashboard time range to the test period and refresh to `5s`.

Grafana uses HTTP because this temporary connection is restricted to the
laptop's loopback interface. Grafana and Prometheus are internal `ClusterIP`
services and have no public external IP.

## 7. Confirm that metrics are updating

Before collecting test results:

1. Confirm **Web app copies ready** is above zero.
2. Confirm **Processing workers ready** is above zero.
3. Start a normal FaMiLiS test session.
4. Confirm **Frames received in 5 minutes** increases.
5. Confirm **Frames finished in 5 minutes** increases.
6. Confirm **Containers unavailable now** is zero.
7. Investigate any value under **Frames held after retries**.

A graph can be blank when no traffic occurred during the selected time range.
An `N/A` value or query error should be investigated before recording results.

## 8. Stop local access

Press `Ctrl+C` in both port-forward terminals:

- Terminal 1 closes access to the web application.
- Terminal 2 closes access to Grafana.

This stops browser access but leaves Kubernetes and metric collection running.

To stop the complete local environment after testing:

```bash
sudo systemctl stop docker
```

Stopping Docker stops the local Kubernetes cluster. Persistent data remains on
disk and becomes available again when Docker and the cluster containers start.

## Security rules

- Bind the FaMiLiS web application to `0.0.0.0` only while trusted LAN
  devices need access.
- Keep Grafana bound to `127.0.0.1`.
- Do not expose Grafana or Prometheus through Traefik, Cloudflare, a public
  Ingress, NodePort, or router port-forward.
- Do not publish the Grafana administrator password.
- Stop both port-forward commands when testing finishes.

## Troubleshooting

### Browser says “Unable to connect”

The corresponding port-forward is not running or has exited. Restart the
appropriate command and keep its terminal open.

Check the web application:

```bash
curl -k --connect-timeout 5 https://127.0.0.1:5173/api/health
```

Check Grafana:

```bash
curl --connect-timeout 5 http://127.0.0.1:3000/api/health
```

### Local port is already in use

Use a different local port. For example:

```bash
kubectl -n monitoring port-forward --address 127.0.0.1 \
  service/monitoring-grafana 3300:80
```

Then open `http://localhost:3300`.

### Kubernetes cannot connect

```bash
sudo systemctl status docker
docker ps -a --filter name=familis-control-plane
kubectl config use-context kind-familis
kubectl cluster-info
```

Start Docker or the `familis-control-plane` container if either is stopped.

### Grafana opens but the dashboard is missing

Open the direct dashboard URL. If it is still absent, reapply its configuration:

```bash
kubectl apply -f monitoring/dashboard-configmap.yaml
```

Wait several seconds and refresh Grafana.
