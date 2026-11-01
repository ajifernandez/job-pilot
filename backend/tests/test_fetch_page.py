import asyncio
import json

import pytest

from app.fetch_page import FetchError, canonical_url, fetch_page, parse_html

POSTING = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Senior Python Engineer",
    "hiringOrganization": {"@type": "Organization", "name": "Acme"},
    "description": "&lt;p&gt;Build &lt;b&gt;APIs&lt;/b&gt; with FastAPI.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;5+ years&lt;/li&gt;&lt;/ul&gt;",
}


def test_json_ld_preferred_over_page_text():
    html = f"""<html><head><script type="application/ld+json">{json.dumps({"@graph": [{"@type": "WebPage"}, POSTING]})}</script></head>
    <body><nav>Menu</nav><p>Cookie banner</p></body></html>"""
    page = parse_html(html, "https://x.test/job")
    assert "Senior Python Engineer" in page.llm_text
    assert "Cookie banner" not in page.llm_text
    assert page.description == "Build APIs with FastAPI.\n5+ years"


def test_falls_back_to_visible_text():
    page = parse_html("<html><head><title>t</title></head><body><nav>x</nav><h1>Backend Dev</h1><script>var a</script><p>Remote</p></body></html>", "u")
    assert page.llm_text == "Backend Dev\nRemote"


def test_canonical_url_strips_tracking():
    assert canonical_url("HTTPS://Jobs.Lever.co/acme/123/?utm_source=li&lever-source=x#apply") == "https://jobs.lever.co/acme/123?lever-source=x"


@pytest.mark.parametrize("url", ["http://127.0.0.1:8000/api", "http://192.168.1.1/", "file:///etc/passwd", "http://localhost/"])
def test_rejects_private_targets(url):
    with pytest.raises(FetchError):
        asyncio.run(fetch_page(url))
