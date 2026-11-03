# Test-day checklist and metric guide

Use the supplied `FaMiLiS_Multi_Kiosk_Testing_Handout-ver1.docx` as the results form. Keep it unchanged. This guide distinguishes available telemetry from measurements still needed for that form.

## Before participants arrive

1. Run `python3 monitoring/scripts/preflight.py` from the repository root. Resolve FAIL results. This is read-only and does not run the experiments.
2. Keep application and Grafana port-forwards open (commands in `monitoring/README.md`). If using Cloudflare, keep that process open too; use the same current public URL and testing room on both devices.
3. Open **FaMiLiS — Test Day Overview** in Grafana. Verify both collection panels say UP.
4. Complete one authorized synthetic/replay session. Confirm camera permission, actual uploads, accepted and saved counters rising, inference timing appearing, and the correct saved session in analytics. Allow at least two scrape intervals.
5. Connect a second kiosk and monitor on the same Wi-Fi. Confirm both cameras actually play and each result belongs to the correct session. Use Reconnect cameras if needed; an unresolved black screen is a failed smoke test.
6. Disconnect one test kiosk briefly. Record its session ID before and after. Confirm the timer pauses, the same session resumes after reconnection, new uploads save, and the other kiosk stays usable. Verify a manual pause stays paused.
7. Record backend hardware/OS, build, model version/checksum, workload/capture frequency, network, log location and clock synchronization. Declare pass/fail thresholds before testing. Keep real participant data and credentials out of shared evidence.

## Run order

Use 1 kiosk as the baseline; then 2, 3, 4, 5, 10, 15, 20, 30. Keep payloads, capture frequency and duration constant. Record physical/simulated/hybrid mode. Repeat three times where feasible. Mark unperformed scenarios N/T. Do not escalate a load level until the previous run has saved results and reconciled records.

Assign a run ID and record exact start/end timestamps. Select that absolute interval in Grafana for summary readings; charts labelled “rolling” retain their stated averaging windows. Allow processing to finish and record the drain period separately: saves in an interval can include frames accepted before it, so counts alone do not establish run completion. Keep request-level logs for pooled p95; never average separate p95 values.

For fault tests, inject only one declared fault at a time. Record injection, restoration, first successful post-restoration transaction and session ID. Recovery is restoration to that successful transaction, not merely the browser's online indicator. Network interruption pauses capture; **offline frames are not buffered/replayed**. Stop/reload/force-close and backend restart are separate scenarios: do not assume they have identical recovery semantics.

For soak tests, use the handout's selected duration (60 minutes is its starting suggestion). Compare early/late latency, throughput and memory under the same workload. Save logs around crashes/restarts. A high RAM reading alone does not establish a leak.

## Read the overview, one metric at a time

| Panel | Meaning and interpretation |
| --- | --- |
| API / Worker metrics collection | UP = Prometheus can read metrics. DOWN/MISSING = investigate collection. UP alone does not prove successful sessions. |
| Ready shared processing workers | Number of inference worker pods. Workers serve multiple kiosks. |
| All application service pods | Web, API, database, queue and workers. Six baseline pods does not mean six kiosks. |
| API acceptance success (%) | Fraction of central API requests returning 2xx. Network failures before arrival and later processing failures are excluded. |
| Mean API acceptance latency (ms) | Server time to handle the ingest request and queue acknowledgement. It is not completed inference or client end-to-end time. |
| Mean inference latency (ms) | Prediction call including decoding and face detection, excluding database storage; successful calls including retries. |
| Saved-result throughput (frames/s) | Average new persisted frames per second during the selected interval. Higher is useful only if errors and latency remain acceptable. |
| p95 queue-to-saved result (ms) | Estimated 95th percentile from API acceptance to database save. Includes queue delay; excludes client upload and result delivery. |
| Container restarts | Restarts during the selected interval. Investigate nonzero values and retain evidence. |
| Accepted and saved frames/min | Rolling trends. Temporary separation can be queue delay. Persistent separation needs logs and reconciliation. |
| Processing failures / dead-letter frames | Failed attempts and exhausted retries. Retries mean attempts are not distinct failed requests. |
| Application CPU per pod (cores) | One core means 1.0. This is application workload CPU, not whole-host CPU %. |
| Application RAM per pod | Working-set memory. This is not the whole host's RAM consumption. |
| Shared workers current vs requested | Autoscaler actual and desired replicas, from 1–6. More kiosks do not automatically require more pods. |
| Worker scaling signal | Worker CPU as a percentage of its CPU request; HPA target 65%. Scale-down can take five minutes. |

**Zero** means an observed zero. **Not measured / No data** means unavailable or undefined; never replace it with a claimed zero. Latency has no value before timed processing occurs. Counter increases and histogram p95 are Prometheus estimates, not exact request logs.

## What the handout still needs outside Grafana

- **Table A:** exact requests submitted/succeeded/failed/timed out and client submission-to-completed-result times. HTTP 202 proves queue acceptance only. Retain per-request timestamps and terminal outcomes; the current dashboard does not implement this client-side log. Record these as Not measured until collected, not as server latency substitutes.
- **Host CPU/RAM:** measure the identified backend host separately with a consistent sampling interval. Application cores/working-set RAM must be labelled as such and cannot fill whole-host CPU%/RAM fields unchanged.
- **Table B:** independently prepare expected synthetic kiosk/session/participant/product records and reconcile the database/analytics against them. Report missing, duplicate, wrong-link and ordering counts. No dashboard percentage establishes session isolation.
- **Table C:** retain exact fault/recovery times and actual observed data loss/duplicates. Do not promise zero loss during offline capture.
- **Table D:** retain full-duration resource and latency time series, request counts and crash/restart evidence.

Save each run's evidence before starting another. Grafana panel menu → Inspect → Data supports CSV export of the selected query, but those exports do not replace raw client request logs. Capture screenshots with visible time ranges and run IDs in the accompanying filenames.
