"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApplicationModal } from "@/components/application-modal";
import { Kanban } from "@/components/kanban";
import { scoreColor } from "@/components/job-card";
import { api, Job, JobStatus, STATUSES } from "@/lib/api";

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

const DAY = 86_400_000;
const sel = "rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [status, setStatus] = useState<JobStatus | "">("");
  const [tech, setTech] = useState("");
  const [source, setSource] = useState<"" | "ai" | "manual">("");
  const [days, setDays] = useState(0);
  const [applyJob, setApplyJob] = useState<Job | null>(null);

  const load = useCallback(() => api<Job[]>("/api/jobs").then(setJobs).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // trae lo que la búsqueda automática vaya insertando
    return () => clearInterval(t);
  }, [load]);

  const visible = useMemo(() => {
    const since = days ? Date.now() - days * DAY : 0;
    return jobs.filter(
      (j) =>
        j.status !== "dismissed" &&
        (!status || j.status === status) &&
        (!source || j.source === source) &&
        (!since || new Date(j.created_at).getTime() >= since) &&
        (!tech || j.technologies.some((t) => t.toLowerCase().includes(tech.toLowerCase()))),
    );
  }, [jobs, status, tech, source, days]);

  async function move(jobId: string, next: JobStatus, orderedIds: string[]) {
    const before = jobs;
    setError("");
    setJobs((js) =>
      js.map((j) => {
        const i = orderedIds.indexOf(j.id);
        return i >= 0 ? { ...j, status: next, position: i } : j;
      }),
    );
    try {
      await api("/api/jobs/reorder", { method: "POST", body: JSON.stringify({ status: next, ids: orderedIds }) });
    } catch (e) {
      setJobs(before); // el servidor lo rechazó (p. ej. Aplicado sin candidatura confirmada)
      setError((e as Error).message);
    }
  }

  async function remove(job: Job) {
    try {
      await api(`/api/jobs/${job.id}`, { method: "DELETE" });
      setJobs((js) => (job.source === "ai" ? js.map((j) => (j.id === job.id ? { ...j, status: "dismissed" } : j)) : js.filter((j) => j.id !== job.id)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <AddJob onAdded={(job) => setJobs((js) => [job, ...js])} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded border border-zinc-300 dark:border-zinc-700" role="group" aria-label="Vista">
          {(["board", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`px-3 py-1 ${view === v ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""}`}>
              {v === "board" ? "Tablero" : "Lista"}
            </button>
          ))}
        </div>
        {view === "list" && (
          <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as JobStatus | "")} className={sel}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUSES).filter(([k]) => k !== "inbox" && k !== "dismissed").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        <select aria-label="Origen" value={source} onChange={(e) => setSource(e.target.value as "" | "ai" | "manual")} className={sel}>
          <option value="">Cualquier origen</option>
          <option value="ai">Detectadas por IA</option>
          <option value="manual">Manuales</option>
        </select>
        <select aria-label="Fecha" value={days} onChange={(e) => setDays(Number(e.target.value))} className={sel}>
          <option value={0}>Cualquier fecha</option>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
        </select>
        <input value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Tecnología" aria-label="Tecnología" className={sel} />
        <span className="text-zinc-500">{visible.length} ofertas</span>
      </div>

      {error && <p className="mb-4 text-sm text-red-600" role="alert">{error}</p>}

      {view === "board" ? (
        <Kanban jobs={visible} onMove={move} onRemove={remove} onApply={setApplyJob} />
      ) : (
        <ul className="space-y-2">
          {visible.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <p className="font-medium">
                  {job.url ? <a href={job.url} target="_blank" rel="noreferrer" className="hover:underline">{job.title}</a> : job.title}
                  {job.source === "ai" && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800">IA</span>}
                </p>
                <p className="text-xs text-zinc-500">{[job.company, job.location, job.work_mode !== "unknown" && job.work_mode, job.salary].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${scoreColor(job.match_score)}`}>{job.match_score ?? "–"}%</span>
                <select aria-label="Cambiar estado" value={job.status} onChange={(e) => move(job.id, e.target.value as JobStatus, [job.id])} className={sel}>
                  {Object.entries(STATUSES).filter(([k]) => k !== "inbox" && k !== "dismissed").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button onClick={() => setApplyJob(job)} className="text-violet-700 hover:underline">Candidatura</button>
                <button onClick={() => remove(job)} className="text-zinc-400 hover:text-red-600" aria-label="Descartar">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {applyJob && <ApplicationModal job={applyJob} onClose={() => setApplyJob(null)} onChanged={load} />}
    </>
  );
}
