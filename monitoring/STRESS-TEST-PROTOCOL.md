# FaMiLiS evaluation protocol

This is a test plan, not measured results. Retain raw observations and report failures, missing measurements and exclusions. Do not infer kiosk count from pods or from the WebSocket registry: browser sessions can upload via the web server without registering there.

## Before recording

1. Record git revision, image IDs, hardware, OS, Docker/Kubernetes resources, network, frame resolution and capture interval, model version, worker limits, topic partitions, and autoscaling policy. Use consistent face-containing input and include no-face cases separately.
2. Verify both metrics targets show UP, run a real session, and confirm accepted frames, saved results and latency observations increase. Wait at least two scrapes (15 seconds apart). A healthy idle counter is zero; missing telemetry is unavailable. A latency without observations is undefined.
3. Use browser Network logs to confirm `POST /api/sessions/:sessionId/frames` returns 202 and a frameId. The route must forward to central ingestion. If it does not, inspect the deployed web image and the unresolved session-page merge conflicts before collecting results. A connected kiosk is not proof of frame traffic.
4. Record each device, kiosk ID, session ID, attempted upload sequence, returned frameId, request start/end, status or timeout. Use monotonic client timing. Keep test records free of unnecessary participant details.
5. Choose durations and pass criteria with the adviser before running. Suggested starting design: 2-minute warmup, 10-minute measured session, queue-drain period, three independent repetitions per level. Report warmup separately. Use identical workload settings; randomize level order across repetitions when feasible.

## Scenarios

| Scenario | Procedure | Evidence |
| --- | --- | --- |
| Baseline | One kiosk, from setup through connection, session start, frame capture, session end and results display | Client connection and request timings; inference; successful requests; throughput; CPU/RAM; matched saved records |
| Concurrency | Repeat at 2, 3, 4, 5, 10, 15, 20 and 30 simultaneous kiosks | Same metrics as baseline, actual active devices, workers, timestamps and all repetitions |
| Integrity and isolation | During every concurrency level, use known distinct kiosk/session pairs and distinguishable input sequences; inspect session results and analytics | Every acknowledged frameId maps to its expected kiosk/session exactly once; no foreign results, cross-session data, duplicates or unexplained missing results |
| Fault and recovery | With five kiosks active, disconnect one kiosk from the application network for a recorded interval (e.g. 60 s), restore it, and continue. Repeat separately for all five | Client errors/timeouts, accepted IDs before/during/after, recovery time, missing/duplicate records, session status and queue drain |
| Stability | Run a supported concurrency level for a predeclared long duration (e.g. two hours); separately ramp until a predeclared failure criterion | Success, mean/p95 latency, throughput, integrity, CPU/RAM trends, worker changes, restarts and recovery |

Disconnecting public internet may have no effect on a LAN-hosted service. Test loss of the actual kiosk-to-server path. Broker/database interruptions are separate fault scenarios; do not combine faults in the same run. Stop criteria should include persistent errors, unacceptable latency, memory exhaustion or unbounded backlog. Do not silently omit failed runs.

## Metric definitions

| Metric | Definition / reporting |
| --- | --- |
| Connection latency | Client start of connection/setup to confirmed usable connection; report mean and p95, failures separately. Not the same as frame response time. |
| Frame response time | Client upload start to HTTP response, including network and web/API handling. Report mean/p95 and status-specific timings. Timeouts remain failed attempts. Dashboard API time excludes the browser-to-web-server portion. |
| Inference latency | Worker successful prediction-call time, including image decode, face detection and feature/model work, excluding queue/storage. Report mean/p95 with sample count; separate face/no-face workload mix. |
| Processing latency | Prediction plus storage duration of a successful newly inserted frame attempt. Retries and prior failed attempts are not included in that attempt timer. |
| Acceptance-to-result latency | API timestamp before Kafka send to database commit; includes queue waiting and retries. Report mean/p95. |
| Successful request rate | Successful client responses / all client attempts × 100, including network failures in the denominator. Dashboard ingest success covers only requests reaching central API. |
| Throughput | Distinct successfully saved frameIds per measured second. Report accepted uploads/s separately. After drain, report eventual completion count separately from in-window throughput. |
| Session integrity | Matched distinct saved IDs / acknowledged IDs after drain; also report missing IDs, duplicate IDs, wrong kiosk/session ownership and unexpected IDs. This is not model accuracy. |
| CPU usage | Namespace cores and per-service cores, mean/peak over measured window; 1 core is not 1%. Worker HPA percentage divides CPU by its 250m request. |
| Memory usage | Namespace and per-service working-set bytes, mean/peak and trend; excludes laptop/monitoring overhead. Record host usage separately. |
| Recovery time | Network restoration to first successful new request, and separately to backlog fully drained. Report unrecovered sessions. |

