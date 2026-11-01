"""Páginas reales de ofertas (Ashby, con JSON-LD) guardadas en tests/fixtures.

- Parseo: offline, corre siempre.
- Extracción con Gemini: gasta cuota, solo con `RUN_LIVE=1 uv run pytest tests/test_fixtures.py`.
"""

import asyncio
import os
from pathlib import Path

import pytest

from app.fetch_page import parse_html

FIXTURES = {"splitmetrics": "SplitMetrics", "plentific": "Plentific", "scalera": "Scalera"}
CV = "Senior backend engineer, 8 years. Python, FastAPI, PostgreSQL, Docker, AWS. Based in Spain, wants remote."


def page(name):
    return parse_html((Path(__file__).parent / "fixtures" / f"{name}.html").read_text(), f"https://jobs.ashbyhq.com/{name}")


@pytest.mark.parametrize("name", FIXTURES)
def test_parses_json_ld_job_posting(name):
    p = page(name)
    assert p.llm_text.startswith("{") and '"JobPosting"' in p.llm_text
    assert len(p.description) > 1000
    assert "<" not in p.description  # HTML del JSON-LD convertido a texto


@pytest.mark.skipif(not os.getenv("RUN_LIVE"), reason="usa Gemini real; activar con RUN_LIVE=1")
def test_live_extraction():
    from app.ai import extract_job

    async def run():  # un solo event loop: el cliente de Gemini reutiliza conexiones
        return {n: await extract_job(page(n).llm_text, CV) for n in FIXTURES}

    for name, d in asyncio.run(run()).items():
        assert d.is_job_posting, name
        assert FIXTURES[name].lower() in d.company.lower(), name
        assert "backend" in d.title.lower() or "python" in d.title.lower(), name
        assert d.requirements and d.technologies, name
        assert 0 <= d.match_score <= 100 and d.match_reason, name
