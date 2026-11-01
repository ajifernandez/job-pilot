"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Profile, Run, Source } from "@/lib/api";

const MODES = [
  ["remote", "Remoto"],
  ["hybrid", "Híbrido"],
  ["onsite", "Presencial"],
] as const;

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const field = "w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "–");

type Form = { name: string; roles: string; technologies: string; locations: string; exclude: string; portals: string; modes: string[]; minSalary: string; minScore: number; active: boolean };
const EMPTY: Form = { name: "", roles: "", technologies: "", locations: "", exclude: "", portals: "", modes: ["remote"], minSalary: "", minScore: 60, active: true };

export default function SearchPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api<Profile[]>("/api/profiles"), api<Run[]>("/api/runs")]);
      setProfiles(p);
      setRuns(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const running = runs.some((r) => r.status === "running");
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000); // sigue la búsqueda en curso
    return () => clearInterval(t);
  }, [running, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      name: form.name,
      roles: list(form.roles),
      technologies: list(form.technologies),
      locations: list(form.locations),
      exclude_keywords: list(form.exclude),
      portals: list(form.portals),
      work_modes: form.modes,
      min_salary: form.minSalary ? Number(form.minSalary) : null,
      min_score: form.minScore,
      active: form.active,
    };
    try {
      await api(editing ? `/api/profiles/${editing}` : "/api/profiles", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      setForm(EMPTY);
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function edit(p: Profile) {
    setEditing(p.id);
    setForm({
      name: p.name, roles: p.roles.join(", "), technologies: p.technologies.join(", "), locations: p.locations.join(", "),
      exclude: p.exclude_keywords.join(", "), portals: p.portals.join(", "), modes: p.work_modes, minSalary: p.min_salary?.toString() ?? "", minScore: p.min_score, active: p.active,
    });
  }

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const totals = Object.values(
    runs.flatMap((r) => r.sources ?? []).reduce<Record<string, Source>>((acc, x) => {
      const t = (acc[x.domain] ??= { domain: x.domain, found: 0, new: 0, added: 0, failed: 0 });
      t.found += x.found; t.new += x.new; t.added += x.added; t.failed += x.failed;
      return acc;
    }, {}),
  ).sort((a, b) => b.added - a.added || b.found - a.found);
  const requested = new Set(profiles.flatMap((p) => p.portals.map((x) => x.split("/")[0])));

  const name = (id: string) => profiles.find((p) => p.id === id)?.name ?? "(borrado)";

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
      <form onSubmit={save} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium">{editing ? "Editar perfil" : "Nuevo perfil de búsqueda"}</h2>
        <label className="block text-sm">Nombre<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} /></label>
        <label className="block text-sm">Roles (separados por coma)<input required value={form.roles} onChange={(e) => setForm({ ...form, roles: e.target.value })} placeholder="Senior Backend Engineer, Python Developer" className={field} /></label>
        <label className="block text-sm">Tecnologías<input value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} placeholder="Python, FastAPI, PostgreSQL" className={field} /></label>
        <label className="block text-sm">Ubicaciones<input value={form.locations} onChange={(e) => setForm({ ...form, locations: e.target.value })} placeholder="Spain, Europe" className={field} /></label>
        <label className="block text-sm">Excluir (palabras en el título)<input value={form.exclude} onChange={(e) => setForm({ ...form, exclude: e.target.value })} placeholder="Junior, Intern" className={field} /></label>
        <label className="block text-sm">Portales adicionales a priorizar<input value={form.portals} onChange={(e) => setForm({ ...form, portals: e.target.value })} placeholder="weworkremotely.com, remoteok.com, jobs.lever.co" className={field} />
          <span className="text-xs text-zinc-500">Dominios (separados por coma). Además busca en toda la web; estos se consultan expresamente.</span></label>
        <fieldset className="flex gap-4 text-sm">
          <legend className="mb-1">Modalidad</legend>
          {MODES.map(([k, label]) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={form.modes.includes(k)} onChange={(e) => setForm({ ...form, modes: e.target.checked ? [...form.modes, k] : form.modes.filter((m) => m !== k) })} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Salario mínimo (EUR/año)<input type="number" min={0} value={form.minSalary} onChange={(e) => setForm({ ...form, minSalary: e.target.value })} className={field} /></label>
          <label className="block text-sm">Score mínimo: {form.minScore}%<input type="range" min={0} max={100} step={5} value={form.minScore} onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })} className="w-full" /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Buscar automáticamente cada 12 h</label>
        <div className="flex gap-2">
          <button className="rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">{editing ? "Guardar cambios" : "Crear perfil"}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }} className="px-3 text-sm text-zinc-500">Cancelar</button>}
        </div>
      </form>

      <div className="space-y-8">
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <section>
          <h2 className="mb-2 font-medium">Perfiles</h2>
          {profiles.length === 0 && <p className="text-sm text-zinc-500">Crea un perfil y las ofertas compatibles aparecerán solas en el tablero (columna Por aplicar).</p>}
          <ul className="space-y-2">
            {profiles.map((p) => (
              <li key={p.id} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.name} {!p.active && <span className="text-xs font-normal text-zinc-500">(pausado)</span>}</p>
                    <p className="text-xs text-zinc-500">{p.roles.join(", ")} · {p.work_modes.join("/") || "cualquier modalidad"} · score ≥ {p.min_score}% · última: {fmt(p.last_run_at)}</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => act(() => api(`/api/profiles/${p.id}/run`, { method: "POST" }))} disabled={running} className="rounded bg-violet-600 px-3 py-1 text-white disabled:opacity-50">Buscar ahora</button>
                    <button onClick={() => edit(p)} className="text-zinc-500 hover:underline">Editar</button>
                    <button onClick={() => confirm(`¿Borrar "${p.name}"?`) && act(() => api(`/api/profiles/${p.id}`, { method: "DELETE" }))} className="text-zinc-400 hover:text-red-600">Borrar</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-medium">Dónde busca</h2>
          <p className="mb-2 text-xs text-zinc-500">Gemini usa Google Search sobre toda la web y los portales de tus perfiles. Estos son los sitios donde ha encontrado ofertas (últimas 20 ejecuciones): añadidas / encontradas.</p>
          {totals.length === 0 ? <p className="text-sm text-zinc-500">Aún no hay datos: lanza una búsqueda.</p> : (
            <ul className="flex flex-wrap gap-2 text-xs">
              {totals.map((t) => (
                <li key={t.domain} className={`rounded border px-2 py-1 ${requested.has(t.domain) ? "border-violet-400" : "border-zinc-300 dark:border-zinc-700"}`} title={`${t.new} nuevas, ${t.failed} fallidas${requested.has(t.domain) ? " · portal indicado por ti" : ""}`}>
                  {t.domain} <b>{t.added}/{t.found}</b>{t.failed > 0 && <span className="text-red-600"> · {t.failed} ✕</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-medium">Historial de búsquedas</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500"><tr><th className="py-1">Inicio</th><th>Perfil</th><th>Estado</th><th>Candidatas</th><th>Añadidas</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                  <td className="py-1">{fmt(r.started_at)}</td>
                  <td>{name(r.profile_id)}</td>
                  <td className={r.status === "failed" ? "text-red-600" : ""}>
                    {r.status === "running" ? "Buscando…" : r.status === "done" ? "Listo" : "Error"}
                    {r.error && <span className="block text-xs">{r.error}</span>}
                    {r.sources && r.sources.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1 text-xs font-normal text-zinc-500">
                        {r.sources.map((x) => <span key={x.domain} className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{x.domain} {x.added}/{x.found}</span>)}
                      </span>
                    )}
                  </td>
                  <td>{r.candidates}</td>
                  <td>{r.inserted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
