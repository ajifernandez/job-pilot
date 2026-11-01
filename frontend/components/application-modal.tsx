"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, Application, Job } from "@/lib/api";

type Tab = "letter" | "summary" | "analysis";
const TABS: [Tab, string][] = [["letter", "Cover letter"], ["summary", "Resumen y highlights"], ["analysis", "Análisis"]];
const field = "w-full rounded border border-zinc-300 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// una línea por highlight, sin viñetas
const toLines = (s: string) => s.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);

export function ApplicationModal({ job, onClose, onChanged }: { job: Job; onClose: () => void; onChanged: () => void }) {
  const [app, setApp] = useState<Application | null>(null);
  const [cover, setCover] = useState("");
  const [summary, setSummary] = useState("");
  const [highlights, setHighlights] = useState("");
  const [notes, setNotes] = useState(job.notes ?? "");
  const [tab, setTab] = useState<Tab>("letter");
  const [loaded, setLoaded] = useState(false); // ya sabemos si existe una candidatura guardada
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const dirty = useRef(false);

  const apply = useCallback((a: Application) => {
    setApp(a);
    setCover(a.cover_letter_md);
    setSummary(a.summary_md);
    setHighlights(a.highlights.join("\n"));
    dirty.current = false;
  }, []);

  const generate = useCallback(
    async (lang?: "es" | "en") => {
      setBusy("Generando con IA… (~25 s)");
      setError("");
      try {
        apply(await api<Application>(`/api/jobs/${job.id}/application/generate`, { method: "POST", body: JSON.stringify({ lang: lang ?? null }) }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy("");
      }
    },
    [job.id, apply],
  );

  useEffect(() => {
    api<Application | null>(`/api/jobs/${job.id}/application`)
      .then((a) => a && apply(a))
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [job.id, apply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const payload = () => JSON.stringify({ cover_letter_md: cover, summary_md: summary, highlights: toLines(highlights), notes });

  async function submit(kind: "save" | "finalize") {
    setBusy(kind === "save" ? "Guardando…" : "Confirmando…");
    setError("");
    try {
      const path = kind === "save" ? "" : "/finalize";
      const a = await api<Application>(`/api/jobs/${job.id}/application${path}`, { method: kind === "save" ? "PUT" : "POST", body: payload() });
      setApp(a);
      dirty.current = false;
      onChanged();
      if (kind === "finalize") onClose();
      else setMsg("Borrador guardado");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function switchLang(lang: "es" | "en") {
    if (lang === app?.lang) return;
    if (dirty.current && !confirm("Cambiar de idioma regenera el texto y pierdes tus ediciones. ¿Continuar?")) return;
    generate(lang);
  }

  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    set(e.target.value);
    dirty.current = true;
    setMsg("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="app-title" className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="app-title" className="text-lg font-semibold">Candidatura: {job.title}</h2>
            <p className="text-sm text-zinc-500">{job.company} · oferta en {job.language.toUpperCase()}{app?.finalized_at && " · ✓ confirmada"}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-zinc-400 hover:text-zinc-700">✕</button>
        </div>

        {app && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex gap-1" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded px-3 py-1 ${tab === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Idioma del CV y la carta">
            <span className="text-zinc-500">CV/carta:</span>
            {(["es", "en"] as const).map((l) => (
              <button key={l} onClick={() => switchLang(l)} disabled={!!busy} aria-pressed={app?.lang === l} className={`rounded border px-2 py-0.5 ${app?.lang === l ? "border-violet-600 bg-violet-600 text-white" : "border-zinc-300 dark:border-zinc-700"}`}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>}

        {loaded && !app && !busy && (
          <div className="rounded border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
            <p className="mb-1 text-sm">Aún no hay candidatura para esta oferta.</p>
            <p className="mb-4 text-xs text-zinc-500">Generarla usa Gemini (unos 25 s y tokens). No se hace hasta que lo pidas.</p>
            <div className="flex justify-center gap-2">
              {(["es", "en"] as const).map((l) => {
                const suggested = (job.language === "es" ? "es" : "en") === l;
                return (
                  <button key={l} onClick={() => generate(l)} className={`rounded px-4 py-2 text-sm ${suggested ? "bg-violet-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`}>
                    Generar con CV en {l === "es" ? "español" : "inglés"}{suggested && " (recomendado)"}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {busy && !app && <p className="py-16 text-center text-sm text-zinc-500" role="status">{busy}</p>}
        {busy && app && <p className="mb-2 text-sm text-violet-700" role="status">{busy}</p>}

        {app && (
          <div className={busy ? "opacity-50" : ""}>
            {tab === "letter" && (
              <>
                <textarea aria-label="Cover letter (Markdown)" rows={16} value={cover} onChange={edit(setCover)} className={`${field} font-mono`} />
                <button onClick={() => navigator.clipboard.writeText(cover).then(() => setMsg("Copiada"))} className="mt-1 text-xs text-zinc-500 hover:underline">Copiar carta</button>
              </>
            )}
            {tab === "summary" && (
              <div className="space-y-3">
                <label className="block text-sm font-medium">Resumen adaptado (ATS)<textarea rows={5} value={summary} onChange={edit(setSummary)} className={`${field} mt-1 font-normal`} /></label>
                <label className="block text-sm font-medium">Highlights (uno por línea)<textarea rows={6} value={highlights} onChange={edit(setHighlights)} className={`${field} mt-1 font-normal`} /></label>
              </div>
            )}
            {tab === "analysis" && (
              <div className="space-y-3 text-sm">
                {app.analysis?.ats_keywords.length ? <p><b>Palabras clave ATS:</b> {app.analysis.ats_keywords.join(", ")}</p> : null}
                <ul className="space-y-2">
                  {app.analysis?.matched_experience.map((m) => (
                    <li key={m.requirement} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                      <b>{m.requirement}</b>
                      <p>{m.evidence}</p>
                      <p className="text-xs text-zinc-500">CV: {m.cv_section}</p>
                    </li>
                  ))}
                </ul>
                {app.analysis?.gaps.length ? <p className="text-amber-700"><b>Huecos (no incluidos en la carta):</b> {app.analysis.gaps.join(" · ")}</p> : null}
              </div>
            )}
            <label className="mt-3 block text-sm font-medium">Notas de la postulación<textarea rows={2} value={notes} onChange={edit(setNotes)} className={`${field} mt-1 font-normal`} /></label>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-zinc-500" role="status">{msg}</span>
          <div className="flex gap-2">
            <button onClick={() => submit("save")} disabled={!app || !!busy} className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700">Guardar borrador</button>
            <button onClick={() => submit("finalize")} disabled={!app || !!busy} className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50">Confirmar y marcar Aplicado</button>
          </div>
        </div>
      </div>
    </div>
  );
}
