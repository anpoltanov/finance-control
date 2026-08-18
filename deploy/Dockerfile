FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN mkdir -p ../backend/static/frontend
RUN npm run build

FROM python:3.12-slim AS backend
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /backend/static/frontend ./static/frontend/
RUN chmod +x entrypoint.sh
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
