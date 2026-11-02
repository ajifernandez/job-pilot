"use client";

import { useState } from "react";
import { Job } from "@/lib/api";

export function scoreColor(score: number | null) {
  if (score === null) return "bg-zinc-200 text-zinc-700";
  if (score < 50) return "bg-red-100 text-red-800";
  if (score < 75) return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

export function JobCard({ job, onRemove, onApply, onPatch }: { job: Job; onRemove: (job: Job) => void; onApply: (job: Job) => void; onPatch: (job: Job, patch: Partial<Job>) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(job.discard_reason ?? "");
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setOpen(!open)} className="text-left font-medium hover:underline" aria-expanded={open}>
          {job.title}
        </button>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${scoreColor(job.match_score)}`} title="Match score">
          {job.match_score ?? "–"}%
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        {[job.company, job.location, job.work_mode !== "unknown" && job.work_mode, job.salary].filter(Boolean).join(" · ")}
      </p>
      {job.status === "discarded" && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => reason !== (job.discard_reason ?? "") && onPatch(job, { discard_reason: reason || null })}
          placeholder="Motivo del descarte"
          aria-label="Motivo del descarte"
          className="mt-2 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {job.source === "ai" && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800">IA</span>}
        {job.technologies.slice(0, open ? 20 : 4).map((t) => (
          <span key={t} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{t}</span>
        ))}
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
          {job.match_reason && <p>{job.match_reason}</p>}
          {job.deal_breakers.length > 0 && <p className="text-red-600">⚠ {job.deal_breakers.join(" · ")}</p>}
          {job.requirements.length > 0 && (
            <ul className="list-disc pl-4 text-xs text-zinc-600 dark:text-zinc-400">
              {job.requirements.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <div className="flex items-center justify-between text-xs">
            <div className="flex gap-3">
              <button onClick={() => onApply(job)} className="font-medium text-violet-700 hover:underline">Candidatura</button>
              {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Ver oferta ↗</a>}
            </div>
            <button onClick={() => onRemove(job)} className="text-zinc-400 hover:text-red-600">
              {job.source === "ai" ? "Descartar" : "Eliminar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
