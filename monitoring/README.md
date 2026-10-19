# FaMiLiS stress-test monitoring

For the complete CachyOS startup, private access, troubleshooting, and shutdown
procedure, see [LOCAL-ACCESS-GUIDE.md](LOCAL-ACCESS-GUIDE.md).

## Install or update monitoring

Install the monitoring stack on the local `kind-familis` cluster:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace --values monitoring/values.yaml --wait
kubectl apply -f monitoring/familis-monitors.yaml
kubectl apply -f monitoring/dashboard-configmap.yaml
```

The application metrics require rebuilding and loading
`familis-central-server:latest` into kind, then rolling out `central-api` and
`fer-worker`:

```bash
docker build -t familis-central-server:latest central-server
kind load docker-image familis-central-server:latest --name familis
kubectl -n familis apply -f k8s/base/central-api.yaml -f k8s/base/fer-worker.yaml
kubectl -n familis rollout restart deployment/central-api deployment/fer-worker
kubectl -n familis rollout status deployment/central-api
kubectl -n familis rollout status deployment/fer-worker
```

Check the namespace and image tags before restarting workloads in any other
cluster.

## Secure local access

Grafana and Prometheus remain `ClusterIP` services inside Kubernetes. Do not
create an Ingress, NodePort, public tunnel, or router port-forward for either
service. Access Grafana through a temporary loopback-only Kubernetes tunnel.

### 1. Check that monitoring is running

```bash
kubectl -n monitoring get pods
kubectl -n monitoring get svc monitoring-grafana monitoring-kube-prometheus-prometheus
```

Wait until the Grafana and Prometheus pods show `Running` and all containers
ready. The services should show type `ClusterIP`.

### 2. Start private Grafana access

```bash
kubectl -n monitoring port-forward --address 127.0.0.1 service/monitoring-grafana 3000:80
```

Keep that terminal open. Only programs on the same laptop can connect. Do not
replace `127.0.0.1` with `0.0.0.0` or add Grafana to the application's
Cloudflare tunnel.

If port 3000 is occupied, use another local port, such as `3300:80`, and open
`http://localhost:3300` instead.

### 3. Retrieve the local administrator password

Linux, macOS, or Git Bash:

```bash
kubectl -n monitoring get secret monitoring-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

PowerShell:

```powershell
$encoded = kubectl -n monitoring get secret monitoring-grafana -o jsonpath='{.data.admin-password}'
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
```

The username is `admin`. Do not copy the password into the paper, source
control, recordings, or screenshots.

### 4. Open the dashboard

1. Open `http://localhost:3000` in a browser on the same laptop.
2. Sign in with username `admin` and the password from step 3.
3. Open **Dashboards**, then **FaMiLiS Stress Test**. The direct local URL is
   `http://localhost:3000/d/familis-stress-test/familis-stress-test`.
4. Set the time range to the planned test period and refresh to `5s`.

Use the plain `http://` URL because traffic stays on the local loopback
interface. If a browser shows an empty Grafana home page, open the direct
dashboard URL above; dashboard history can differ between browser profiles.

### 5. Confirm that readings are live

```bash
kubectl -n familis get pods
kubectl -n familis get servicemonitor,podmonitor
```

In Grafana, confirm that **Web app copies ready** and **Processing workers
ready** are above zero. Generate a normal test session and verify that **Frames
received in 5 minutes** and **Frames finished in 5 minutes** increase. A blank
panel usually means no traffic occurred in the selected time range. Investigate
`N/A` or query errors before recording results.

### 6. Close access after the test

Press `Ctrl+C` in the terminal running `kubectl port-forward`. Refresh
`http://localhost:3000` and confirm it no longer connects. Stopping the tunnel
does not stop metric collection inside the cluster.

### Optional: inspect Prometheus locally

Grafana should be the normal panel interface. To troubleshoot queries:

```bash
kubectl -n monitoring port-forward --address 127.0.0.1 \
  service/monitoring-kube-prometheus-prometheus 9090:9090
```

Open `http://localhost:9090`, then stop the tunnel with `Ctrl+C` when done.

## Running a stress test

Before a stress test, verify both scrape targets are **UP** and record the
machine resources, frame capture rate, and test duration. Prometheus counters
come from running pods, so a pod restart resets that pod's local counters.
**Time from upload to saved result** uses timestamps from the central API and
worker and does not depend on the kiosk clock. Record the load generator's
actual client count separately.

Run each load level (2, 5, 10, 20, 30 kiosks) for a fixed duration. Record
accepted and processed frame counts, failures, p95 processing duration,
CPU/memory, worker replicas, and restarts. Allow the queue to drain after each
run before calculating final completion rate from distinct frame IDs in the
database. Dashboard rates alone are not a delivery guarantee.

Frames that still fail after five attempts are placed in the internal
`video-frames-failed` Kafka topic and appear as **Frames held after retries**.
Any nonzero value needs investigation and must be included in the test report.

## CPU, RAM, and pod counts during a test

The top of **FaMiLiS Stress Test** shows current CPU cores, working-set RAM,
running application pods, and ready FER workers. CPU uses a one-minute average:
`1.0` means one core. Totals cover the `familis` namespace, not the entire laptop.
The per-pod charts show current and peak values for the selected time range.
Pod-level cgroup queries count each pod once and exclude child container cgroups.
These queries are verified against the local kind cluster's cgroup layout.
Missing metrics display **No data**, not a misleading zero.

For a test report, select the exact start/end time and record the actual kiosk
count separately. Use CPU/RAM per-pod history, ready pods by deployment, and
current/desired worker history alongside frame throughput and latency.
Historical data is available only while retained by Prometheus (configured for
seven days). Current stat cards show the value at the selected range's end.

The FER autoscaler targets 65% of a 250m CPU request per worker, with 1–6 workers.
It does not scale directly from kiosk count or total received frames. The
five-minute scale-down stabilization can keep extra workers after traffic ends.
One ready worker is distinct from the total number of application pods.
