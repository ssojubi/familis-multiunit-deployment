FROM python:3.11-slim

# install system dependencies
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

# install node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# cp FaMiLiS to the container
COPY FaMiLiS /app/familis/

# install python backend dependencies
WORKDIR /app/familis/backend
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir opencv-python-headless mediapipe scikit-learn pandas joblib numpy

# install Node dependencies (including tailwind CSS)
WORKDIR /app/familis
RUN npm install
RUN npm install tailwindcss @tailwindcss/vite tw-animate-css
RUN npm install socket.io
RUN npm install socket.io-client
RUN npm install -D @vitejs/plugin-basic-ssl
#possibly add npm install -g npm@11.14.1

EXPOSE 8765
EXPOSE 5173
EXPOSE 8080

# startup script to run both the backend, frontend(src), and server
COPY start.sh /app/start.sh
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

CMD ["/bin/sh", "/app/start.sh"]
