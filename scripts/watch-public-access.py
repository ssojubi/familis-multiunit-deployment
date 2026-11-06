#!/usr/bin/env python3
"""Publish the local Quick Tunnel address without restarting FaMiLiS."""
import concurrent.futures
import json
import re
import subprocess
import time
import urllib.request


def discover(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/quicktunnel", timeout=2) as response:
            hostname = json.load(response).get("hostname", "")
        if re.fullmatch(r"[a-z0-9-]+\.trycloudflare\.com", hostname):
            return "https://" + hostname
    except (OSError, ValueError):
        pass
    return ""


def main():
    previous = None
    while True:
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            urls = list(executor.map(discover, range(20241, 20246)))
        url = next((value for value in urls if value), "")
        manifest = {
            "apiVersion": "v1", "kind": "ConfigMap",
            "metadata": {"name": "familis-public-access", "namespace": "familis"},
            "data": {"current.json": json.dumps({"url": url, "updatedAt": time.time()})},
        }
        result = subprocess.run(["kubectl", "apply", "-f", "-"], input=json.dumps(manifest),
                                text=True, capture_output=True, timeout=20)
        if result.returncode:
            print(result.stderr.strip(), flush=True)
        elif previous != url:
            print(f"Public URL: {url or 'No local Quick Tunnel detected'}", flush=True)
            previous = url
        time.sleep(30)


if __name__ == "__main__":
    main()
