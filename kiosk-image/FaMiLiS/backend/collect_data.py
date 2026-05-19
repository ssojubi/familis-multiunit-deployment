# collect_data.py - Fixed version with speed control & working arrow keys
import cv2
import os
import csv
import time
import mediapipe as mp
from pathlib import Path

# Initialize MediaPipe FaceMesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5
)

def format_time(seconds):
    """Convert seconds to MM:SS format"""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"

def get_video_files(folder):
    """Get all video files from folder"""
    video_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv']
    if not os.path.exists(folder):
        return []
    
    return [
        f for f in os.listdir(folder) 
        if os.path.isfile(os.path.join(folder, f)) 
        and Path(f).suffix.lower() in video_extensions
    ]

def show_video_menu(video_folder):
    """Display video selection menu and return selected video"""
    video_files = get_video_files(video_folder)
    
    if not video_files:
        print(f"❌ No video files found in '{video_folder}' folder!")
        print(f"   Please add video files to continue.")
        return None
    
    print("=" * 70)
    print("🎥 VIDEO SELECTION MENU")
    print("=" * 70)
    for i, video in enumerate(video_files, 1):
        video_path = os.path.join(video_folder, video)
        size_mb = os.path.getsize(video_path) / (1024 * 1024)
        print(f"  [{i}] {video} ({size_mb:.1f} MB)")

    print("=" * 70)
    print("Select a video number (or press Enter to use the first video):")
    
    try:
        choice = input("> ").strip()
        if choice == '':
            selected_video = video_files[0]
        else:
            choice_idx = int(choice) - 1
            selected_video = video_files[choice_idx]
    except (ValueError, IndexError):
        print("❌ Invalid selection. Using first video.")
        selected_video = video_files[0]
    
    return selected_video

