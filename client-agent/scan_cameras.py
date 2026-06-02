#!/usr/bin/env python3
import os
import platform
import time
from pathlib import Path

import cv2


OUTPUT_DIR = Path(os.getenv("CAMERA_SCAN_OUTPUT", "C:/frames/camera_scan"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

START_INDEX = int(os.getenv("START_INDEX", "0"))
MAX_INDEX = int(os.getenv("MAX_INDEX", "5"))
CAMERA_BACKEND = os.getenv("CAMERA_BACKEND", "auto").lower()


def backend_names():
    system = platform.system()
    if CAMERA_BACKEND != "auto":
        return [CAMERA_BACKEND]
    if system == "Windows":
        return ["dshow", "msmf", "any"]
    if system == "Darwin":
        return ["avfoundation", "any"]
    return ["any"]


BACKENDS = {
    "any": cv2.CAP_ANY,
    "dshow": getattr(cv2, "CAP_DSHOW", cv2.CAP_ANY),
    "msmf": getattr(cv2, "CAP_MSMF", cv2.CAP_ANY),
    "avfoundation": getattr(cv2, "CAP_AVFOUNDATION", cv2.CAP_ANY),
}


for index in range(START_INDEX, MAX_INDEX + 1):
    for backend_name in backend_names():
        backend = BACKENDS.get(backend_name, cv2.CAP_ANY)
        print(f"Checking camera index {index} with backend {backend_name}...")
        cap = cv2.VideoCapture(index, backend)

        if not cap.isOpened():
            print(f"  index {index}, backend {backend_name}: not available")
            cap.release()
            continue

        ok = False
        frame = None
        for _ in range(10):
            ok, frame = cap.read()
            if ok and frame is not None:
                break
            time.sleep(0.1)

        if ok and frame is not None:
            height, width = frame.shape[:2]
            output = OUTPUT_DIR / f"camera_{index}_{backend_name}_{width}x{height}.jpg"
            cv2.imwrite(str(output), frame)
            print(f"  index {index}, backend {backend_name}: saved {output}")
        else:
            print(f"  index {index}, backend {backend_name}: opened but no frames")

        cap.release()

print(f"Done. Check snapshots in {OUTPUT_DIR}")
