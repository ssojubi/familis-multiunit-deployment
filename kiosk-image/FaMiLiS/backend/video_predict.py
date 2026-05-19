# video_predict.py - Stabilized with Action Units & Temporal Smoothing
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

# MediaPipe
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

def get_video_files(folder):
    exts = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv']
    if not os.path.exists(folder): return []
    return [f for f in os.listdir(folder) if Path(f).suffix.lower() in exts]

def process_video(video_path, filename, log_file):
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    
    stats = {'high_conf': 0, 'preds': 0, 'screenshots': 0}
    last_shot_time = 0
    
    # Smoothing deque specific to this video instance
    valence_history = deque(maxlen=15)
    
    print(f"\n▶️ Processing: {filename} ({total_frames} frames @ {fps}fps)")
    print("Controls: SPACE to pause, 'q' to stop/skip")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
            
        frame_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
        curr_time = frame_idx / fps if fps > 0 else 0
        
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)
        
        display_frame = frame.copy()
        
        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            
            features = extract_facial_features(landmarks)
            features_scaled = scaler.transform([features])
            raw_valence = model.predict(features_scaled)[0]
            
            # Smooth prediction
            valence_history.append(raw_valence)
            smooth_valence = max(1.0, min(9.0, np.mean(valence_history)))
            
            base_confidence = 100 - (train_mae * 10)
            confidence = min(99.9, base_confidence + (abs(smooth_valence - 5.0) * 2.5))
            
            sentiment = "Positive" if smooth_valence > 5.5 else "Negative" if smooth_valence < 4.5 else "Neutral"
            color = (0,255,0) if sentiment == "Positive" else (0,0,255) if sentiment == "Negative" else (255,255,0)
            
            stats['preds'] += 1
            
            cv2.putText(display_frame, f"Hedonic: {smooth_valence:.1f}/9", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
            cv2.putText(display_frame, f"Conf: {confidence:.1f}%", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
            
            if confidence >= 90.0:
                stats['high_conf'] += 1
                if curr_time - last_shot_time >= 2.0:  # 2 sec cooldown
                    stats['screenshots'] += 1
                    last_shot_time = curr_time
                    shot_path = f"captures/{filename}_sec{curr_time:.1f}.jpg"
                    cv2.imwrite(shot_path, frame)
                    with open(log_file, 'a') as f:
                        f.write(f"{filename},{curr_time:.2f},{smooth_valence:.2f},{sentiment},{confidence:.2f},{shot_path}\n")
                        
                    cv2.putText(display_frame, "HIGH CONFIDENCE - SCREENSHOT SAVED", (20, 150), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        else:
            valence_history.clear() # Clear history if face lost

        cv2.imshow('Video Processing', display_frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'): break
        elif key == 32: # SPACE
            while True:
                if cv2.waitKey(1) & 0xFF == 32: break
                
    cap.release()
    return stats['high_conf'], stats['preds'], stats['screenshots']

# Main loop
video_folder = "videos"
log_file = f"logs/video_predictions_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
with open(log_file, 'w') as f: f.write("video,time_sec,valence,sentiment,confidence,screenshot_path\n")

while True:
    videos = get_video_files(video_folder)
    if not videos:
        print(f"❌ No videos found in '{video_folder}'.")
        break
        
    print("\n" + "="*50)
    for i, v in enumerate(videos): print(f"[{i+1}] {v}")
    
    choice = input("\nSelect video index (or 'q' to quit): ")
    if choice.lower() == 'q': break
    
    try:
        idx = int(choice) - 1
        if 0 <= idx < len(videos):
            process_video(os.path.join(video_folder, videos[idx]), videos[idx], log_file)
    except ValueError:
        pass

cv2.destroyAllWindows()