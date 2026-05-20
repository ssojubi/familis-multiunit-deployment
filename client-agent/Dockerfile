FROM python:3.11-slim

# Install system dependencies for OpenCV (headless still needs libgl, libglib, etc.)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent.py .

# Disable GUI preview (cv2.imshow would crash in a container)
ENV SHOW_PREVIEW=0

# Allow webcam access (must be passed at runtime with --device /dev/video0)
CMD ["python", "agent.py"]