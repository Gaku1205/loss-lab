import type { Vec } from "../golf/vec";
import { FIELD, type Cls, type DataPoint } from "./data";

/** ニューロンの種類。WIDE は広くゆるく、NARROW は狭く強く効く */
export type Kind = "wide" | "narrow";

/** 盤に置いたニューロン */
export interface Neuron {
  x: number;
  y: number;
  kind: Kind;
  cls: Cls;
}

export interface KindSpec {
  /** 効く広さ（ガウスの σ） */
  sigma: number;
  /** 強さ（中心での値） */
  amp: number;
  /** 置ける数 */
  stock: number;
}

export const KINDS: Record<Kind, KindSpec> = {
  wide: { sigma: 0.42, amp: 1, stock: 6 },
  narrow: { sigma: 0.15, amp: 2.4, stock: 4 },
};

/** 効きの合計がこれより小さい所は、どちらの陣地でもない（すき間） */
export const COVER_MIN = 0.15;

/** 1つのニューロンが点 p に効く強さ amp·exp(−d²/2σ²) */
export function kernel(n: Neuron, p: Vec): number {
  const k = KINDS[n.kind];
  const dx = p.x - n.x;
  const dy = p.y - n.y;
  return k.amp * Math.exp(-(dx * dx + dy * dy) / (2 * k.sigma * k.sigma));
}

/** 点 p での分類の値。● のニューロンは＋、○ は − で足す。0 の線が境界線 */
export function score(neurons: readonly Neuron[], p: Vec): number {
  let s = 0;
  for (const n of neurons) s += n.cls === "b" ? kernel(n, p) : -kernel(n, p);
  return s;
}

/** 点 p での効きの合計（向きを問わない） */
export function cover(neurons: readonly Neuron[], p: Vec): number {
  let c = 0;
  for (const n of neurons) c += kernel(n, p);
  return c;
}

/** 点 p がどちらの陣地か。すき間なら null */
export function classify(neurons: readonly Neuron[], p: Vec): Cls | null {
  if (cover(neurons, p) < COVER_MIN) return null;
  const s = score(neurons, p);
  if (s > 0) return "b";
  if (s < 0) return "a";
  return null;
}

/**
 * 点の判定
 * - hit：自分のクラスの陣地に入った（防いだ）
 * - miss：逆のクラスの陣地に入った（誤り）
 * - leak：すき間に入った（すり抜けた）
 */
export type Judge = "hit" | "miss" | "leak";

export function judge(neurons: readonly Neuron[], pt: DataPoint): Judge {
  const c = classify(neurons, pt);
  if (c === null) return "leak";
  return c === pt.cls ? "hit" : "miss";
}

/** 正解率（0〜1）。点が無ければ 0 */
export function accuracy(neurons: readonly Neuron[], pts: readonly DataPoint[]): number {
  if (pts.length === 0) return 0;
  let ok = 0;
  for (const p of pts) if (judge(neurons, p) === "hit") ok++;
  return ok / pts.length;
}

/** 百分率（切り捨て） */
export function percent(acc: number): number {
  return Math.floor(acc * 100 + 1e-9);
}

/** 残りの数 */
export function remaining(neurons: readonly Neuron[], kind: Kind): number {
  return KINDS[kind].stock - neurons.filter((n) => n.kind === kind).length;
}

export const MAX_NEURONS = KINDS.wide.stock + KINDS.narrow.stock;

export function inField(p: Vec): boolean {
  return p.x >= FIELD.xMin && p.x <= FIELD.xMax && p.y >= FIELD.yMin && p.y <= FIELD.yMax;
}

/** 置く。残りが無い・盤の外なら null */
export function place(neurons: readonly Neuron[], n: Neuron): Neuron[] | null {
  if (!inField(n) || remaining(neurons, n.kind) <= 0) return null;
  return [...neurons, { ...n }];
}

/** p から radius 以内でいちばん近いニューロンの番号。無ければ −1 */
export function pick(neurons: readonly Neuron[], p: Vec, radius: number): number {
  let best = -1;
  let bestD = radius * radius;
  neurons.forEach((n, i) => {
    const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function removeAt(neurons: readonly Neuron[], i: number): Neuron[] {
  return neurons.filter((_, j) => j !== i);
}
