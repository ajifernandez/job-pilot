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
    const d = body.detail;
    const detail = typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => (x.msg ?? "").replace(/^Value error, /, "")).join("; ") : res.statusText;
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// Columnas del tablero (inbox/dismissed no se muestran: la búsqueda inserta directo en "Por aplicar")
export const COLUMNS: JobStatus[] = ["to_apply", "applying", "applied", "interview", "offer", "rejected"];

export type Profile = {
  id: string;
  name: string;
  roles: string[];
  technologies: string[];
  work_modes: string[];
  locations: string[];
  min_salary: number | null;
  currency: string;
  exclude_keywords: string[];
  portals: string[];
  min_score: number;
  active: boolean;
  last_run_at: string | null;
};

export type Source = { domain: string; found: number; new: number; added: number; failed: number };

export type Run = {
  id: string;
  profile_id: string;
  status: "running" | "done" | "failed";
  candidates: number;
  inserted: number;
  error: string | null;
  sources: Source[] | null;
  started_at: string;
  finished_at: string | null;
};

export type Application = {
  lang: "es" | "en";
  cover_letter_md: string;
  summary_md: string;
  highlights: string[];
  analysis: {
    matched_experience: { requirement: string; evidence: string; cv_section: string }[];
    gaps: string[];
    ats_keywords: string[];
  } | null;
  model: string;
  finalized_at: string | null;
  updated_at: string;
};
