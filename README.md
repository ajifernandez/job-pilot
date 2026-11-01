# Job Pilot

Gestor de candidaturas con IA (Gemini): Kanban de ofertas, scoring contra tus CVs ES/EN y, próximamente, buscador automático y generación de cover letters.

Stack: FastAPI + PostgreSQL (SQLAlchemy) · Next.js (export estático servido por FastAPI) · Google Gemini.

## Estado
- **Tablero Kanban** con drag & drop (el orden se guarda en servidor), vista lista y filtros por tecnología, origen (IA/manual) y fecha.
- **Búsqueda automática**: define perfiles en `/search`; Gemini (Google Search grounding) descubre ofertas, se verifica cada URL descargando la página, se puntúa contra tu CV y las que superan el score mínimo entran solas en *Por aplicar*. Se ejecuta cada `SEARCH_INTERVAL_HOURS` (12 por defecto, 0 = desactivada) o con *Buscar ahora*. Descartar una oferta de la IA la oculta pero evita que vuelva a aparecer.
- Alta manual de ofertas por URL o texto, CVs ES/EN en Markdown.
- Regla de servidor: no se pasa a *Aplicado* sin candidatura confirmada (el flujo de candidaturas/cover letters es el siguiente paso).

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
