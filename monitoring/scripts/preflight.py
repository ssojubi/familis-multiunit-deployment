#!/usr/bin/env python3
"""Read-only cluster/telemetry checks. Does not create sessions or inject faults."""
import json
import subprocess
import sys
import urllib.parse

failures = []
def check(label, ok, detail):
    print(f"{'PASS' if ok else 'FAIL'} {label}: {detail}")
    if not ok:
        failures.append(label)

def kubectl(*args):
    return json.loads(subprocess.check_output(['kubectl', *args], text=True, timeout=30))

def query(expr):
    url = '/api/v1/namespaces/monitoring/services/monitoring-kube-prometheus-prometheus:9090/proxy/api/v1/query?query='
    data = kubectl('get', '--raw', url + urllib.parse.quote(expr, safe=''))
    if data.get('status') != 'success':
        raise RuntimeError(str(data))
    return data['data']['result']

try:
    for name in ('familis', 'central-api', 'fer-worker'):
        d = kubectl('-n', 'familis', 'get', 'deployment', name, '-o', 'json')
        desired = d['spec'].get('replicas', 1)
        ready = d.get('status', {}).get('availableReplicas', 0)
        check(name, desired > 0 and ready >= desired, f'{ready}/{desired} available')
    pods = kubectl('-n', 'familis', 'get', 'pods', '-o', 'json')['items']
    for p in pods:
        if p['status'].get('phase') == 'Succeeded':
            continue
        statuses = p['status'].get('containerStatuses', [])
        check(p['metadata']['name'], bool(statuses) and all(c['ready'] for c in statuses),
              f"{p['status'].get('phase')}; restarts={sum(c.get('restartCount', 0) for c in statuses)}")
    for container in ('central-api', 'fer-worker'):
        rows = query(f'up{{namespace="familis",container="{container}"}}')
        check(container + ' telemetry', bool(rows) and all(float(r['value'][1]) == 1 for r in rows), f'{len(rows)} scrape targets')
    for metric, container in [('familis_frames_accepted_total', 'central-api'),
                              ('familis_ingest_request_seconds_count', 'central-api'),
                              ('familis_frames_processed_total', 'fer-worker'),
                              ('familis_frame_inference_seconds_count', 'fer-worker')]:
        rows = query(f'{metric}{{namespace="familis",container="{container}"}}')
        check(metric, bool(rows), 'present (zero is valid before traffic)' if rows else 'missing')
except (subprocess.SubprocessError, OSError, ValueError, KeyError, RuntimeError) as exc:
    check('preflight execution', False, str(exc))
print('\nStill required: one real camera session, saved-result verification, two-device monitoring and disconnect/reconnect smoke tests. This check does not prove end-to-end success or session integrity.')
sys.exit(1 if failures else 0)
