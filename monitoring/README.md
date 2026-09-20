# FaMiLiS stress-test monitoring

Install on the local `kind-familis` cluster:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace --values monitoring/values.yaml --wait
kubectl apply -f monitoring/familis-monitors.yaml
kubectl apply -f monitoring/dashboard-configmap.yaml
```

The application metrics require rebuilding and loading `familis-central-server:latest`
into kind, then rolling out `central-api` and `fer-worker`:

```bash
docker build -t familis-central-server:latest central-server
kind load docker-image familis-central-server:latest --name familis
kubectl -n familis apply -f k8s/base/central-api.yaml -f k8s/base/fer-worker.yaml
kubectl -n familis rollout restart deployment/central-api deployment/fer-worker
kubectl -n familis rollout status deployment/central-api
kubectl -n familis rollout status deployment/fer-worker
```

Check the namespace and image tags before restarting workloads in any other cluster.

Open the dashboard locally:

```bash
kubectl -n monitoring port-forward service/monitoring-grafana 3000:80
```

Visit `http://localhost:3000` and search for **FaMiLiS Stress Test**. The
username is `admin`. Retrieve the generated password privately with
`kubectl -n monitoring get secret monitoring-grafana -o jsonpath='{.data.admin-password}' | base64 -d`.
Do not place that password in test reports or screenshots.

Before a stress test, verify both targets are **UP** in Prometheus and note the
machine resources, frame capture rate, and test duration. The dashboard uses
Prometheus counters from running pods; a pod restart resets its local counters.
The WebSocket connection count is only the central registry count, not a count
of physical kiosks; record the load generator's actual client count separately.
The end-to-end duration uses the kiosk's capture timestamp, so synchronize
kiosk and server clocks before interpreting that panel.

Run each load level (2, 5, 10, 20, 30 kiosks) for a fixed duration. Record
accepted and processed frame counts, failures, p95 processing duration,
CPU/memory, worker replicas, and restarts. Allow the queue to drain after each
run before calculating final completion rate from distinct frame IDs in the
database. The dashboard's accepted and processed *rates* alone are not a
delivery guarantee.
