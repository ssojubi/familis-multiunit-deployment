#!/bin/bash

# Start Backend API Server on port 8080
cd /app/familis
PORT=8080 npm run server &

# Start Frontend (port 5173). The image ships a production build (dist/), served by
# `vite preview`, which keeps vite.config.ts's HTTPS and /api, /uploads, /socket.io proxy.
# Set FRONTEND_MODE=dev on the deployment to run the Vite dev server instead (hot reload,
# but ~100 unbundled module requests per page load, which is slow over tunnels and Wi-Fi).
cd /app/familis
if [ "$FRONTEND_MODE" = "dev" ]; then
  npm run dev -- --host 0.0.0.0 &
else
  npm run preview -- --host 0.0.0.0 --port 5173 --strictPort &
fi

# Keep the container running
wait
