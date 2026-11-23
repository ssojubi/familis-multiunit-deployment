# Monitoring

Prometheus collects FaMiLiS metrics and Grafana displays them. Run commands from the
repository root with the `docker-desktop` context. (On a Linux `kind` cluster the steps are the
same; only the cluster start/stop commands differ.)

## 1. Install or update (once, or after changing `values.yaml`)

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack `
  --namespace monitoring --create-namespace --values monitoring/values.yaml --wait --timeout 10m
kubectl apply -f monitoring/familis-monitors.yaml
kubectl apply -f monitoring/dashboard-configmap.yaml
kubectl apply -f monitoring/test-overview-configmap.yaml
```

`values.yaml` caps the stack's memory (about 1 GB in total) so it fits beside FaMiLiS in
Docker Desktop's VM, and turns off control-plane scrapes that cannot work on Docker Desktop.
On a slow first start Grafana may restart once or twice while it creates its database.

After changing metrics in `central-server/`, rebuild that image and restart the API and workers
(`familis-central-server:latest` is used with `imagePullPolicy: IfNotPresent`):

```powershell
$version = "local-" + (Get-Date -Format "yyyyMMddHHmmss")
docker build -t "familis-central-server:$version" .\central-server
$node = kubectl get nodes -o jsonpath='{.items[0].metadata.name}'
docker save -o ".\central-$version.tar" "familis-central-server:$version"
docker cp ".\central-$version.tar" "${node}:/root/central-$version.tar"
docker exec $node ctr -n k8s.io images import --all-platforms "/root/central-$version.tar"
docker exec $node ctr -n k8s.io images tag --force "docker.io/library/familis-central-server:$version" docker.io/library/familis-central-server:latest
docker exec $node rm -f "/root/central-$version.tar"; Remove-Item ".\central-$version.tar"
kubectl -n familis rollout restart deployment/central-api deployment/fer-worker
```

## 2. Check readiness

```powershell
kubectl -n monitoring get pods
python monitoring/scripts/preflight.py
```

All pods should be `Running`. `preflight.py` is read-only and should print only `PASS` lines.

## 3. Open Grafana

Get the password (username `admin`). Keep it out of reports and source control:

```powershell
$p = kubectl -n monitoring get secret monitoring-grafana -o jsonpath='{.data.admin-password}'
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p))
```

In a separate terminal (keep it open; loopback keeps monitoring private to this laptop):

```powershell
kubectl -n monitoring port-forward --address 127.0.0.1 service/monitoring-grafana 3000:80
```

- [FaMiLiS — Test Day Overview](http://localhost:3000/d/familis-test-overview)
- [FaMiLiS Stress Test](http://localhost:3000/d/familis-stress-test/familis-stress-test) — set the test time range and refresh every `5s`.

Prometheus (scrape targets, ad-hoc queries):

```powershell
kubectl -n monitoring port-forward --address 127.0.0.1 service/monitoring-kube-prometheus-prometheus 9090:9090
```

Keep Grafana and Prometheus as `ClusterIP` services bound to `127.0.0.1`. Do not expose them
through Traefik, `0.0.0.0` or a Cloudflare tunnel.

## 4. Verify before recording results

- Web app copies and processing workers ready: above zero. Containers unavailable: zero.
- Frames received and frames finished increase after a normal session.
- Frames held after retries (`video-frames-failed`) stays zero; include any in the report.
- Scrape targets for `central-api` and `fer-worker` are `UP`.

Notes: CPU `1.0` = one core. Pod restarts reset counters. Prometheus keeps seven days of
history. FER workers scale 1–6 at 65% of their 250m CPU request; scale-down can take five minutes.

## Troubleshooting

| Problem | Action |
| --- | --- |
| Port 3000 in use | Use `3300:80` and open `http://localhost:3300`. |
| Dashboard missing | `kubectl apply -f monitoring/dashboard-configmap.yaml`, then refresh. |
| Blank charts | Check the time range and that both FaMiLiS targets are `UP`; a blank graph may only mean no traffic. |
| Inference panels empty | The `central-server` image predates the metric; rebuild it (step 1). |
| Pods evicted / cluster slow | Docker Desktop's VM is near its memory limit; stop other workloads or uninstall monitoring with `helm -n monitoring uninstall monitoring`. |
