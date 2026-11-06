import type { Bounds, Hole } from "./holes";
import { step, type Method } from "./optimizer";
import { dist, type Vec } from "./vec";
import { noisyGrad, windRng } from "./wind";

/** 1打で進めるステップの数 */
export const STEPS_PER_SHOT = 12;

/** 学習率の範囲（スライダーは対数で動く） */
export const LR_MIN = 0.001;
export const LR_MAX = 1;

export type Outcome = "cup" | "ob" | "stop";

export interface ShotResult {
  /** 打つ前の点から、止まった点（OB なら境界の外に出た点）までの道のり。path[0] は打つ前の点 */
  path: Vec[];
  /** path の各点の損失 */
  losses: number[];
  outcome: Outcome;
}

export function isOut(p: Vec, b: Bounds): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return true;
  return p.x < b.xMin || p.x > b.xMax || p.y < b.yMin || p.y > b.yMax;
}

export function isInCup(p: Vec, hole: Hole): boolean {
  return dist(p, hole.cup) <= hole.cupRadius;
}

/**
 * 1打を計算する。速度は打つたびに 0 から始める。カップに入るか OB になった所で止める。
 * 風のあるホールでは、毎ステップの勾配に風のノイズを足す。ノイズの乱数は、そのホールの種と何打目か（stroke、0 始まり）で決まる
 */
export function simulateShot(hole: Hole, from: Vec, lr: number, method: Method, stroke = 0, steps = STEPS_PER_SHOT): ShotResult {
  const path: Vec[] = [from];
  const losses: number[] = [hole.loss(from)];
  const wind = hole.wind;
  const rand = wind ? windRng(wind, stroke) : null;
  const grad = wind && rand ? (p: Vec) => noisyGrad(hole.grad(p), wind, rand) : hole.grad;
  let s = { pos: from, vel: { x: 0, y: 0 } };
  for (let i = 0; i < steps; i++) {
    s = step(method, s, lr, grad);
    path.push(s.pos);
    if (isOut(s.pos, hole.bounds)) {
      losses.push(Number.isFinite(hole.loss(s.pos)) ? hole.loss(s.pos) : Number.MAX_VALUE);
      return { path, losses, outcome: "ob" };
    }
    losses.push(hole.loss(s.pos));
    if (isInCup(s.pos, hole)) return { path, losses, outcome: "cup" };
  }
  return { path, losses, outcome: "stop" };
}

/** 学習率を 0〜1 のスライダーの位置に（対数） */
export function lrToSlider(lr: number): number {
  const t = Math.log(lr / LR_MIN) / Math.log(LR_MAX / LR_MIN);
  return Math.min(1, Math.max(0, t));
}

/** スライダーの位置 0〜1 を学習率に（対数）。有効数字2桁に丸める */
export function sliderToLr(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  const lr = LR_MIN * Math.pow(LR_MAX / LR_MIN, c);
  return Number(lr.toPrecision(2));
}
