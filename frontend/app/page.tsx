"use client";

import { useEffect, useMemo, useState } from "react";
import { api, Job, JobStatus, STATUSES } from "@/lib/api";

function scoreColor(score: number | null) {
  if (score === null) return "bg-zinc-200 text-zinc-700";
  if (score < 50) return "bg-red-100 text-red-800";
  if (score < 75) return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

function AddJob({ onAdded }: { onAdded: (job: Job) => void }) {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const job = await api<Job>("/api/jobs", { method: "POST", body: JSON.stringify({ [mode]: value.trim() }) });
      onAdded(job);
      setValue("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <form onSubmit={submit} className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-2 flex gap-4 text-sm">
        <span className="font-medium">Añadir oferta</span>
        {(["url", "text"] as const).map((m) => (
          <label key={m} className="flex items-center gap-1">
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
            {m === "url" ? "URL" : "Texto pegado"}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        {mode === "url" ? (
          <input type="url" required value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://jobs.lever.co/..." className={input} />
        ) : (
          <textarea required rows={5} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Pega aquí la descripción de la oferta" className={input} />
        )}
        <button disabled={busy} className="self-start rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {busy ? "Analizando…" : "Añadir"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<JobStatus | "">("");
  const [tech, setTech] = useState("");

  useEffect(() => {
    api<Job[]>("/api/jobs").then(setJobs).catch((e) => setError(e.message));
  }, []);

  const visible = useMemo(
    () =>
      jobs.filter(
        (j) =>
          (!status || j.status === status) &&
          (!tech || j.technologies.some((t) => t.toLowerCase().includes(tech.toLowerCase()))),
      ),
    [jobs, status, tech],
  );

  async function changeStatus(job: Job, next: JobStatus) {
    try {
      const updated = await api<Job>(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      setJobs((js) => js.map((j) => (j.id === job.id ? updated : j)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(job: Job) {
    await api(`/api/jobs/${job.id}`, { method: "DELETE" });
    setJobs((js) => js.filter((j) => j.id !== job.id));
  }

  return (
    <>
      <AddJob onAdded={(job) => setJobs((js) => [job, ...js])} />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | "")} className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900">
          <option value="">Todos los estados</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Filtrar por tecnología" className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" />
        <span className="self-center text-zinc-500">{visible.length} ofertas</span>
      </div>

      {error && <p className="mb-4 text-sm text-red-600" role="alert">{error}</p>}

      <ul className="space-y-3">
        {visible.map((job) => (
          <li key={job.id} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium">
                  {job.url ? <a href={job.url} target="_blank" rel="noreferrer" className="hover:underline">{job.title}</a> : job.title}
                </h2>
                <p className="text-sm text-zinc-500">
                  {[job.company, job.location, job.work_mode !== "unknown" && job.work_mode, job.salary, job.language.toUpperCase()].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-sm font-semibold ${scoreColor(job.match_score)}`} title="Match score">
                  {job.match_score ?? "–"}%
                </span>
                <select aria-label="Estado" value={job.status} onChange={(e) => changeStatus(job, e.target.value as JobStatus)} className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button onClick={() => remove(job)} className="text-sm text-zinc-400 hover:text-red-600" aria-label="Eliminar">✕</button>
              </div>
            </div>
            {job.match_reason && <p className="mt-2 text-sm">{job.match_reason}</p>}
            {job.deal_breakers.length > 0 && <p className="mt-1 text-sm text-red-600">⚠ {job.deal_breakers.join(" · ")}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {job.technologies.map((t) => (
                <span key={t} className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{t}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
