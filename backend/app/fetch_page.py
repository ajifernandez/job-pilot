"""Descarga una URL de oferta y la reduce a texto para el LLM.

Prioriza el JSON-LD schema.org/JobPosting (lo publican casi todos los ATS); si no
existe, usa el texto visible de la página.
"""

import ipaddress
import json
import socket
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import httpx

MAX_CHARS = 30_000
MAX_BYTES = 3_000_000
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


class FetchError(Exception):
    pass


@dataclass
class Page:
    url: str
    llm_text: str  # lo que se envía al modelo
    description: str  # texto plano que se guarda en jobs.description


class _Parser(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "head", "nav", "footer"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text: list[str] = []
        self.ld: list[str] = []
        self._skip = 0
        self._in_ld = False

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type") == "application/ld+json":
            self._in_ld = True
            self.ld.append("")
        elif tag in self.SKIP:
            self._skip += 1
        elif tag in {"p", "br", "li", "h1", "h2", "h3", "h4", "div", "tr"}:
            self.text.append("\n")

    def handle_endtag(self, tag):
        if self._in_ld and tag == "script":
            self._in_ld = False
        elif tag in self.SKIP and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._in_ld:
            self.ld[-1] += data
        elif not self._skip:
            self.text.append(data)


def html_to_text(html: str) -> str:
    p = _Parser()
    p.feed(html)
    lines = (" ".join(line.split()) for line in "".join(p.text).splitlines())
    return "\n".join(line for line in lines if line)


def _find_job_posting(node):
    if isinstance(node, list):
        return next((r for n in node if (r := _find_job_posting(n))), None)
    if isinstance(node, dict):
        t = node.get("@type")
        if t == "JobPosting" or (isinstance(t, list) and "JobPosting" in t):
            return node
        return _find_job_posting(node.get("@graph"))
    return None


def parse_html(html: str, url: str) -> Page:
    p = _Parser()
    p.feed(html)
    for raw in p.ld:
        try:
            posting = _find_job_posting(json.loads(raw))
        except json.JSONDecodeError:
            continue
        if posting:
            description = html_to_text(unescape(str(posting.get("description", ""))))
            posting = {**posting, "description": description}
            return Page(url, json.dumps(posting, ensure_ascii=False)[:MAX_CHARS], description[:MAX_CHARS])
    text = html_to_text(html)[:MAX_CHARS]
    return Page(url, text, text)


def _check_public(url: str) -> None:
    # ponytail: no cubre DNS rebinding entre esta comprobación y la conexión; basta en LAN
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise FetchError("URL no válida")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or 443)
    except socket.gaierror as e:
        raise FetchError(f"No se resuelve {parts.hostname}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise FetchError("URL apunta a una red privada")


async def fetch_page(url: str) -> Page:
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": UA, "Accept-Language": "es,en;q=0.8"}) as client:
        for _ in range(5):  # redirects manuales: cada salto pasa el filtro de red privada
            _check_public(url)
            async with client.stream("GET", url) as res:
                if res.is_redirect:
                    url = urljoin(url, res.headers["location"])
                    continue
                if res.status_code >= 400:
                    raise FetchError(f"La página respondió {res.status_code}")
                body = b""
                async for chunk in res.aiter_bytes():
                    body += chunk
                    if len(body) > MAX_BYTES:
                        break
                return parse_html(body.decode(res.encoding or "utf-8", errors="replace"), url)
    raise FetchError("Demasiadas redirecciones")


def canonical_url(url: str) -> str:
    parts = urlsplit(url.strip())
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if not k.lower().startswith(("utm_", "gh_src", "ref"))])
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), query, ""))
