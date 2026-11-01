"""Job Finder: descubre ofertas con Gemini, las verifica descargando la página,
las puntúa contra el CV e inserta en el Kanban (status=to_apply) las que superan
el umbral del perfil. Sin bandeja de entrada ni importación manual."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.ai import JobExtraction, extract_job, discover
from app.config import settings
from app.fetch_page import canonical_url, fetch_page
from app.models import CV, Job, SearchProfile, SearchRun, SessionLocal

log = logging.getLogger("finder")
CONCURRENCY = 4
_lock = asyncio.Lock()  # una búsqueda a la vez: protege la cuota de Gemini
_tasks: set[asyncio.Task] = set()


def accepts(data: JobExtraction, profile: SearchProfile) -> bool:
    if not (data.is_job_posting and data.is_active) or data.match_score < profile.min_score:
        return False
    title = data.title.lower()
    return not any(k.lower() in title for k in profile.exclude_keywords)


def preferences(p: SearchProfile) -> dict:
    return {
        "roles": p.roles, "technologies": p.technologies, "work_modes": p.work_modes,
        "locations": p.locations, "min_salary": p.min_salary, "currency": p.currency,
    }


def start_run(profile_id) -> SearchRun:
    with SessionLocal() as db:
        run = SearchRun(profile_id=profile_id, status="running")
        db.add(run)
        db.commit()
        db.refresh(run)
    task = asyncio.create_task(_execute(run.id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return run


async def _execute(run_id) -> None:
    async with _lock:
        with SessionLocal() as db:
            run = db.get(SearchRun, run_id)
            profile = db.get(SearchProfile, run.profile_id)
            try:
                run.inserted = await _search(db, run, profile)
                run.status = "done"
            except Exception as e:  # noqa: BLE001 - se guarda en la fila para verlo en la UI
                log.exception("search run failed")
                db.rollback()
                run = db.get(SearchRun, run_id)
                run.status, run.error = "failed", str(e)[:500]
            run.finished_at = datetime.now(timezone.utc)
            db.commit()


async def _search(db, run: SearchRun, profile: SearchProfile) -> int:
    cvs = {cv.lang: cv.content_md for cv in db.scalars(select(CV))}
    cv_md = cvs.get("en") or cvs.get("es")
    if not cv_md:
        raise RuntimeError("Guarda al menos un CV antes de buscar")

    known_keys = set(db.scalars(select(Job.dedupe_key)))
    known_titles = {(c.lower(), t.lower()) for c, t in db.execute(select(Job.company, Job.title))}
    candidates = {}
    for c in await discover(profile):
        key = canonical_url(c.url)
        if key not in known_keys and (c.company.lower(), c.title.lower()) not in known_titles:
            candidates.setdefault(key, c)
    run.candidates = len(candidates)
    db.commit()

    sem = asyncio.Semaphore(CONCURRENCY)
    errors: list[str] = []

    async def process(key, cand):
        async with sem:
            try:
                page = await fetch_page(cand.url)
                return key, page, await extract_job(page.llm_text, cv_md, preferences(profile))
            except Exception as e:  # noqa: BLE001 - una oferta rota no tumba la búsqueda
                errors.append(f"{cand.url}: {e}")
                return None

    inserted = 0
    for res in await asyncio.gather(*(process(k, c) for k, c in candidates.items())):
        if not res or not accepts(res[2], profile):
            continue
        key, page, data = res
        pair = (data.company.lower(), data.title.lower())
        if pair in known_titles:
            continue
        known_titles.add(pair)
        db.add(Job(
            source="ai", profile_id=profile.id, dedupe_key=key, url=page.url,
            description=page.description, status="to_apply",
            **data.model_dump(exclude={"is_job_posting", "is_active"}),
        ))
        inserted += 1
    if errors and not inserted and len(errors) == len(candidates):
        raise RuntimeError(errors[0])  # todo falló: probablemente cuota o red
    return inserted


async def scheduler() -> None:
    """Cada 15 min lanza los perfiles activos cuya última ejecución es más vieja que el intervalo."""
    interval = timedelta(hours=settings.search_interval_hours)
    while True:
        await asyncio.sleep(900)
        try:
            with SessionLocal() as db:
                due = db.scalars(select(SearchProfile).where(SearchProfile.active)).all()
                now = datetime.now(timezone.utc)
                due = [p for p in due if p.last_run_at is None or now - p.last_run_at >= interval]
                for p in due:
                    p.last_run_at = now
                db.commit()
            for p in due:
                start_run(p.id)
        except Exception:  # noqa: BLE001
            log.exception("scheduler tick failed")


def fail_stale_runs() -> None:
    """Runs que quedaron en 'running' por un reinicio del contenedor."""
    with SessionLocal() as db:
        db.execute(update(SearchRun).where(SearchRun.status == "running")
                   .values(status="failed", error="Interrumpida por reinicio", finished_at=datetime.now(timezone.utc)))
        db.commit()
