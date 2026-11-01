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


def test_choose_cv_by_language_with_fallback():
    from app.ai import choose_cv

    both = {"es": "CV-ES", "en": "CV-EN"}
    assert choose_cv(both, "es") == "CV-ES"
    assert choose_cv(both, "en") == "CV-EN"
    assert choose_cv(both, "other") == "CV-EN"  # idioma desconocido -> inglés
    assert choose_cv(both, "es", override="en") == "CV-EN"  # toggle manual
    assert choose_cv({"en": "CV-EN"}, "es") == "CV-EN"  # falta el ES -> el otro
    assert choose_cv({}, "es") is None


def test_portal_and_domain_helpers():
    from app.finder import domain_of, normalize_portal

    assert normalize_portal("https://www.RemoteOK.com/jobs/") == "remoteok.com/jobs"
    assert normalize_portal("weworkremotely.com") == "weworkremotely.com"
    assert normalize_portal("no es un dominio") == ""
    assert normalize_portal("palabra") == ""
    assert domain_of("https://www.Jobs.Lever.co/acme/1?x=1") == "jobs.lever.co"
