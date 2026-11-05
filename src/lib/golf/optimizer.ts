import type { Vec } from "./vec";

export type Method = "gd" | "momentum";

export const METHODS: readonly Method[] = ["gd", "momentum"];

/** Momentum の慣性 β */
export const BETA = 0.9;

export interface OptState {
  pos: Vec;
  /** Momentum の速度。GD では使わない（0 のまま） */
  vel: Vec;
}

/**
 * 1ステップ進める。
 * GD：θ ← θ − η∇f(θ)
 * Momentum：v ← βv − η∇f(θ)、θ ← θ + v
 */
export function step(method: Method, s: OptState, lr: number, grad: (p: Vec) => Vec, beta = BETA): OptState {
  const g = grad(s.pos);
  if (method === "gd") {
    return { pos: { x: s.pos.x - lr * g.x, y: s.pos.y - lr * g.y }, vel: { x: 0, y: 0 } };
  }
  const vel = { x: beta * s.vel.x - lr * g.x, y: beta * s.vel.y - lr * g.y };
  return { pos: { x: s.pos.x + vel.x, y: s.pos.y + vel.y }, vel };
}
