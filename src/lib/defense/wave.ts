import type { Vec } from "../golf/vec";
import { FIELD, TEST, TRAIN, type DataPoint } from "./data";
import { judge, type Judge, type Neuron } from "./model";

export interface WaveSpec {
  /** 練習データか、初見のテストデータか */
  data: "train" | "test";
  /** 流す点の数 */
  count: number;
}

/** 練習3波 → 最終波（テスト） */
export const WAVES: readonly WaveSpec[] = [
  { data: "train", count: 8 },
  { data: "train", count: 16 },
  { data: "train", count: 24 },
  { data: "test", count: 40 },
];

/** 1波ごとのライフ。波を始めるたびに満タンに戻る */
export const LIFE = 5;

/** 点を出す間隔（ミリ秒） */
export const SPAWN_MS = 160;
/** 点が流れる速さ（盤の単位／秒） */
export const SPEED = 1.8;

export function wavePoints(w: number): readonly DataPoint[] {
  const spec = WAVES[w];
  if (!spec) return [];
  return (spec.data === "train" ? TRAIN : TEST).slice(0, spec.count);
}

export function isTestWave(w: number): boolean {
  return WAVES[w]?.data === "test";
}

/** i 番目の点が場の左の端に現れる時刻 */
export function spawnMs(i: number): number {
  return i * SPAWN_MS;
}

/** i 番目の点が自分の位置に着く時刻（左の端から右へまっすぐ流れる） */
export function arriveMs(i: number, pt: Vec): number {
  return spawnMs(i) + ((pt.x - FIELD.xMin) / SPEED) * 1000;
}

/** 時刻 t での点の位置。まだ出ていなければ null。着いた後はその位置 */
export function pointAt(i: number, pt: Vec, t: number): Vec | null {
  const t0 = spawnMs(i);
  if (t < t0) return null;
  const x = Math.min(pt.x, FIELD.xMin + ((t - t0) / 1000) * SPEED);
  return { x, y: pt.y };
}

/** 点が着いた時のできごと */
export interface Arrival {
  /** 点の番号（wavePoints の並び） */
  index: number;
  t: number;
  judge: Judge;
  /** この点の後のライフ */
  life: number;
}

export interface WaveRun {
  /** 着いた順。ライフが 0 になった所で終わる */
  arrivals: Arrival[];
  failed: boolean;
  /** 最後の点が着いた時刻 */
  endMs: number;
  hits: number;
  misses: number;
}

/** ライフの減り方：誤り（miss）・すり抜け（leak）で1ずつ減る */
export function lifeAfter(life: number, j: Judge): number {
  return j === "hit" ? life : Math.max(0, life - 1);
}

/** 1波を最後まで（またはライフ 0 まで）進めた結果 */
export function runWave(neurons: readonly Neuron[], pts: readonly DataPoint[], life = LIFE): WaveRun {
  const order = pts.map((p, i) => ({ i, t: arriveMs(i, p) })).sort((a, b) => a.t - b.t || a.i - b.i);
  const arrivals: Arrival[] = [];
  let hits = 0;
  let misses = 0;
  let l = life;
  for (const o of order) {
    const j = judge(neurons, pts[o.i]);
    l = lifeAfter(l, j);
    if (j === "hit") hits++;
    else misses++;
    arrivals.push({ index: o.i, t: o.t, judge: j, life: l });
    if (l <= 0) break;
  }
  const endMs = arrivals.length > 0 ? arrivals[arrivals.length - 1].t : 0;
  return { arrivals, failed: l <= 0, endMs, hits, misses };
}
