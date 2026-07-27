#!/bin/bash

# Start Backend API Server on port 8080
cd /app/familis
PORT=8080 npm run server &

# Start Frontend (port 5173)
cd /app/familis
npm run dev -- --host 0.0.0.0 &

# Keep the container running
wait
