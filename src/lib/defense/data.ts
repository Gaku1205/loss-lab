import type { Vec } from "../golf/vec";

/** 点のクラス。a は ○、b は ● */
export type Cls = "a" | "b";

/** データ点1つ */
export interface DataPoint {
  x: number;
  y: number;
  cls: Cls;
  /** 真の境目と逆のクラスが付いた点（ノイズ） */
  noise: boolean;
}

/** 盤（場）の範囲 */
export const FIELD = { xMin: -1.6, xMax: 1.6, yMin: -1, yMax: 1 } as const;

/** 点を出す範囲（盤の端から少し内側） */
const SPAN = { xMin: -1.45, xMax: 1.45, yMin: -0.88, yMax: 0.88 } as const;

/** 真の境目：y = 0.32·sin(1.7x)。これより上が ●（b）、下が ○（a） */
export function truthCurve(x: number): number {
  return 0.32 * Math.sin(1.7 * x);
}

export function truthClass(p: Vec): Cls {
  return p.y > truthCurve(p.x) ? "b" : "a";
}

/** 決まった種から同じ並びの乱数を出す（mulberry32） */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 真の境目から margin 以上離れた点を n 個、種 seed で出す（ノイズなし） */
export function samplePoints(seed: number, n: number, margin = 0.06): DataPoint[] {
  const r = rng(seed);
  const out: DataPoint[] = [];
  while (out.length < n) {
    const x = SPAN.xMin + r() * (SPAN.xMax - SPAN.xMin);
    const y = SPAN.yMin + r() * (SPAN.yMax - SPAN.yMin);
    if (Math.abs(y - truthCurve(x)) < margin) continue;
    out.push({ x: round3(x), y: round3(y), cls: truthClass({ x, y }), noise: false });
  }
  return out;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function noisePoint(x: number, y: number): DataPoint {
  const cls: Cls = truthClass({ x, y }) === "a" ? "b" : "a";
  return { x, y, cls, noise: true };
}

/** 練習データの種・テストデータの種 */
export const TRAIN_SEED = 7;
export const TEST_SEED = 2026;

/**
 * 練習データ（24点）。前から 8・16・24 点を、第1・2・3波で流す。
 * ノイズは3点（第2波で1点、第3波で2点が加わる）
 */
export const TRAIN: readonly DataPoint[] = (() => {
  const clean = samplePoints(TRAIN_SEED, 21);
  return [
    ...clean.slice(0, 8),
    ...clean.slice(8, 15),
    noisePoint(-0.35, 0.6),
    ...clean.slice(15, 21),
    noisePoint(0.55, -0.2),
    noisePoint(1.15, 0.7),
  ];
})();

/** テストデータ（初見・40点）。練習と同じ決まりで、別の種から出す。ノイズは2点 */
export const TEST: readonly DataPoint[] = (() => {
  const clean = samplePoints(TEST_SEED, 38);
  return [...clean.slice(0, 19), noisePoint(-0.3, -0.62), ...clean.slice(19), noisePoint(0.15, 0.7)];
})();
