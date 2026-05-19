"""
HTTP service for frame-based hedonic + confidence inference (section 6.3).
Reuses the same MediaPipe landmarks, scaler, and valence model as live_predict.py / video_predict.py.

Run from repo root or this directory:
  pip install -r requirements.txt
  python emotion_service.py

Expects valence_model.pkl, scaler.pkl, model_stats.pkl in the same folder as this file.
"""
from __future__ import annotations

import os
import threading
import warnings
from collections import defaultdict, deque
from pathlib import Path

import cv2
import joblib
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS

warnings.filterwarnings("ignore", category=UserWarning, module="google.protobuf")

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

MODEL = None
SCALER = None
TRAIN_MAE = 1.0
FACE_MESH = None
_MODEL_ERR: str | None = None

# session_id -> deque of raw valence predictions (1..9 scale)
_HISTORY_LOCK = threading.Lock()
_VALENCE_HISTORY: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=15))


def _load_models() -> None:
    global MODEL, SCALER, TRAIN_MAE, FACE_MESH, _MODEL_ERR
    try:
        MODEL = joblib.load(str(ROOT / "valence_model.pkl"))
        SCALER = joblib.load(str(ROOT / "scaler.pkl"))
        stats = joblib.load(str(ROOT / "model_stats.pkl"))
        TRAIN_MAE = float(stats.get("mae", 1.0))
    except FileNotFoundError as e:
        _MODEL_ERR = str(e)
        return

    import mediapipe as mp

    mp_face_mesh = mp.solutions.face_mesh
    FACE_MESH = mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    )
    _MODEL_ERR = None


def extract_facial_features(landmarks) -> np.ndarray:
    def dist(p1, p2):
        x1, y1 = landmarks[p1].x, landmarks[p1].y
        x2, y2 = landmarks[p2].x, landmarks[p2].y
        return float(np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2))

    d_eyes = dist(33, 263)
    if d_eyes == 0:
        d_eyes = 1e-6

    return np.array(
        [
            dist(78, 308) / d_eyes,
            dist(13, 14) / d_eyes,
            dist(11, 16) / d_eyes,
            dist(159, 145) / d_eyes,
            dist(386, 374) / d_eyes,
            dist(52, 159) / d_eyes,
            dist(282, 386) / d_eyes,
            dist(78, 33) / d_eyes,
            dist(308, 263) / d_eyes,
            dist(152, 1) / d_eyes,
        ],
        dtype=np.float64,
    )


def _sentiment_for(valence: float) -> str:
    if valence < 4.5:
        return "Negative"
    if valence > 5.5:
        return "Positive"
    return "Neutral"


def predict_frame_jpeg(session_id: str, jpeg_bytes: bytes) -> dict:
    if MODEL is None or SCALER is None or FACE_MESH is None:
        return {
            "ok": False,
            "error": _MODEL_ERR or "Model not loaded.",
            "faceDetected": False,
            "hedonicScore": None,
            "confidenceScore": None,
            "valence1to9": None,
            "sentiment": None,
        }

    arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {
            "ok": False,
            "error": "Invalid image data.",
            "faceDetected": False,
            "hedonicScore": None,
            "confidenceScore": None,
            "valence1to9": None,
            "sentiment": None,
        }

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = FACE_MESH.process(rgb)

    if not results.multi_face_landmarks:
        with _HISTORY_LOCK:
            _VALENCE_HISTORY[session_id].clear()
        return {
            "ok": True,
            "faceDetected": False,
            "hedonicScore": None,
            "confidenceScore": None,
            "valence1to9": None,
            "sentiment": None,
        }

    landmarks = results.multi_face_landmarks[0].landmark
    features = extract_facial_features(landmarks)
    features_scaled = SCALER.transform([features])
    raw_valence = float(MODEL.predict(features_scaled)[0])

    with _HISTORY_LOCK:
        hist = _VALENCE_HISTORY[session_id]
        hist.append(raw_valence)
        smooth_valence = float(np.mean(hist))

    smooth_valence = max(1.0, min(9.0, smooth_valence))
    base_confidence = 100.0 - (TRAIN_MAE * 10.0)
    confidence_pct = base_confidence + (abs(smooth_valence - 5.0) * 2.5)
    # Clamp so MAE-heavy models cannot yield negative %; DB expects confidence in 0..1.
    confidence_pct = max(0.0, min(99.9, confidence_pct))

    hedonic_01 = (smooth_valence - 1.0) / 8.0
    conf_01 = confidence_pct / 100.0

    return {
        "ok": True,
        "faceDetected": True,
        "hedonicScore": round(hedonic_01, 6),
        "confidenceScore": round(conf_01, 6),
        "valence1to9": round(smooth_valence, 3),
        "sentiment": _sentiment_for(smooth_valence),
    }


_load_models()
app = Flask(__name__)
CORS(app)


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "modelLoaded": MODEL is not None and FACE_MESH is not None,
            "error": _MODEL_ERR,
        }
    )


@app.post("/predict")
def predict():
    sid = (request.form.get("session_id") or request.args.get("session_id") or "").strip()
    if not sid:
        return jsonify({"ok": False, "error": "session_id is required."}), 400

    if "image" not in request.files:
        return jsonify({"ok": False, "error": "image file is required (field name: image)."}), 400

    f = request.files["image"]
    data = f.read()
    if not data:
        return jsonify({"ok": False, "error": "Empty image."}), 400

    out = predict_frame_jpeg(sid, data)
    status = 200 if out.get("ok") else 422
    return jsonify(out), status


@app.delete("/session/<session_id>/history")
def clear_history(session_id: str):
    with _HISTORY_LOCK:
        if session_id in _VALENCE_HISTORY:
            del _VALENCE_HISTORY[session_id]
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("EMOTION_SERVICE_PORT", "8765"))
    print(f"Emotion service on http://127.0.0.1:{port} (modelLoaded={MODEL is not None})")
    app.run(host="127.0.0.1", port=port, threaded=True)