def process_video(video_path, selected_video_name, csv_path, sample_dir, saved_count=0):
    """Process a single video and return updated saved_count"""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Error: Could not open video file '{video_path}'")
        return saved_count

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps if fps > 0 else 0
    
    print(f"\n📹 Video Info:")
    print(f"   Resolution: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
    print(f"   FPS: {fps:.1f}")
    print(f"   Total Frames: {total_frames}")
    print(f"   Duration: {format_time(duration_sec)} ({duration_sec:.1f}s)")
    print("=" * 70)

    # Start PAUSED by default
    paused = True
    frame_count = 0
    playback_speed = 1.0
    base_frame_delay = int(1000 / fps) if fps > 0 else 33
    frame_delay = base_frame_delay

    print("\n▶️  Video started PAUSED. Press SPACE to play.")
    print("   Use ← → keys to navigate frame-by-frame.")

    while True:
        if not paused:
            ret, frame = cap.read()
            if not ret:
                print("\n🎬 End of video reached.")
                break
            frame_count += 1
            
            # Process frame for face detection
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(rgb_frame)
            
            # Draw face mesh if detected
            if results.multi_face_landmarks:
                h, w, _ = frame.shape
                for lm in results.multi_face_landmarks[0].landmark:
                    x, y = int(lm.x * w), int(lm.y * h)
                    cv2.circle(frame, (x, y), 1, (0, 255, 0), -1)
        else:
            # When paused, keep showing the current frame
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count)
                ret, frame = cap.read()
            if ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count)
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_mesh.process(rgb_frame)
                if results.multi_face_landmarks:
                    h, w, _ = frame.shape
                    for lm in results.multi_face_landmarks[0].landmark:
                        x, y = int(lm.x * w), int(lm.y * h)
                        cv2.circle(frame, (x, y), 1, (0, 255, 0), -1)

        # Display info overlay with TIMESTAMP
        progress = (frame_count / total_frames) * 100 if total_frames > 0 else 0
        elapsed_time = (frame_count / fps) if fps > 0 else 0
        
        # Top bar info with timestamp
        info_lines = [
            f"File {selected_video_name}",
            f"Frame: {frame_count}/{total_frames} ({progress:.1f}%)",
            f"Time: {format_time(elapsed_time)} / {format_time(duration_sec)}",
            f"Speed: {playback_speed:.1f}x",
            f"Saved: {saved_count}",
            f"Status: {'PAUSED' if paused else 'PLAYING'}"
        ]
        
        for i, line in enumerate(info_lines):
            cv2.putText(frame, line, (10, 30 + i * 25), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        cv2.imshow('Food Tasting Data Collection', frame)
        
        # Calculate delay based on playback speed
        frame_delay = int(base_frame_delay / playback_speed) if not paused else 50
        
# Use waitKeyEx to capture extended keys (like arrows) without stripping them
        key = cv2.waitKeyEx(frame_delay)
        char_key = key & 0xFF # We still use 0xFF for standard letters/symbols
        
        # ============ KEY HANDLERS ============
        
        if char_key == ord(' '):  # SPACE: Pause/Play
            paused = not paused
            status = "⏸️ PAUSED" if paused else "▶️ PLAYING"
            print(f"{status} at {format_time(elapsed_time)} (Frame {frame_count})")
        
        elif char_key == ord('s') and paused:  # S: Save frame + label
            print(f"\n{'='*50}")
            print(f"📝 SAVING FRAME {frame_count}")
            print(f"Time: {format_time(elapsed_time)} / {format_time(duration_sec)}")
            print(f"{'='*50}")
            
            timestamp = str(int(time.time()))
            filename = f"{sample_dir}/frame_{timestamp}.jpg"
            cv2.imwrite(filename, frame)
            print(f"✓ Frame saved: {filename}")
            
            # Get valence label
            while True:
                try:
                    print("\nRate this reaction (0-9):")
                    print("  0 = Really Disliked  |  3 = Disliked  |  5 = Neutral")
                    print("  7 = Liked            |  9 = Really Liked")
                    valence_input = input("Enter valence (0-9, or press Enter to skip): ").strip()
                    
                    if valence_input == '':  # Skip if empty
                        print("⏭️  Skipped this frame.")
                        os.remove(filename)
                        break
                    
                    valence = int(valence_input)
                    if 0 <= valence <= 9:
                        # ✅ ONLY TWO COLUMNS IN CSV
                        with open(csv_path, 'a', newline='') as f:
                            writer = csv.writer(f)
                            writer.writerow([filename, valence])
                        saved_count += 1
                        
                        # Show sentiment text
                        sentiment_map = {
                            0: "Really Disliked 😡", 1: "Very Disliked 😠", 2: "Disliked 😞",
                            3: "Somewhat Disliked 😕", 4: "Slightly Disliked 🙁", 5: "Neutral 😐",
                            6: "Slightly Liked 🙂", 7: "Somewhat Liked 😊", 8: "Liked 😄",
                            9: "Really Liked 😍"
                        }
                        print(f"✓ Labeled: {sentiment_map[valence]} (Valence = {valence})")
                        print(f"Total saved: {saved_count}")
                        print(f"{'='*50}\n")
                        break
                    else:
                        print("❌ Please enter a number between 0 and 9.")
                except ValueError:
                    print("❌ Invalid input. Please enter a number or press Enter to skip.")
        
        elif char_key == ord('q'):  # Q: Quit current video
            print(f"\n⏭️  Skipping to next video...")
            break
        
        elif char_key == 27:  # ESC: Exit entire program
            print(f"\n{'='*50}")
            print(f"⏹️  SESSION SUMMARY")
            print(f"{'='*50}")
            print(f"Total frames saved: {saved_count}")
            print(f"Labels file: {csv_path}")
            print(f"{'='*50}")
            cap.release()
            cv2.destroyAllWindows()
            face_mesh.close()
            exit(0)
        
        # ============ FIX: ARROW KEYS WORK CORRECTLY ============
        # We check the raw `key` (not masked). 
        # I've added Mac/Linux standard codes just in case you ever switch OS!
        
        elif key in (2490368, 65362, 82):  # ↑: Skip 1 frame
            new_pos = min(total_frames, frame_count + 1)
            cap.set(cv2.CAP_PROP_POS_FRAMES, new_pos)
            frame_count = new_pos
            print(f"⏩ +1 frame → Frame {frame_count}")
        
        elif key in (2621440, 65364, 84):  # ↓: Rewind 1 frame
            new_pos = max(0, frame_count - 1)
            cap.set(cv2.CAP_PROP_POS_FRAMES, new_pos)
            frame_count = new_pos
            print(f"⏪ -1 frame → Frame {frame_count}")
        
        elif key in (2424832, 65361, 81):  # ←: Rewind 5 frames
            new_pos = max(0, frame_count - 5)
            cap.set(cv2.CAP_PROP_POS_FRAMES, new_pos)
            frame_count = new_pos
            print(f"⏮️  -5 frames → Frame {frame_count}")
        
        elif key in (2555904, 65363, 83):  # →: Skip 5 frames
            new_pos = min(total_frames, frame_count + 5)
            cap.set(cv2.CAP_PROP_POS_FRAMES, new_pos)
            frame_count = new_pos
            print(f"⏭️  +5 frames → Frame {frame_count}")
        
        # ============ PLAYBACK SPEED ============
        elif char_key == ord('['):  # [: Decrease speed
            playback_speed = max(0.1, playback_speed - 0.2)
            frame_delay = int(base_frame_delay / playback_speed) if not paused else 50
            print(f"🐢 Playback speed: {playback_speed:.1f}x")
        
        elif char_key == ord(']'):  # ]: Increase speed
            playback_speed = min(4.0, playback_speed + 0.2)
            frame_delay = int(base_frame_delay / playback_speed) if not paused else 50
            print(f"🐇 Playback speed: {playback_speed:.1f}x")
        
        elif char_key == ord('r'):  # R: Reset speed
            playback_speed = 1.0
            frame_delay = base_frame_delay
            print(f"🔄 Playback speed reset to 1.0x")

    cap.release()
    return saved_count

# ============ MAIN PROGRAM ============
def main():
    video_folder = "Vid"
    
    # Setup output directories
    sample_dir = "data/samples"
    os.makedirs(sample_dir, exist_ok=True)
    
    csv_path = "data/labels.csv"
    if not os.path.exists(csv_path):
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['filename', 'valence'])  # ONLY these 2 columns
    
    print("=" * 70)
    print("FOOD TASTING DATA COLLECTION")
    print("=" * 70)
    print("Controls:")
    print("  SPACE  → Pause/Play")
    print("  S      → Save frame + label")
    print("  ← →    → Navigate 1 frame")
    print("  ↓ ↑    → Navigate 5 frames")
    print("  [ ]    → Adjust playback speed")
    print("  R      → Reset to 1x speed")
    print("  Q      → Skip to next video")
    print("  ESC    → Exit program completely")
    print("\nVALENCE SCALE (0-9):")
    print("  0 = Really Disliked  |  3 = Disliked  |  5 = Neutral")
    print("  7 = Liked            |  9 = Really Liked")
    print("=" * 70)
    
    saved_count = 0
    
    while True:
        # Show video selection menu
        selected_video = show_video_menu(video_folder)
        
        if selected_video is None:
            print("\nX No videos available. Exiting...")
            break
        
        video_path = os.path.join(video_folder, selected_video)
        
        # Process the selected video
        saved_count = process_video(video_path, selected_video, csv_path, sample_dir, saved_count)
        
        # Check if there are more videos
        remaining_videos = get_video_files(video_folder)
        if not remaining_videos:
            print("\n✅ All videos processed!")
            break
        
        # Ask if user wants to continue
        print("\n" + "=" * 70)
        print(f"PROGRESS: {saved_count} frames saved so far")
        print("=" * 70)
        print("Options:")
        print("  [1] Select another video")
        print("  [2] Exit program")
        
        choice = input("\nSelect option (1 or 2): ").strip()
        
        if choice == '2':
            print(f"\n{'='*50}")
            print(f"SESSION SUMMARY")
            print(f"{'='*50}")
            print(f"Total frames saved: {saved_count}")
            print(f"Labels file: {csv_path}")
            print(f"{'='*50}")
            break
        elif choice != '1':
            print("Invalid choice. Exiting...")
            break
    
    cv2.destroyAllWindows()
    face_mesh.close()
    print("\nData collection complete!")
    print(f"   Total frames saved: {saved_count}")
    print(f"   Labels file: {csv_path}")

if __name__ == "__main__":
    main()