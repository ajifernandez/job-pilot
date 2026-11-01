// En dev (next dev en :3000) apunta al backend en :8000; en prod mismo origen.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const STATUSES = {
  inbox: "Inbox",
  to_apply: "Por aplicar",
  applying: "Aplicando",
  applied: "Aplicado",
  interview: "Entrevista",
  offer: "Oferta recibida",
  rejected: "Descartado",
  dismissed: "Ignorada",
} as const;
export type JobStatus = keyof typeof STATUSES;

export type Job = {
  id: string;
  source: "ai" | "manual";
  url: string | null;
  title: string;
  company: string;
  location: string | null;
  work_mode: string;
  salary: string | null;
  language: string;
  requirements: string[];
  technologies: string[];
  description: string;
  match_score: number | null;
  match_reason: string | null;
  deal_breakers: string[];
  status: JobStatus;
  position: number;
  notes: string | null;
  created_at: string;
};

export type CV = { lang: "es" | "en"; content_md: string; updated_at: string };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? res.statusText);
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
