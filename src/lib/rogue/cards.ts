/** Model Rogue のカード（docs/spec.md の表のとおり） */

export type CardId = "sigmoid" | "relu" | "dropout" | "augment" | "batchnorm" | "wide" | "decay" | "residual" | "conv";

/** LAYER 層 ／ REG 正則化 ／ FIX 調整 */
export type CardType = "layer" | "reg" | "fix";

export interface CardSpec {
  id: CardId;
  type: CardType;
  /** 英語の名前（主） */
  en: string;
  /** 日本語の名前（小さく併記） */
  ja: string;
  /** 表現力に足す */
  cap: number;
  /** 正則化に足す */
  reg: number;
  /** 勾配の流れに掛ける（上限 1） */
  grad: number;
  /** 解禁する周回（0 = 最初から、1 = 1周クリア後） */
  unlock: number;
}

export const CARDS: Record<CardId, CardSpec> = {
  sigmoid: { id: "sigmoid", type: "layer", en: "DENSE·SIGMOID", ja: "全結合（Sigmoid）", cap: 4, reg: 0, grad: 0.6, unlock: 0 },
  relu: { id: "relu", type: "layer", en: "DENSE·ReLU", ja: "全結合（ReLU）", cap: 3, reg: 0, grad: 0.9, unlock: 0 },
  dropout: { id: "dropout", type: "reg", en: "DROPOUT", ja: "ドロップアウト", cap: 0, reg: 2, grad: 1, unlock: 0 },
  augment: { id: "augment", type: "reg", en: "AUGMENT", ja: "データ拡張", cap: 0, reg: 3, grad: 1, unlock: 0 },
  batchnorm: { id: "batchnorm", type: "fix", en: "BATCH NORM", ja: "バッチ正規化", cap: 0, reg: 0, grad: 1.6, unlock: 0 },
  wide: { id: "wide", type: "layer", en: "WIDE·ReLU", ja: "幅広い層", cap: 6, reg: 0, grad: 0.9, unlock: 1 },
  decay: { id: "decay", type: "reg", en: "WEIGHT DECAY", ja: "重み減衰", cap: 0, reg: 1, grad: 1, unlock: 1 },
  residual: { id: "residual", type: "fix", en: "RESIDUAL", ja: "残差接続", cap: 0, reg: 0, grad: 2, unlock: 2 },
  conv: { id: "conv", type: "layer", en: "CONV", ja: "畳み込み層", cap: 5, reg: 1, grad: 0.9, unlock: 2 },
};

/** 表の並び */
export const CARD_ORDER: readonly CardId[] = ["sigmoid", "relu", "dropout", "augment", "batchnorm", "wide", "decay", "residual", "conv"];

/** 周回 loop（それまでにクリアした回数）で使えるカード */
export function cardPool(loop: number): CardId[] {
  return CARD_ORDER.filter((id) => CARDS[id].unlock <= loop);
}

/** その周回で新しく解禁されるカード */
export function newCards(loop: number): CardId[] {
  return CARD_ORDER.filter((id) => CARDS[id].unlock === loop);
}

/** 効果の1行（例 `CAP +3 ・ GRAD ×0.9`） */
export function effectText(id: CardId): string {
  const c = CARDS[id];
  const parts: string[] = [];
  if (c.cap) parts.push(`CAP +${c.cap}`);
  if (c.reg) parts.push(`REG +${c.reg}`);
  if (c.grad !== 1) parts.push(`GRAD ×${c.grad}`);
  return parts.join(" ・ ");
}

export interface ModelStats {
  /** 表現力 */
  cap: number;
  /** 正則化 */
  reg: number;
  /** 勾配の流れ（0〜1） */
  grad: number;
  /** 層の数 */
  depth: number;
}

/** 入力だけのモデル（ロジスティック回帰） */
export const BASE_STATS: ModelStats = { cap: 1, reg: 0, grad: 1, depth: 0 };

/** カードを前から順に足したモデルの数値 */
export function modelStats(model: readonly CardId[]): ModelStats {
  let { cap, reg, grad, depth } = BASE_STATS;
  for (const id of model) {
    const c = CARDS[id];
    cap += c.cap;
    reg += c.reg;
    grad = Math.min(1, grad * c.grad);
    if (c.type === "layer") depth++;
  }
  return { cap, reg, grad, depth };
}
