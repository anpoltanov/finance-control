# Docker commands

### login (PAT with write:packages / read:packages)
echo YOUR_GITHUB_PAT | docker login ghcr.io -u anpoltanov --password-stdin

### build
docker build -t ghcr.io/anpoltanov/finance-control:latest -f deploy/Dockerfile .

### push
docker push ghcr.io/anpoltanov/finance-control:latest

### tag + push a SHA pin
TAG=$(git rev-parse --short HEAD)
docker tag ghcr.io/anpoltanov/finance-control:latest ghcr.io/anpoltanov/finance-control:$TAG
docker push ghcr.io/anpoltanov/finance-control:$TAG

### pull / run stack
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d

### update to a new tag
APP_TAG=$TAG docker compose -f deploy/docker-compose.yml pull
APP_TAG=$TAG docker compose -f deploy/docker-compose.yml up -d

### local rebuild only (no push)
docker build -t finance-control:dev -f deploy/Dockerfile .