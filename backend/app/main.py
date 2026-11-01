import hashlib
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google.genai import errors as genai_errors
from pydantic import BaseModel, ConfigDict, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import extract_job
from app.config import settings
from app.fetch_page import FetchError, canonical_url, fetch_page
from app.models import CV, JOB_STATUS, Application, Base, Job, engine, get_db

STATIC_DIR = Path(__file__).parent.parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    # ponytail: create_all sin migraciones; al primer cambio de esquema añadir Alembic + `alembic stamp` del baseline
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Job Pilot", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

JobStatus = Literal[JOB_STATUS]  # type: ignore[valid-type]


# --- Schemas API ------------------------------------------------------------


class CVIn(BaseModel):
    content_md: str


class CVOut(CVIn):
    model_config = ConfigDict(from_attributes=True)
    lang: Literal["es", "en"]
    updated_at: datetime


class JobCreate(BaseModel):
    url: str | None = None
    text: str | None = None

    @model_validator(mode="after")
    def one_of(self):
        if not (self.url or self.text):
            raise ValueError("Indica url o text")
        return self


class JobPatch(BaseModel):
    status: JobStatus | None = None
    position: float | None = None
    notes: str | None = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    source: str
    url: str | None
    title: str
    company: str
    location: str | None
    work_mode: str
    salary: str | None
    language: str
    requirements: list[str]
    technologies: list[str]
    description: str
    match_score: int | None
    match_reason: str | None
    deal_breakers: list[str]
    status: str
    position: float
    notes: str | None
    created_at: datetime
    updated_at: datetime


# --- Rutas ------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/cvs", response_model=list[CVOut])
def list_cvs(db: Session = Depends(get_db)):
    return db.scalars(select(CV).order_by(CV.lang)).all()


@app.put("/api/cvs/{lang}", response_model=CVOut)
def save_cv(lang: Literal["es", "en"], body: CVIn, db: Session = Depends(get_db)):
    cv = db.scalar(select(CV).where(CV.lang == lang)) or CV(lang=lang)
    cv.content_md = body.content_md
    db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


@app.get("/api/jobs", response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db)):
    # filtros en el cliente: un usuario, cientos de filas como mucho
    return db.scalars(select(Job).order_by(Job.position, Job.created_at.desc())).all()


@app.post("/api/jobs", response_model=JobOut, status_code=201)
async def create_job(body: JobCreate, db: Session = Depends(get_db)):
    if body.url:
        dedupe_key = canonical_url(body.url)
        if db.scalar(select(Job.id).where(Job.dedupe_key == dedupe_key)):
            raise HTTPException(409, "Esa oferta ya está guardada")
        try:
            page = await fetch_page(body.url)
        except FetchError as e:
            raise HTTPException(422, str(e)) from e
        llm_text, description = page.llm_text, page.description
    else:
        llm_text = description = body.text[:30_000]

    # el CV en inglés es la referencia de scoring; el de español si no hay otro
    cvs = {cv.lang: cv.content_md for cv in db.scalars(select(CV))}
    try:
        data = await extract_job(llm_text, cvs.get("en") or cvs.get("es"))
    except genai_errors.APIError as e:
        raise HTTPException(502, f"Gemini: {e.message}") from e
    if not data.is_job_posting:
        raise HTTPException(422, "El contenido no parece una oferta de empleo")

    if not body.url:
        dedupe_key = "text:" + hashlib.sha1(f"{data.company}|{data.title}".lower().encode()).hexdigest()
        if db.scalar(select(Job.id).where(Job.dedupe_key == dedupe_key)):
            raise HTTPException(409, "Esa oferta ya está guardada")

    job = Job(
        source="manual",
        dedupe_key=dedupe_key,
        url=body.url,
        description=description,
        status="to_apply",
        **data.model_dump(exclude={"is_job_posting", "is_active"}),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@app.patch("/api/jobs/{job_id}", response_model=JobOut)
def update_job(job_id: uuid.UUID, body: JobPatch, db: Session = Depends(get_db)):
    job = db.get(Job, job_id) or _404()
    if body.status == "applied" and job.status != "applied":
        finalized = db.scalar(select(Application.finalized_at).where(Application.job_id == job_id))
        if not finalized:
            raise HTTPException(409, "Revisa y confirma la candidatura antes de marcarla como Aplicado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    db.commit()
    db.refresh(job)
    return job


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    db.delete(db.get(Job, job_id) or _404())
    db.commit()


def _404():
    raise HTTPException(404, "No encontrado")


# Frontend estático (next export). Montado al final para no tapar /api.
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
