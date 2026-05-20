# central-server/app/services/kafka_consumer.py

from aiokafka import AIOKafkaConsumer
import json
import asyncio
from pathlib import Path
import mysql.connector
from mysql.connector import pooling
from datetime import datetime
import cv2
import numpy as np
import joblib
import warnings
from collections import defaultdict, deque

warnings.filterwarnings("ignore", category=UserWarning)

# ------------------------------
# Configuration
# ------------------------------
# Path to model files (copy them from FaMiLiS/backend/)
MODEL_DIR = Path(__file__).parent.parent.parent / "models"
FRAME_STORAGE_ROOT = Path("C:/frames")
FRAME_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

# MySQL connection pool
db_pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="emotion_pool",
    pool_size=10,
    host="localhost",
    port=3308,
    user="root",
    password="root",
    database="familis_central"
)

# ------------------------------
# Direct FER prediction (copy of their logic, no Flask)
# ------------------------------
_FACE_MESH = None
_MODEL = None
_SCALER = None
_TRAIN_MAE = 1.0
_HISTORY = defaultdict(lambda: deque(maxlen=15))

def _load_models():
    global _MODEL, _SCALER, _TRAIN_MAE, _FACE_MESH
    import mediapipe as mp
    mp_face_mesh = mp.solutions.face_mesh
    _FACE_MESH = mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    )
    _MODEL = joblib.load(str(MODEL_DIR / "valence_model.pkl"))
    _SCALER = joblib.load(str(MODEL_DIR / "scaler.pkl"))
    stats = joblib.load(str(MODEL_DIR / "model_stats.pkl"))
    _TRAIN_MAE = float(stats.get("mae", 1.0))
    print("FER models loaded successfully")

def extract_facial_features(landmarks):
    def dist(p1, p2):
        x1, y1 = landmarks[p1].x, landmarks[p1].y
        x2, y2 = landmarks[p2].x, landmarks[p2].y
        return float(np.sqrt((x2 - x1)**2 + (y2 - y1)**2))
    d_eyes = dist(33, 263)
    if d_eyes == 0:
        d_eyes = 1e-6
    return np.array([
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
    ], dtype=np.float64)

def predict_frame(session_id: str, jpeg_bytes: bytes) -> dict:
    global _MODEL, _SCALER, _TRAIN_MAE, _FACE_MESH, _HISTORY
    if _MODEL is None:
        _load_models()
    
    # Decode JPEG
    arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {
            "face_detected": False,
            "hedonic_score": None,
            "confidence": None,
            "valence": None,
            "sentiment": None,
            "error": "Invalid image"
        }
    
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = _FACE_MESH.process(rgb)
    
    if not results.multi_face_landmarks:
        # Clear history for this session when face not found
        _HISTORY[session_id].clear()
        return {
            "face_detected": False,
            "hedonic_score": None,
            "confidence": None,
            "valence": None,
            "sentiment": None,
            "error": None
        }
    
    landmarks = results.multi_face_landmarks[0].landmark
    features = extract_facial_features(landmarks)
    features_scaled = _SCALER.transform([features])
    raw_valence = float(_MODEL.predict(features_scaled)[0])
    
    # Smoothing using session history
    hist = _HISTORY[session_id]
    hist.append(raw_valence)
    smooth_valence = float(np.mean(hist))
    smooth_valence = max(1.0, min(9.0, smooth_valence))
    hedonic_01 = (smooth_valence - 1.0) / 8.0
    
    # Confidence based on model MAE
    base_confidence = 100.0 - (_TRAIN_MAE * 10.0)
    confidence_pct = base_confidence + (abs(smooth_valence - 5.0) * 2.5)
    confidence_pct = max(0.0, min(99.9, confidence_pct))
    conf_01 = confidence_pct / 100.0
    
    # Sentiment label
    if smooth_valence > 5.5:
        sentiment = "Positive"
    elif smooth_valence < 4.5:
        sentiment = "Negative"
    else:
        sentiment = "Neutral"
    
    return {
        "face_detected": True,
        "hedonic_score": round(hedonic_01, 6),
        "confidence": round(conf_01, 6),
        "valence": round(smooth_valence, 3),
        "sentiment": sentiment,
        "error": None
    }

# ------------------------------
# Helper: Store in MySQL
# ------------------------------
async def store_emotion_result(session_id: str, frame_id: str, result: dict):
    try:
        conn = db_pool.get_connection()
        cursor = conn.cursor()
        query = """
            INSERT INTO emotion_results 
            (session_id, frame_id, face_detected, hedonic_score, confidence, valence, sentiment, processed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(query, (
            session_id,
            frame_id,
            result.get("face_detected"),
            result.get("hedonic_score"),
            result.get("confidence"),
            result.get("valence"),
            result.get("sentiment"),
            datetime.now()
        ))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"DB error: {e}")

# ------------------------------
# Helper: Save frame to disk
# ------------------------------
async def save_frame_to_storage(kiosk_id: str, session_id: str, frame_id: str, frame_bytes: bytes):
    session_path = FRAME_STORAGE_ROOT / kiosk_id / session_id
    session_path.mkdir(parents=True, exist_ok=True)
    file_path = session_path / f"{frame_id}.jpg"
    file_path.write_bytes(frame_bytes)

# ------------------------------
# Main Kafka consumer
# ------------------------------
async def start_fer_consumer():
    # Load models before consuming
    _load_models()
    
    consumer = AIOKafkaConsumer(
        'video-frames',
        bootstrap_servers='localhost:9092',
        value_deserializer=lambda v: json.loads(v.decode()),
        group_id='fer-processor-group'
    )
    await consumer.start()
    
    try:
        async for msg in consumer:
            frame_data = msg.value
            kiosk_id = frame_data["kiosk_id"]
            session_id = frame_data["session_id"]
            frame_id = frame_data["frame_id"]
            frame_bytes = bytes.fromhex(frame_data["frame_bytes"])
            
            # Process frame directly (no HTTP call)
            result = predict_frame(session_id, frame_bytes)
            
            # Store result in MySQL
            await store_emotion_result(session_id, frame_id, result)
            
            # Save raw frame to disk (optional)
            await save_frame_to_storage(kiosk_id, session_id, frame_id, frame_bytes)
            
            print(f"Processed {frame_id}: face={result.get('face_detected')}, hedonic={result.get('hedonic_score')}, valence={result.get('valence')}")
    
    finally:
        await consumer.stop()