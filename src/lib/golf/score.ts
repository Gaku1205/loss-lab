/** 打数とパーの差を「−1」「±0」「+2」の形に */
export function formatDiff(diff: number): string {
  if (diff === 0) return "±0";
  return diff > 0 ? `+${diff}` : `−${-diff}`;
}

export interface ScoreName {
  /** 英語（主） */
  en: string;
  /** 日本語（小さく併記） */
  ja: string;
}

/** 1ホールの打数とパーから、呼び名を決める */
export function scoreName(strokes: number, par: number): ScoreName {
  if (strokes === 1) return { en: "Hole in One", ja: "ホールインワン" };
  const d = strokes - par;
  if (d <= -2) return { en: "Eagle", ja: "イーグル" };
  if (d === -1) return { en: "Birdie", ja: "バーディー" };
  if (d === 0) return { en: "Par", ja: "パー" };
  if (d === 1) return { en: "Bogey", ja: "ボギー" };
  if (d === 2) return { en: "Double Bogey", ja: "ダブルボギー" };
  return { en: `+${d}`, ja: `パー${formatDiff(d)}` };
}

/** 合計の打数 */
export function totalStrokes(cards: readonly number[]): number {
  return cards.reduce((s, n) => s + n, 0);
}

/** 最高記録（打数が少ないほど良い）を更新する */
export function betterBest(prev: number | null, total: number): number {
  return prev === null ? total : Math.min(prev, total);
}
