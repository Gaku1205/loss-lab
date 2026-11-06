import { HOLES, type Hole } from "./holes";
import type { Method } from "./optimizer";
import type { ShotResult } from "./shot";
import type { Vec } from "./vec";

/** 1回の挑戦（10ホール）の進み具合。これをそのまま保存する */
export interface GolfProgress {
  /** 今のホールの番号（0 始まり）。HOLES.length なら全ホールを終えた */
  hole: number;
  /** 玉の位置 */
  pos: Vec;
  /** 今のホールの打数 */
  strokes: number;
  /** 終えたホールの打数 */
  cards: number[];
  lr: number;
  method: Method;
}

export const DEFAULT_LR = 0.05;
export const DEFAULT_METHOD: Method = "gd";

export function newRun(lr = DEFAULT_LR, method: Method = DEFAULT_METHOD): GolfProgress {
  return { hole: 0, pos: { ...HOLES[0].start }, strokes: 0, cards: [], lr, method };
}

export function isFinished(p: GolfProgress): boolean {
  return p.hole >= HOLES.length;
}

export function currentHole(p: GolfProgress): Hole | null {
  return HOLES[p.hole] ?? null;
}

/**
 * 打ったあとに起きたこと
 * - cup：カップに入った（次のホールへ進んだ）
 * - finish：最後のホールのカップに入った（挑戦を終えた）
 * - ob：盤の外に出た。玉は打った位置に戻り、打数は＋1
 * - stop：止まった所から次を打つ
 * - fail：打数の上限に達してもカップに入らなかった。ホールを最初からやり直す
 */
export type ShotEvent = "cup" | "finish" | "ob" | "stop" | "fail";

export interface AfterShot {
  progress: GolfProgress;
  event: ShotEvent;
  /** この打で使った打数（カップに入ったホールの打数・失敗した時の打数を表示するため） */
  strokes: number;
}

/** 1打の結果を進み具合に入れる */
export function applyShot(p: GolfProgress, shot: ShotResult): AfterShot {
  const hole = currentHole(p);
  if (!hole) return { progress: p, event: "finish", strokes: 0 };
  const strokes = p.strokes + 1;
  if (shot.outcome === "cup") {
    const cards = [...p.cards, strokes];
    const next = p.hole + 1;
    const nextHole = HOLES[next];
    const progress: GolfProgress = {
      ...p,
      hole: next,
      pos: nextHole ? { ...nextHole.start } : { ...hole.cup },
      strokes: 0,
      cards,
    };
    return { progress, event: nextHole ? "cup" : "finish", strokes };
  }
  if (strokes >= hole.limit) {
    return { progress: { ...p, pos: { ...hole.start }, strokes: 0 }, event: "fail", strokes };
  }
  if (shot.outcome === "ob") {
    return { progress: { ...p, strokes }, event: "ob", strokes };
  }
  const end = shot.path[shot.path.length - 1];
  return { progress: { ...p, pos: { ...end }, strokes }, event: "stop", strokes };
}
