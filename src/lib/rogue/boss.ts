import type { ModelStats } from "./cards";

/** 階ごとのボス（データセット）。docs/spec.md の表のとおり */
export interface Boss {
  en: string;
  ja: string;
  /** 必要な表現力 */
  need: number;
  /** 余った表現力が過学習に変わる強さ（データが少なく・ノイズが多いほど大きい） */
  risk: number;
  /** 当てずっぽうの正解率（%） */
  chance: number;
  /** ちょうど良いモデルで届く検証精度（%） */
  ceil: number;
  /** 倒すのに要る検証精度（%） */
  target: number;
}

export const BOSSES: readonly Boss[] = [
  { en: "MOONS", ja: "三日月", need: 4, risk: 0.5, chance: 50, ceil: 95, target: 85 },
  { en: "SPIRAL", ja: "渦巻き", need: 10, risk: 1, chance: 50, ceil: 95, target: 88 },
  { en: "DIGITS", ja: "手書き数字", need: 15, risk: 1.5, chance: 10, ceil: 96, target: 88 },
  { en: "PHOTOS", ja: "写真の分類", need: 20, risk: 2, chance: 10, ceil: 94, target: 88 },
];

/** 1つの階で出せるカードの数 */
export const BUDGET = 5;
/** 学習と検証の差がこれ以上なら過学習で負け */
export const OVERFIT_GAP = 15;
/** 勾配の流れがこれより小さいと勾配消失で負け */
export const VANISH_GRAD = 0.25;
/** 勾配の流れがこれより小さいと学習が鈍る */
export const SLOW_GRAD = 0.5;
/** 正則化 1 あたり、表現力から引く量 */
export const REG_COST = 0.25;
/** 余った表現力 1 あたりの差（ポイント） */
export const GAP_PER_EXCESS = 4;

export interface Fit {
  /** 実際に効く表現力 */
  eff: number;
  /** 学習精度（%、切り捨ての整数） */
  train: number;
  /** 検証精度（%、切り捨ての整数） */
  val: number;
}

/** モデルでボスのデータセットを学習した時の精度 */
export function evaluate(s: ModelStats, b: Boss): Fit {
  const slow = Math.min(1, s.grad / SLOW_GRAD);
  const eff = Math.max(0, s.cap * slow - REG_COST * s.reg);
  const fit = Math.min(1, eff / b.need);
  const excess = Math.max(0, eff - b.need);
  const gap = Math.min(40, Math.max(0, GAP_PER_EXCESS * (excess * b.risk - s.reg)));
  const mid = b.chance + (b.ceil - b.chance) * fit;
  const train = Math.floor(Math.min(100, mid + gap / 2) + 1e-9);
  const val = Math.floor(Math.max(0, mid - gap / 2) + 1e-9);
  return { eff, train, val };
}

export type Verdict = "vanish" | "overfit" | "clear" | "budget" | "continue";

/** カードを出した後の判定。used はこの階で出した数（今のを含む） */
export function judge(s: ModelStats, f: Fit, b: Boss, used: number): Verdict {
  if (s.grad < VANISH_GRAD) return "vanish";
  if (f.train - f.val >= OVERFIT_GAP) return "overfit";
  if (f.val >= b.target) return "clear";
  if (used >= BUDGET) return "budget";
  return "continue";
}
