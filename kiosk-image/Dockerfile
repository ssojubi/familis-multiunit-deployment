FROM python:3.11-slim

# Install system dependencies for OpenCV (NO MySQL - will connect to separate container)
RUN apt-get update && \
    apt-get install -y curl \
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

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy their FaMiLiS folder
COPY FaMiLiS /app/familis/

# Install Python backend dependencies
WORKDIR /app/familis/backend
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir opencv-python-headless mediapipe scikit-learn pandas joblib numpy

# Install Node dependencies (including Tailwind CSS)
WORKDIR /app/familis
RUN npm install
RUN npm install tailwindcss @tailwindcss/vite tw-animate-css

EXPOSE 8765
EXPOSE 5173
EXPOSE 8080

# Startup script - NO MySQL, will connect to external DB
RUN echo '#!/bin/bash\n\
    # Start FER WebSocket\n\
    cd /app/familis/backend\n\
    python emotion_service.py &\n\
    \n\
    # Start Backend API Server on port 8080\n\
    cd /app/familis\n\
    PORT=8080 npm run server &\n\
    \n\
    # Start Frontend (port 5173)\n\
    cd /app/familis/src\n\
    npm run dev -- --host 0.0.0.0\n\
    ' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"]