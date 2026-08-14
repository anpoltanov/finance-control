# Finance Control

Self-hosted personal finance web app (PWA) with Django REST API, dedicated PostgreSQL, and WalletApp CSV import.

## Stack

- **web** — Django + Gunicorn + React PWA (static files via WhiteNoise)
- **db** — PostgreSQL 16 (dedicated to this app only)

## Deploy with Portainer

1. Clone this repo on the host or build from git URL in Portainer.
2. Copy `.env.example` to `.env` and set secrets (`POSTGRES_PASSWORD`, `SECRET_KEY`, hosts).
3. In Portainer: **Stacks → Add stack** → upload [`deploy/docker-compose.yml`](deploy/docker-compose.yml).
4. Set environment variables from `.env` in the Portainer UI (or use *Load variables from .env file*).
5. Deploy the stack. Web listens on `WEB_PORT` (default **8080**).
6. Add [`deploy/apache-vhost.example.conf`](deploy/apache-vhost.example.conf) to your existing Apache and reload.
7. Create the first user via Portainer console on the **web** container:

```bash
python manage.py seed_user --username admin --password 'your-password'
```

## Local development

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
set DATABASE_URL=       # empty = SQLite for quick dev
python manage.py migrate
python manage.py seed_user --password admin
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite dev server proxies `/api` to `http://localhost:8000`.

## Features

- Accounts, categories, tags, transactions (expense / income / transfer with to-from-nowhere)
- Budgets with custom period start, monthly/yearly, rollover
- Planned transactions with manual commit and autocommit scheduler
- WalletApp CSV import with transfer leg pairing
- Reports with charts; IndexedDB offline cache
- MCP server for local AI agents (`python -m apps.mcp.server`)

## MCP server

Run alongside the stack (or on your workstation pointing at the API):

```bash
cd backend
export FINANCE_API_URL=http://localhost:8080/api/v1
export MCP_API_TOKEN=your-token
python -m apps.mcp.server
```

Configure the token in `.env` as `MCP_API_TOKEN`.
