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
import os

warnings.filterwarnings("ignore", category=UserWarning)

# ------------------------------
# Configuration from environment
# ------------------------------
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
VIDEO_FRAMES_TOPIC = os.getenv("VIDEO_FRAMES_TOPIC", "video-frames")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3308"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "familis_central")
MODEL_DIR = Path(__file__).parent.parent.parent / "models"
FRAME_STORAGE_ROOT = Path(os.getenv("FRAME_STORAGE_ROOT", "C:/frames"))
FRAME_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


db_pool = None


_FACE_MESH = None
_MODEL = None
_SCALER = None
_TRAIN_MAE = 1.0
_HISTORY = defaultdict(lambda: deque(maxlen=15))

def _create_db_pool():
    return mysql.connector.pooling.MySQLConnectionPool(
        pool_name="emotion_pool",
        pool_size=10,
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )

def _ensure_db_schema():
    conn = db_pool.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS emotion_results (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL,
            frame_id VARCHAR(255) NOT NULL,
            face_detected BOOLEAN,
            hedonic_score DOUBLE,
            confidence DOUBLE,
            valence DOUBLE,
            sentiment VARCHAR(32),
            processed_at DATETIME NOT NULL,
            INDEX idx_emotion_results_session_id (session_id),
            INDEX idx_emotion_results_processed_at (processed_at)
        )
    """)
    conn.commit()
    cursor.close()
    conn.close()

async def wait_for_db(max_attempts: int = 30, delay_seconds: int = 2):
    global db_pool
    for attempt in range(1, max_attempts + 1):
        try:
            db_pool = _create_db_pool()
            conn = db_pool.get_connection()
            conn.close()
            _ensure_db_schema()
            print("MySQL connection pool ready")
            return
        except mysql.connector.Error as e:
            print(f"MySQL not ready ({attempt}/{max_attempts}): {e}")
            await asyncio.sleep(delay_seconds)

    raise RuntimeError("MySQL unavailable after retrying")

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
        if db_pool is None:
            await wait_for_db()
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
    await wait_for_db()

    # Load models before consuming
    _load_models()

    consumer = None
    for attempt in range(1, 31):
        consumer = AIOKafkaConsumer(
            VIDEO_FRAMES_TOPIC,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_deserializer=lambda v: json.loads(v.decode()),
            group_id='fer-processor-group',
        )
        try:
            await consumer.start()
            print(f"Kafka consumer ready for topic {VIDEO_FRAMES_TOPIC}")
            break
        except Exception as e:
            print(f"Kafka consumer not ready ({attempt}/30): {e}")
            try:
                await consumer.stop()
            except Exception:
                pass
            consumer = None
            await asyncio.sleep(2)
    else:
        raise RuntimeError("Kafka consumer unavailable after retrying")
    
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
