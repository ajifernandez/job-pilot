"use client";

import { useEffect, useState } from "react";
import { api, CV } from "@/lib/api";

const LANGS = [
  { lang: "es", label: "CV en español" },
  { lang: "en", label: "CV in English" },
] as const;

export default function CVsPage() {
  const [content, setContent] = useState<Record<string, string>>({ es: "", en: "" });
  const [msg, setMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    api<CV[]>("/api/cvs")
      .then((cvs) => setContent((c) => ({ ...c, ...Object.fromEntries(cvs.map((cv) => [cv.lang, cv.content_md])) })))
      .catch((e) => setMsg({ es: e.message }));
  }, []);

  async function save(lang: string) {
    try {
      await api(`/api/cvs/${lang}`, { method: "PUT", body: JSON.stringify({ content_md: content[lang] }) });
      setMsg((m) => ({ ...m, [lang]: "Guardado" }));
    } catch (e) {
      setMsg((m) => ({ ...m, [lang]: (e as Error).message }));
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {LANGS.map(({ lang, label }) => (
        <section key={lang}>
          <label htmlFor={`cv-${lang}`} className="mb-2 block font-medium">{label} <span className="text-sm font-normal text-zinc-500">(Markdown)</span></label>
          <textarea
            id={`cv-${lang}`}
            rows={28}
            value={content[lang]}
            onChange={(e) => setContent((c) => ({ ...c, [lang]: e.target.value }))}
            className="w-full rounded border border-zinc-300 bg-white p-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => save(lang)} className="rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Guardar</button>
            <span className="text-sm text-zinc-500" role="status">{msg[lang]}</span>
          </div>
        </section>
      ))}
    </div>
  );
}
