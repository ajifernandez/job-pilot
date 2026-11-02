import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.config import settings

LANGS = ("es", "en")
WORK_MODES = ("remote", "hybrid", "onsite", "unknown")
# inbox/dismissed = bandeja de entrada de la IA; el resto son columnas del Kanban
JOB_STATUS = ("inbox", "dismissed", "to_apply", "applying", "applied", "interview", "offer", "rejected", "discarded")


def enum(*values: str, name: str) -> Enum:
    # varchar + CHECK: añadir un valor no requiere ALTER TYPE
    return Enum(*values, name=name, native_enum=False, length=20)


def pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


def updated() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Base(DeclarativeBase):
    pass


class SearchProfile(Base):
    __tablename__ = "search_profiles"
    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(120))
    roles: Mapped[list[str]] = mapped_column(ARRAY(Text))
    technologies: Mapped[list[str]] = mapped_column(ARRAY(Text))
    work_modes: Mapped[list[str]] = mapped_column(ARRAY(Text))
    locations: Mapped[list[str]] = mapped_column(ARRAY(Text))
    min_salary: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    exclude_keywords: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    portals: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")  # dominios a priorizar
    min_score: Mapped[int] = mapped_column(Integer, default=60)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created()


class CV(Base):
    __tablename__ = "cvs"
    id: Mapped[uuid.UUID] = pk()
    lang: Mapped[str] = mapped_column(enum(*LANGS, name="cv_lang"), unique=True)
    content_md: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated()


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[uuid.UUID] = pk()
    profile_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("search_profiles.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(enum("ai", "manual", name="job_source"))
    dedupe_key: Mapped[str] = mapped_column(Text, unique=True)
    url: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    company: Mapped[str] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    work_mode: Mapped[str] = mapped_column(enum(*WORK_MODES, name="work_mode"), default="unknown")
    salary: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str] = mapped_column(enum("es", "en", "other", name="job_lang"))
    requirements: Mapped[list[str]] = mapped_column(ARRAY(Text))
    technologies: Mapped[list[str]] = mapped_column(ARRAY(Text), index=True)
    description: Mapped[str] = mapped_column(Text)
    match_score: Mapped[int | None] = mapped_column(Integer)
    match_reason: Mapped[str | None] = mapped_column(Text)
    deal_breakers: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    status: Mapped[str] = mapped_column(enum(*JOB_STATUS, name="job_status"), default="inbox", index=True)
    position: Mapped[float] = mapped_column(Float, default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    discard_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created()
    updated_at: Mapped[datetime] = updated()


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[uuid.UUID] = pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    cv_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cvs.id"))
    lang: Mapped[str] = mapped_column(enum(*LANGS, name="app_lang"))
    cover_letter_md: Mapped[str] = mapped_column(Text)
    summary_md: Mapped[str] = mapped_column(Text)
    highlights: Mapped[list[str]] = mapped_column(ARRAY(Text))
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    model: Mapped[str] = mapped_column(String(80))
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # null = borrador
    created_at: Mapped[datetime] = created()
    updated_at: Mapped[datetime] = updated()


class SearchRun(Base):
    __tablename__ = "search_runs"
    id: Mapped[uuid.UUID] = pk()
    profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("search_profiles.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(enum("running", "done", "failed", name="run_status"))
    candidates: Mapped[int] = mapped_column(Integer, default=0)
    inserted: Mapped[int] = mapped_column(Integer, default=0)
    queries: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    sources: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)  # [{domain, found, new, added, failed}]
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = created()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        yield db
