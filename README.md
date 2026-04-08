# Martani AI Cloud

Martani AI Cloud is a self-hosted AI workspace that combines file storage, RAG-based chat, secure vault features, task automation, and a data pipeline for collection, transformation, and delivery.

This public repository is a sanitized open version prepared for review and collaboration. Local secrets, internal operational notes, and private environment files are intentionally excluded.

## What It Does

- File storage and explorer UI
- File indexing and semantic search
- RAG-based AI chat over your files
- Secure vault for credentials, API keys, and protected files
- Share links for files
- WebDAV-compatible file access
- Scheduled automation tasks
- Data pipeline modules:
  - Mining
  - Refinery
  - Bridge
  - Pipelines
- Admin tools for settings, users, tool registry, and usage

## Core Product Direction

Martani is best understood as three connected layers:

- `AI Drive`
  - Store files, index them, search them, and use them in AI workflows.
- `AI Assistant`
  - Ask questions, retrieve knowledge from your files, and perform task-oriented actions.
- `Data Ops`
  - Collect external data, transform it, and deliver it through reusable pipelines.

## Tech Stack

### Backend

- Python 3.12
- FastAPI
- SQLAlchemy 2.0
- PostgreSQL 16 + pgvector
- Redis
- Celery
- MinIO
- Alembic

### Frontend

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- TanStack Query
- Zustand

### AI / LLM

- OpenAI-compatible providers
- OpenRouter support
- Ollama support
- Local embedding support

## Repository Structure

```text
martani-ai-cloud/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── data/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── tasks/
│   │   └── webdav/
│   ├── alembic/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── locales/
│   │   └── types/
│   └── package.json
└── docker/
    ├── docker-compose.yml
    ├── docker-compose.dev.yml
    ├── docker-compose.test.yml
    ├── docker-compose.prod.yml
    └── *.env.example
```

## Quick Start

### Prerequisites

- Docker
- Docker Compose
- Optional LLM provider credentials

### 1. Start shared services

```bash
cd docker
docker network create martani-shared
docker compose up -d
```

### 2. Start the development stack

```bash
cd docker
docker compose -f docker-compose.dev.yml --env-file .env.dev.example up -d
```

### Default local endpoints

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- MinIO console: `http://localhost:9001`
- Ollama: `http://localhost:11434`

## Environment Files

Use example files as templates and replace all placeholder values before running anything outside a disposable local environment.

- `.env.example`
- `docker/.env.dev.example`
- `docker/.env.test.example`
- `docker/.env.prod.example`
- `frontend/.env.example`

Important placeholders that must be replaced:

- `CHANGE_ME_DB_PASSWORD`
- `CHANGE_ME_MINIO_ACCESS_KEY`
- `CHANGE_ME_MINIO_SECRET_KEY`
- `CHANGE_ME_MIN_32_CHARS`
- provider API keys

## Security Note

This repository has been prepared as a public-safe version, but you should still review all configuration before deployment.

At minimum:

- generate strong JWT and application secrets
- use unique database credentials
- replace MinIO defaults
- keep production `.env` files out of Git
- audit any admin-configured API keys and vault data

## Current Status

This codebase contains both production-grade features and in-progress modules. The most mature areas are:

- Files
- Search & Index
- Chat
- Vault
- Admin basics

The Data Ops area is structurally present and partially implemented, but some UI areas are still evolving.

## License

No open source license has been added yet.
