FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system libraries needed by OpenCV/MediaPipe.
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libxcb1 \
    libxcb-shm0 \
    libxcb-xfixes0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN for attempt in 1 2 3; do \
      pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt && exit 0; \
      echo "pip install failed on attempt ${attempt}; retrying"; \
      sleep 5; \
    done; \
    exit 1

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
