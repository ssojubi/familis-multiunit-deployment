FROM node:22-bookworm-slim

WORKDIR /app/familis

COPY FaMiLiS/package.json FaMiLiS/package-lock.json ./
RUN npm ci

COPY FaMiLiS ./
COPY start.sh /app/start.sh

RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

EXPOSE 5173
EXPOSE 8080

CMD ["/bin/sh", "/app/start.sh"]
