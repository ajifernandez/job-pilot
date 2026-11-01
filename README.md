# Job Pilot

Gestor de candidaturas con IA (Gemini): Kanban de ofertas, scoring contra tus CVs ES/EN y, próximamente, buscador automático y generación de cover letters.

Stack: FastAPI + PostgreSQL (SQLAlchemy) · Next.js (export estático servido por FastAPI) · Google Gemini.

## Estado (MVP, pasos 0–2)
- Alta manual de ofertas por URL o texto → extracción + match score (`gemini-3.5-flash-lite`).
- CVs ES/EN en Markdown.
- Lista con filtros por estado/tecnología; regla de servidor: no se pasa a *Aplicado* sin candidatura confirmada.
- Pendiente: Kanban drag & drop, candidaturas (cover letter), Job Finder (grounding), cron.

## Local
```bash
cp .env.example .env        # pon GEMINI_API_KEY
docker compose up -d --build   # http://localhost:8420
```
Desarrollo: `cd backend && uv run uvicorn app.main:app --reload` y `cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev`.
Tests: `cd backend && uv run pytest`.

## Dockge
1. "+ Compose" → nombre `job-pilot` → pega [`deploy/dockge-compose.yaml`](deploy/dockge-compose.yaml).
2. En el `.env` del stack: `GEMINI_API_KEY=...`, `POSTGRES_PASSWORD=...` (y `APP_PORT` si 8420 está ocupado).
3. Deploy. Para actualizar: Rebuild (clona el último commit de `main`).

Sin autenticación: exponer solo en LAN/Tailscale.
