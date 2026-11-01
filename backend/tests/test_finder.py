from types import SimpleNamespace

from app.ai import JobExtraction
from app.finder import accepts

PROFILE = SimpleNamespace(min_score=60, exclude_keywords=["Junior", "intern"])


def job(**kw):
    base = dict(is_job_posting=True, is_active=True, title="Senior Python Engineer", company="Acme",
                location=None, work_mode="remote", salary=None, language="en", requirements=[],
                technologies=[], match_reason="ok", deal_breakers=[], match_score=80)
    return JobExtraction(**{**base, **kw})


def test_accepts_good_match():
    assert accepts(job(), PROFILE)


def test_rejects_low_score_closed_non_posting_and_excluded_title():
    assert not accepts(job(match_score=59), PROFILE)
    assert not accepts(job(is_active=False), PROFILE)
    assert not accepts(job(is_job_posting=False), PROFILE)
    assert not accepts(job(title="Python Intern"), PROFILE)
