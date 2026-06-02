#!/bin/bash

# Start FER WebSocket
cd /app/familis/backend
python3.11 emotion_service.py &

# Start Backend API Server on port 8080
cd /app/familis
PORT=8080 npm run server &

# Start Frontend (port 5173)
cd /app/familis
npm run dev -- --host 0.0.0.0