Prometheus rate/increase values are sampled estimates and may be fractional. Use client logs and distinct database IDs for exact counts. Do not subtract process counters across restarts. Preserve raw time series and timestamps; seven-day Prometheus retention is not a publication archive.

## Why six pods and one worker are normal

The baseline is one web app, one central API, one Kafka broker, one ZooKeeper, one MySQL and one FER worker: six running pods. The worker is shared across kiosks. CPU HPA allows 1–6 workers, targets 65% of a 250m request (~0.1625 cores per worker), and waits up to five minutes before scaling down. Other services have fixed replicas. Six Kafka partitions permit at most six actively consuming workers in the group; session keys preserve partition ordering and can distribute unevenly. More connected but idle kiosks do not require more workers. Record CPU, latency and delivery under actual capture load before changing scaling policy.

## Recovery semantics to verify

The current worker retries processing up to five times, publishes persistent failures to `video-frames-failed`, then commits offsets. Database frameId uniqueness protects worker replay from duplicate emotion results. This does not guarantee end-to-end exactly-once delivery: central ingestion creates a new frameId for each HTTP submission, so a client retry after an ambiguous acknowledgement can produce another record. The web forwarding route does not itself persist an offline upload queue. Do not assume frames captured during disconnection are retained or automatically replayed. Record dropped, retried and ambiguous uploads explicitly and inspect actual client behavior in each scenario. Failed-topic frames require investigation/replay handling; do not count them as successful results.

For each run, reconcile the client manifest against `emotion_results` using frameId, session_id and kiosk_id. Compare session analytics/frame_logs as well, and inspect the results UI for each kiosk. Accepted IDs = saved IDs + failed-topic IDs + unresolved IDs after the declared drain deadline; record unexpected database IDs separately. Use controlled test sessions and read-only database exports, not production-data edits.

## Results table and graphs

Use one row per kiosk level per repetition, plus an aggregate with variability. First column must be kiosk count:

| Kiosks | Run | Duration | Attempts | Success % | Response mean/p95 ms | Inference mean/p95 ms | Saved frames/s | Integrity % | Missing/duplicate/wrong-session | CPU mean/peak cores | RAM mean/peak MiB | Workers min/max | Recovery s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | | |
| 4 | | | | | | | | | | | | | |
| 5 | | | | | | | | | | | | | |
| 10 | | | | | | | | | | | | | |
| 15 | | | | | | | | | | | | | |
| 20 | | | | | | | | | | | | | |
| 30 | | | | | | | | | | | | | |

After collecting data, graph kiosk count against response/inference latency, success %, throughput, CPU and memory with repetition variability. Plot integrity counts separately. For stability/recovery, plot metrics over elapsed time and annotate disconnect, restore, pod restart and scale events. Show units, sample counts, workload settings and missing observations. Do not fill unmeasured rows with zero or draw fabricated performance curves.

## Automatic session recovery acceptance test

The recording screen now pauses on a browser offline event, failed/timed-out upload, or failed server check. Checks repeat every three seconds with a five-second deadline; uploads have an eight-second deadline. Reconnection resumes only a connection-caused pause after the original session is verified active, not invalidated, still consented for testers, the processing endpoint is healthy, and the camera is ready. A manual, camera, no-face, initial or Stop-confirmation pause is never automatically resumed. `Stay paused` cancels automatic resumption. Keep the session tab open: loading the application itself while offline is not supported by an offline application cache.

1. Start a consented session and note its ID and timer. Disconnect the kiosk's actual network path. Confirm the recording and timer pause and the reconnecting banner appears.
2. Restore the connection. Confirm recording resumes without creating a new session, the ID is unchanged, and the timer excludes the paused interval. Verify new saved frames belong to that original session.
3. Repeat with the session already manually paused, and with `Stay paused` clicked during the outage. Verify it stays paused until Resume is clicked.
4. Repeat with Wi-Fi still connected but the application server unreachable. Verify failed checks/uploads trigger the same recovery path without relying only on `navigator.onLine`.
5. While disconnected, complete or invalidate the test session from the administrator side. Reconnect and verify recording stays blocked. Also test camera loss and absent/revoked consent.
6. Attempt Stop during an outage. Confirm it reports failure and remains paused with its session identity intact. After reconnecting, retry Stop; only an acknowledged stop navigates to the survey. Repeating Stop preserves the original recorded end time.
7. Confirm a monitoring viewer sees Paused/Recording after reconnecting, and reconcile frame IDs as described above. Offline frames are not buffered and ambiguous uploads are not automatically resubmitted; record the gap and any uncertain acknowledgement in the test evidence.

Automated recovery checks: with Node 22.18+ (native TypeScript stripping), run `node kiosk-image/FaMiLiS/tests/session-recovery.test.mjs` and `node kiosk-image/FaMiLiS/server/tests/monitor-status.test.mjs` from the repository root. These simulate transport failures; perform the physical kiosk checks above before reporting a measured recovery time.
