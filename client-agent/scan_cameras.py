#!/usr/bin/env python3
import cv2
import os
from pathlib import Path

OUTPUT_DIR = Path("C:/frames/camera_scan")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

START_INDEX = int(os.getenv("START_INDEX", "0"))
MAX_INDEX = int(os.getenv("MAX_INDEX", str(START_INDEX)))

for index in range(START_INDEX, MAX_INDEX + 1):
    print(f"Checking camera index {index}...")
    cap = cv2.VideoCapture(index)

    if not cap.isOpened():
        print(f"  index {index}: not available")
        continue

    ok = False
    frame = None
    for _ in range(10):
        ok, frame = cap.read()
        if ok and frame is not None:
            break

    if ok and frame is not None:
        height, width = frame.shape[:2]
        output = OUTPUT_DIR / f"camera_{index}_{width}x{height}.jpg"
        cv2.imwrite(str(output), frame)
        print(f"  index {index}: saved {output}")
    else:
        print(f"  index {index}: opened but no frames")

    cap.release()

print(f"Done. Check snapshots in {OUTPUT_DIR}")
