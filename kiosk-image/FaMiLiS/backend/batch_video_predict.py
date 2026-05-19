# batch_video_predict.py - Stabilized with Action Units & Temporal Smoothing
import cv2
import numpy as np
import mediapipe as mp
import joblib
import warnings
from datetime import datetime
import os
from pathlib import Path
from collections import deque

warnings.filterwarnings('ignore', category=UserWarning, module='google.protobuf')

# Load Model
try:
    model = joblib.load("valence_model.pkl")
    scaler = joblib.load("scaler.pkl")
    model_stats = joblib.load("model_stats.pkl")
    train_mae = model_stats['mae']
except FileNotFoundError as e:
    print(f"❌ Error: {e}\n   Run train_model.py first!")
    exit(1)

# MediaPipe Setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5
)

os.makedirs("logs", exist_ok=True)
os.makedirs("captures", exist_ok=True)

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

def process_video_batch(video_path, filename, log_writer):
    cap = cv2.VideoCapture(video_path)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    
    stats = {'high_conf': 0, 'preds': 0, 'shots': 0}
    last_shot_time = 0
    valence_history = deque(maxlen=15)
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
            
        frame_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
        curr_time = frame_idx / fps if fps > 0 else 0
        
        # Process every nth frame to speed up batch processing
        if frame_idx % 3 != 0: continue
            
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)
        
        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            
            features = extract_facial_features(landmarks)
            features_scaled = scaler.transform([features])
            raw_valence = model.predict(features_scaled)[0]
            
            valence_history.append(raw_valence)
            smooth_valence = max(1.0, min(9.0, np.mean(valence_history)))
            
            base_confidence = 100 - (train_mae * 10)
            confidence = min(99.9, base_confidence + (abs(smooth_valence - 5.0) * 2.5))
            
            sentiment = "Positive" if smooth_valence > 5.5 else "Negative" if smooth_valence < 4.5 else "Neutral"
            stats['preds'] += 1
            
            if confidence >= 90.0:
                stats['high_conf'] += 1
                if curr_time - last_shot_time >= 2.0:
                    stats['shots'] += 1
                    last_shot_time = curr_time
                    shot_path = f"captures/batch_{filename}_sec{curr_time:.1f}.jpg"
                    cv2.imwrite(shot_path, frame)
                    log_writer.writerow([filename, f"{curr_time:.2f}", f"{smooth_valence:.2f}", sentiment, f"{confidence:.2f}", shot_path])
        else:
            valence_history.clear()
            
    cap.release()
    return stats

# Main batch execution
video_folder = "videos"
video_files = [f for f in os.listdir(video_folder) if Path(f).suffix.lower() in ['.mp4', '.avi', '.mov', '.mkv']]

if not video_files:
    print(f"❌ No videos found in '{video_folder}'.")
    exit()

timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
log_file = f"logs/batch_predict_{timestamp}.csv"

import csv
with open(log_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['video_file', 'time_sec', 'valence_score', 'sentiment', 'confidence_pct', 'screenshot_path'])
    
    print(f"\n🚀 Starting batch processing of {len(video_files)} videos...")
    
    total_stats = {'high_conf': 0, 'preds': 0, 'shots': 0}
    start_time = datetime.now()
    
    for idx, video_file in enumerate(video_files):
        print(f"[{idx+1}/{len(video_files)}] Processing {video_file}...")
        path = os.path.join(video_folder, video_file)
        
        v_stats = process_video_batch(path, video_file, writer)
        
        total_stats['high_conf'] += v_stats['high_conf']
        total_stats['preds'] += v_stats['preds']
        total_stats['shots'] += v_stats['shots']

end_time = datetime.now()
print(f"\n✅ BATCH COMPLETE in {end_time - start_time}")
print(f"   Total predictions: {total_stats['preds']}")
print(f"   Screenshots saved: {total_stats['shots']}")