/** 1つの課題の得点の満点 */
export const TASK_MAX = 1000;
/** 条件ブロックが1つ増えるごとに引く点 */
export const PER_BLOCK = 100;
/** 試行が1回増えるごとに引く点 */
export const PER_TRIAL = 150;
/** 1つの課題の得点の最低 */
export const TASK_MIN = 100;

/** ズルなしでクリアした課題の得点。条件の数と試行回数が少ないほど高い */
export function taskScore(blocks: number, trials: number): number {
  const s = TASK_MAX - PER_BLOCK * Math.max(0, blocks - 1) - PER_TRIAL * Math.max(0, trials - 1);
  return Math.max(TASK_MIN, s);
}

/** 合計 */
export function totalScore(scores: readonly { score: number }[]): number {
  return scores.reduce((s, x) => s + x.score, 0);
}

/** 最高記録を更新するか（高いほど良い） */
export function isBetter(score: number, best: number | null): boolean {
  return best === null || score > best;
}
