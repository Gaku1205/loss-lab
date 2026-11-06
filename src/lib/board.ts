/** 順位表（合言葉ごとの表）のロジック。通信の細部以外は、入力から出力が決まる */

export const CODE_MAX = 32;
export const NICK_MAX = 16;
export const TOP_N = 3;
/** 表に載せるゲーム（今は勾配ゴルフだけ） */
export const GAME_GOLF = "golf";
const TIMEOUT_MS = 8000;

export interface BoardEntry {
  nickname: string;
  score: number;
  /** 送った時刻（ISO 8601） */
  createdAt: string;
}

export interface BoardConfig {
  url: string;
  key: string;
}

/** 前後の空白を除き、途中の空白の連なりを半角空白1つにする */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function validate(s: string, max: number): string | null {
  const v = normalizeText(s);
  const len = [...v].length;
  return len >= 1 && len <= max ? v : null;
}

/** 合言葉（1〜32文字）。使えなければ null */
export function validateCode(s: string): string | null {
  return validate(s, CODE_MAX);
}

/** ニックネーム（1〜16文字）。使えなければ null */
export function validateNickname(s: string): string | null {
  return validate(s, NICK_MAX);
}

function time(e: BoardEntry): number {
  const t = Date.parse(e.createdAt);
  return Number.isNaN(t) ? Infinity : t;
}

/** 勾配ゴルフの並べ方：打数が少ない順。同じ打数は先に送った方が上。上位 n 件 */
export function topGolf(entries: readonly BoardEntry[], n = TOP_N): BoardEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.score - b.e.score || time(a.e) - time(b.e) || a.i - b.i)
    .slice(0, n)
    .map((x) => x.e);
}

/** Supabase の応答を読む。配列でなければ空。形が合わない行は無視する */
export function parseRows(json: unknown): BoardEntry[] {
  if (!Array.isArray(json)) return [];
  const out: BoardEntry[] = [];
  for (const r of json) {
    if (typeof r !== "object" || r === null) continue;
    const { nickname, score, created_at } = r as Record<string, unknown>;
    if (typeof nickname !== "string" || validateNickname(nickname) === null) continue;
    if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 1000) continue;
    if (typeof created_at !== "string" || Number.isNaN(Date.parse(created_at))) continue;
    out.push({ nickname: normalizeText(nickname), score, createdAt: created_at });
  }
  return out;
}

/** 環境変数から設定を読む。無い・URL でない時は null（オフライン扱い） */
export function readConfig(env: { VITE_SUPABASE_URL?: unknown; VITE_SUPABASE_ANON_KEY?: unknown }): BoardConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === "string" ? env.VITE_SUPABASE_URL.trim().replace(/\/+$/, "") : "";
  const key = typeof env.VITE_SUPABASE_ANON_KEY === "string" ? env.VITE_SUPABASE_ANON_KEY.trim() : "";
  if (!url || !key || !/^https?:\/\/[^\s/]+/.test(url)) return null;
  return { url, key };
}

export function listUrl(cfg: BoardConfig, code: string): string {
  const q = [
    "select=nickname,score,created_at",
    `board_code=eq.${encodeURIComponent(code)}`,
    `game=eq.${GAME_GOLF}`,
    "order=score.asc,created_at.asc",
    `limit=${TOP_N}`,
  ];
  return `${cfg.url}/rest/v1/scores?${q.join("&")}`;
}

function headers(cfg: BoardConfig): Record<string, string> {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` };
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await run(ctl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** 合言葉の表の上位3人。通信に失敗したら null */
export async function fetchTop(cfg: BoardConfig, code: string, fetchFn: FetchFn = fetch): Promise<BoardEntry[] | null> {
  try {
    const res = await withTimeout((signal) => fetchFn(listUrl(cfg, code), { headers: headers(cfg), signal }));
    if (!res.ok) return null;
    return topGolf(parseRows(await res.json()));
  } catch {
    return null;
  }
}

/** 記録を1件送る。送れたら true */
export async function submitScore(
  cfg: BoardConfig,
  entry: { code: string; nickname: string; score: number },
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  try {
    const res = await withTimeout((signal) =>
      fetchFn(`${cfg.url}/rest/v1/scores`, {
        method: "POST",
        headers: { ...headers(cfg), "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ board_code: entry.code, game: GAME_GOLF, nickname: entry.nickname, score: entry.score }),
        signal,
      }),
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** 画面から使う設定。環境変数が無ければ null */
export function envConfig(): BoardConfig | null {
  const env: Record<string, unknown> = import.meta.env;
  return readConfig({ VITE_SUPABASE_URL: env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY });
}
