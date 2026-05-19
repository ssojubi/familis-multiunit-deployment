# train_model.py - Refactored for High Accuracy on Small Datasets
import cv2
import pandas as pd
import numpy as np
import mediapipe as mp
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
import joblib
import warnings
import os

warnings.filterwarnings('ignore')

# Initialize MediaPipe
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5
)

def extract_facial_features(landmarks):
    """
    Replaces 936 raw coordinates with 10 highly specific Action Units.
    Uses Euclidean distance, making it mathematically immune to head tilts!
    """
    def dist(p1, p2):
        x1, y1 = landmarks[p1].x, landmarks[p1].y
        x2, y2 = landmarks[p2].x, landmarks[p2].y
        return np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    
    # Scale Normalizer: Distance between outer corners of eyes
    # This ensures a face close to the camera scores the same as a face far away
    d_eyes = dist(33, 263)
    if d_eyes == 0: d_eyes = 1e-6 
        
    features = np.array([
        dist(78, 308) / d_eyes,    # 0. Mouth width (Smile stretch)
        dist(13, 14) / d_eyes,     # 1. Mouth inner height (Open mouth/surprise)
        dist(11, 16) / d_eyes,     # 2. Mouth outer height
        dist(159, 145) / d_eyes,   # 3. Left eye height (Squint/wide eye)
        dist(386, 374) / d_eyes,   # 4. Right eye height
        dist(52, 159) / d_eyes,    # 5. Left eyebrow height (Frown/raise)
        dist(282, 386) / d_eyes,   # 6. Right eyebrow height
        dist(78, 33) / d_eyes,     # 7. Left lip corner to eye (Smile lift)
        dist(308, 263) / d_eyes,   # 8. Right lip corner to eye
        dist(152, 1) / d_eyes      # 9. Jaw drop (Chin to nose tip)
    ])
    return features

def augment_data(X, y):
    """
    Artificially expands the tiny dataset by mirroring faces and adding noise.
    Turns 35 samples into 350 highly robust samples.
    """
    aug_X, aug_y = [], []
    for features, label in zip(X, y):
        # 1. Original
        aug_X.append(features)
        aug_y.append(label)
        
        # 2. Mirrored Face (swap left/right features)
        flipped = features.copy()
        flipped[3], flipped[4] = features[4], features[3] # Swap eyes
        flipped[5], flipped[6] = features[6], features[5] # Swap eyebrows
        flipped[7], flipped[8] = features[8], features[7] # Swap smile lifts
        aug_X.append(flipped)
        aug_y.append(label)
        
        # 3. Add synthetic camera noise (Jitter) to original
        for _ in range(4):
            noise = np.random.normal(0, 0.015, size=features.shape)
            aug_X.append(features + noise)
            aug_y.append(label)
            
        # 4. Add synthetic camera noise to mirrored
        for _ in range(4):
            noise = np.random.normal(0, 0.015, size=flipped.shape)
            aug_X.append(flipped + noise)
            aug_y.append(label)
            
    return np.array(aug_X), np.array(aug_y)

# Load data
print("Loading data...")
try:
    df = pd.read_csv("data/labels.csv")
    print(f"Found {len(df)} samples in labels.csv")
except FileNotFoundError:
    print("❌ Error: data/labels.csv not found!")
    exit(1)

X_raw = []
y_raw = []

for index, row in df.iterrows():
    img_path = row['filename']
    valence = float(row['valence'])
    
    if not os.path.exists(img_path):
        print(f"⚠️ Warning: Image {img_path} not found. Skipping.")
        continue
        
    image = cv2.imread(img_path)
    if image is None: continue
        
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(image_rgb)
    
    if results.multi_face_landmarks:
        landmarks = results.multi_face_landmarks[0].landmark
        features = extract_facial_features(landmarks)
        X_raw.append(features)
        y_raw.append(valence)

face_mesh.close()

if len(X_raw) == 0:
    print("❌ Error: No faces detected in any images.")
    exit(1)

print(f"Extracted features from {len(X_raw)} valid images.")

# Data Augmentation (Expanding dataset)
X_aug, y_aug = augment_data(X_raw, y_raw)
print(f"Augmented dataset from {len(X_raw)} to {len(X_aug)} samples.")

# Train/Test Split
X_train, X_test, y_train, y_test = train_test_split(X_aug, y_aug, test_size=0.15, random_state=42)

# Scaling
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Train Random Forest Model (Highly resistant to overfitting)
print("\nTraining Random Forest Regressor...")
model = RandomForestRegressor(
    n_estimators=150, 
    max_depth=7, 
    min_samples_leaf=2, 
    random_state=42
)
model.fit(X_train_scaled, y_train)

# Evaluation
y_pred = model.predict(X_test_scaled)
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"\n✅ Model Training Complete!")
print(f"   MAE (Mean Absolute Error): {mae:.2f}")
print(f"   R² Score: {r2:.3f}")

# Save core models
joblib.dump(model, "valence_model.pkl")
joblib.dump(scaler, "scaler.pkl")

# Save legacy bias params (disabled) to avoid breaking old predict scripts
bias_params = {'neutral_point': None, 'strength': 0.0, 'scale_min': 1, 'scale_max': 9, 'bias_enabled': False}
joblib.dump(bias_params, "bias_params.pkl")

# Save stats
model_stats = {'mae': mae, 'r2': r2, 'n_samples': len(X_raw), 'valence_range': (1, 9), 'bias_enabled': False}
joblib.dump(model_stats, "model_stats.pkl")

print("\n🚀 All files saved successfully! You can now run live_predict.py")