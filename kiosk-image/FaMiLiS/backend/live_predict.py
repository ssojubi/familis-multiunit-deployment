# live_predict.py - Stabilized with Action Units & Temporal Smoothing
import cv2
import numpy as np
import mediapipe as mp
import joblib
import warnings
from datetime import datetime
import os
from collections import deque

warnings.filterwarnings('ignore', category=UserWarning, module='google.protobuf')

# Load models
try:
    model = joblib.load("valence_model.pkl")
    scaler = joblib.load("scaler.pkl")
    bias_params = joblib.load("bias_params.pkl")
    model_stats = joblib.load("model_stats.pkl")
    train_mae = model_stats['mae']
    print(f"✅ Model loaded (Training MAE: {train_mae:.2f})")
except FileNotFoundError as e:
    print(f"❌ Error: {e}\n   Run train_model.py first!")
    exit(1)

# Initialize MediaPipe
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5
)

os.makedirs("logs", exist_ok=True)
log_file = f"logs/high_confidence_{datetime.now().strftime('%Y%m%d')}.csv"
if not os.path.exists(log_file):
    with open(log_file, 'w') as f:
        f.write("timestamp,valence_score,sentiment,confidence\n")

# TEMPORAL SMOOTHING: Averages the last 15 frames for stable UX
valence_history = deque(maxlen=15)

def extract_facial_features(landmarks):
    def dist(p1, p2):
        x1, y1 = landmarks[p1].x, landmarks[p1].y
        x2, y2 = landmarks[p2].x, landmarks[p2].y
        return np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    
    d_eyes = dist(33, 263)
    if d_eyes == 0: d_eyes = 1e-6 
        
    return np.array([
        dist(78, 308) / d_eyes, dist(13, 14) / d_eyes, dist(11, 16) / d_eyes,
        dist(159, 145) / d_eyes, dist(386, 374) / d_eyes, dist(52, 159) / d_eyes,
        dist(282, 386) / d_eyes, dist(78, 33) / d_eyes, dist(308, 263) / d_eyes,
        dist(152, 1) / d_eyes
    ])

cap = cv2.VideoCapture(0)
print("\n🎥 Live Prediction Started. Press 'q' to quit.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break
    
    frame = cv2.flip(frame, 1)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)
    
    if results.multi_face_landmarks:
        landmarks = results.multi_face_landmarks[0].landmark
        
        # Extract features and predict
        features = extract_facial_features(landmarks)
        features_scaled = scaler.transform([features])
        raw_valence = model.predict(features_scaled)[0]
        
        # Apply Temporal Smoothing
        valence_history.append(raw_valence)
        smooth_valence = np.mean(valence_history)
        
        # Bound limits
        smooth_valence = max(1.0, min(9.0, smooth_valence))
        valence_int = int(round(smooth_valence))
        
        # Calculate Confidence
        base_confidence = 100 - (train_mae * 10)
        dist_from_neutral = abs(smooth_valence - 5.0)
        confidence = min(99.9, base_confidence + (dist_from_neutral * 2.5))
        
        # Get Sentiment
        if smooth_valence < 4.5:
            sentiment, val_color = "Negative", (0, 0, 255)
        elif smooth_valence > 5.5:
            sentiment, val_color = "Positive", (0, 255, 0)
        else:
            sentiment, val_color = "Neutral", (255, 255, 0)
            
        conf_color = (0, 255, 0) if confidence >= 90 else (0, 255, 255) if confidence >= 70 else (0, 0, 255)
        
        # UI Overlays
        cv2.putText(frame, f"Hedonic: {smooth_valence:.1f}/9", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, val_color, 2)
        cv2.putText(frame, f"Sentiment: {sentiment}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, val_color, 2)
        cv2.putText(frame, f"Confidence: {confidence:.1f}%", (20, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.8, conf_color, 2)
        
        # Log if highly confident
        if confidence >= 90:
            cv2.putText(frame, "LOGGING HIGH CONFIDENCE", (20, 190), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            with open(log_file, 'a') as f:
                f.write(f"{datetime.now().strftime('%H:%M:%S')},{smooth_valence:.2f},{sentiment},{confidence:.2f}\n")
    else:
        # Clear history if face leaves frame
        valence_history.clear()
        cv2.putText(frame, "No face detected", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
    cv2.imshow('Live Emotion Recognition', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()