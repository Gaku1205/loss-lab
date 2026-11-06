import { rng } from "../defense/data";
import type { Vec } from "./vec";

/**
 * 風（SGD のノイズ）。ミニバッチで求めた勾配は、本当の勾配からばらつく。
 * ばらつきは勾配の大きさに比例すると見なし、ホールごとに決まった向きへ少し偏らせる。
 */
export interface Wind {
  /** 玉が流される向き（度。0 = 右（+x）、90 = 上（+y）、反時計回り） */
  dir: number;
  /** 強さ（0〜0.35）。勾配の大きさに対する、ばらつきの割合 */
  strength: number;
  /** 乱数の種。ホールごとに決まった値 */
  seed: number;
}

/** 強さの上限。これ以下なら、ノイズを足しても勾配の逆向きにはならない（1 ÷ (1 + √2) より小さい） */
export const WIND_MAX = 0.35;

/** 風の向きの単位ベクトル */
export function windDir(w: Wind): Vec {
  const a = (w.dir * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** その打の乱数。同じ種・同じ打（そのホールで何打目か。0 始まり）なら同じ並び */
export function windRng(w: Wind, stroke: number): () => number {
  return rng((Math.imul(w.seed, 0x9e3779b1) + Math.imul(stroke + 1, 0x85ebca6b)) >>> 0);
}

/**
 * ノイズつきの勾配 g̃ = ∇f − s·|∇f|·(u + ξ)。
 * u は風の向き、ξ は各成分が −1〜1 の一様乱数。玉は −η·g̃ に進むので、風下（u の向き）へ流され、毎ステップ少し揺れる。
 * カップ（谷底）では ∇f = 0 なのでノイズも 0 になる
 */
export function noisyGrad(g: Vec, w: Wind, rand: () => number): Vec {
  const u = windDir(w);
  const xi = { x: rand() * 2 - 1, y: rand() * 2 - 1 };
  const k = w.strength * Math.hypot(g.x, g.y);
  return { x: g.x - k * (u.x + xi.x), y: g.y - k * (u.y + xi.y) };
}

/** 強さの表示（小数2桁） */
export function formatWind(s: number): string {
  return s.toFixed(2);
}
