# test_final_working.py
import mediapipe as mp

print("MediaPipe version:", mp.__version__)
print("Has solutions attribute:", hasattr(mp, 'solutions'))

if hasattr(mp, 'solutions'):
    # Access face_mesh THROUGH the main module
    FaceMesh = mp.solutions.face_mesh.FaceMesh
    
    # Create instance
    fm = FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5
    )
    print("✅ FaceMesh created successfully!")
    fm.close()
else:
    print("❌ 'solutions' not available")