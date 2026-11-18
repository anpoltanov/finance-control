FROM node:22-alpine AS frontend
WORKDIR /frontend
# Install from the lockfile. Rollup 4.68.6's parser rejects ordinary
# modules on Alpine; the lockfile stays on 4.62.4.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN mkdir -p ../backend/static/frontend
RUN npm run build

FROM python:3.13-slim AS backend
WORKDIR /app
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /backend/static/frontend ./static/frontend/
RUN chmod +x entrypoint.sh
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
