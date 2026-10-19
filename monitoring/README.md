# Monitoring

Run commands from the repository root. Assumes the `familis` kind cluster already exists.

## 1. Start the cluster

Docker runs the local Kubernetes cluster.

```bash
sudo systemctl start docker
kubectl config use-context kind-familis
kubectl get nodes
```

If the node is stopped:

```bash
docker start familis-control-plane
kubectl wait --for=condition=Ready node/familis-control-plane --timeout=120s
```

## 2. Install or update monitoring

Skip this step for daily use. Prometheus collects metrics; Grafana displays them.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace --values monitoring/values.yaml --wait
kubectl apply -f monitoring/familis-monitors.yaml
kubectl apply -f monitoring/dashboard-configmap.yaml
```

After changing application metrics, rebuild and restart the API and worker:

```bash
docker build -t familis-central-server:latest central-server
kind load docker-image familis-central-server:latest --name familis
kubectl -n familis apply -f k8s/base/central-api.yaml -f k8s/base/fer-worker.yaml
kubectl -n familis rollout restart deployment/central-api deployment/fer-worker
kubectl -n familis rollout status deployment/central-api
kubectl -n familis rollout status deployment/fer-worker
```

## 3. Check readiness

Confirm services are ready before opening the application or collecting results.

```bash
kubectl -n familis get pods
kubectl -n traefik get pods
kubectl -n monitoring get pods
```

Wait for pods to be `Running` with all containers ready. `kafka-init` should be `Completed`.

## 4. Open the application

Run in a separate terminal and keep it open. This allows kiosks on the trusted LAN to connect.

```bash
kubectl -n traefik port-forward --address 0.0.0.0 service/traefik 5173:443
```

Open `https://localhost:5173`, or `https://<LAPTOP-IP>:5173` from a kiosk.
Find the laptop IP after `src` in `ip route get 1.1.1.1`. Allow TCP `5173` through the firewall.
Accept the local TLS certificate warning only for this application address.

## 5. Open Grafana

Retrieve the password; the username is `admin`. Keep the password out of reports and source control.

```bash
kubectl -n monitoring get secret monitoring-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

Run in another terminal and keep it open. Loopback binding keeps monitoring private to the laptop.

```bash
kubectl -n monitoring port-forward --address 127.0.0.1 service/monitoring-grafana 3000:80
```

Open [FaMiLiS Stress Test](http://localhost:3000/d/familis-stress-test/familis-stress-test).
Select the test time range and refresh every `5s`. Keep Grafana and Prometheus as
`ClusterIP` services; do not expose them through public tunnels or ingress.

## 6. Verify and run the test

Verify metrics before recording results:

- Web app and processing workers ready: above zero.
- Containers unavailable: zero.
- Frames received and finished: increase after a normal session.
- Scrape targets: both `UP`. Investigate `N/A`, query errors, or frames held after retries.

Run 2, 5, 10, 20, and 30 kiosks for a fixed duration per load level.
Record machine resources, capture rate, actual client count, and start/end times.
For each run, record accepted/processed frames, failures, p95 processing time,
CPU, RAM, worker replicas, and restarts. Let the queue drain, then calculate
completion rate from distinct database frame IDs; dashboard rates alone do not prove delivery.

Interpret results using these limits:

- CPU `1.0` = one core, averaged over one minute. RAM is working-set memory. Totals cover `familis`, not the laptop.
- Pod restarts reset counters. Prometheus retains seven days of history.
- Upload-to-result time uses API and worker timestamps, independent of the kiosk clock.
- Workers scale from 1–6 at a CPU target of 65% of their 250m request. Scale-down can take five minutes.
- Frames failing five attempts enter `video-frames-failed`. Include these failures in the report.

## 7. Stop access

Press `Ctrl+C` in both port-forward terminals. Kubernetes continues collecting metrics.
To stop the entire local cluster:

```bash
sudo systemctl stop docker
```

## Troubleshooting

| Problem | Action |
| --- | --- |
| Browser cannot connect | Restart the corresponding port-forward and keep its terminal open. |
| Port 3000 occupied | Use `3300:80` in the Grafana command; open `http://localhost:3300`. |
| Kubernetes unavailable | Check Docker and run `docker start familis-control-plane`. |
| Dashboard missing | Run `kubectl apply -f monitoring/dashboard-configmap.yaml`, then refresh. |
| Blank charts | Generate traffic and check the selected time range. |

To inspect scrape targets or queries in Prometheus:

```bash
kubectl -n monitoring port-forward --address 127.0.0.1 \
  service/monitoring-kube-prometheus-prometheus 9090:9090
```

Open `http://localhost:9090`. Stop the tunnel with `Ctrl+C` when done.
