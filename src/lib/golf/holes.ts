import type { Vec } from "./vec";

/** コースの範囲（この外に出たら OB） */
export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** 1つのホール。損失の地形 f(x, y) とその勾配、スタート・カップ・パー・打数の上限 */
export interface Hole {
  /** 1 から始まる番号 */
  no: number;
  /** 英語の名前（主） */
  name: string;
  /** 日本語の名前（小さく併記） */
  nameJa: string;
  par: number;
  /** この打数を打ってもカップに入らなければ失敗（ホールをやり直し） */
  limit: number;
  start: Vec;
  /** 谷底（損失が最小の点）。カップの中心 */
  cup: Vec;
  cupRadius: number;
  bounds: Bounds;
  loss(p: Vec): number;
  grad(p: Vec): Vec;
}

const BOUNDS: Bounds = { xMin: -1.6, xMax: 1.6, yMin: -1, yMax: 1 };
const CUP_RADIUS = 0.07;

/** ホール1 Bowl：f = 0.5·(x² + 4y²)。丸に近い谷。GD は η > 0.5 で発散 */
const bowl: Hole = {
  no: 1,
  name: "Bowl",
  nameJa: "丸い谷",
  par: 3,
  limit: 6,
  start: { x: -1.3, y: 0.75 },
  cup: { x: 0, y: 0 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  loss: ({ x, y }) => 0.5 * (x * x + 4 * y * y),
  grad: ({ x, y }) => ({ x: x, y: 4 * y }),
};

/** ホール2 Ravine：f = 0.5·(0.3(x−1)² + 10y²)。細長い谷。GD は η > 0.2 で発散し、谷に沿っては進みにくい */
const ravine: Hole = {
  no: 2,
  name: "Ravine",
  nameJa: "細長い谷",
  par: 4,
  limit: 8,
  start: { x: -1.3, y: 0.55 },
  cup: { x: 1, y: 0 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  loss: ({ x, y }) => 0.5 * (0.3 * (x - 1) ** 2 + 10 * y * y),
  grad: ({ x, y }) => ({ x: 0.3 * (x - 1), y: 10 * y }),
};

/** ホール3 Bend：f = 0.3(x−1.1)² + 3(y − 0.5x² + 0.4)²。曲がった谷 */
const bend: Hole = {
  no: 3,
  name: "Bend",
  nameJa: "曲がった谷",
  par: 3,
  limit: 7,
  start: { x: -1.35, y: 0.75 },
  cup: { x: 1.1, y: 0.5 * 1.1 * 1.1 - 0.4 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  loss: ({ x, y }) => {
    const v = y - 0.5 * x * x + 0.4;
    return 0.3 * (x - 1.1) ** 2 + 3 * v * v;
  },
  grad: ({ x, y }) => {
    const v = y - 0.5 * x * x + 0.4;
    return { x: 0.6 * (x - 1.1) - 6 * v * x, y: 6 * v };
  },
};

export const HOLES: readonly Hole[] = [bowl, ravine, bend];

/** 3ホールのパーの合計 */
export const TOTAL_PAR = HOLES.reduce((s, h) => s + h.par, 0);
