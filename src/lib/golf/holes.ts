import type { Vec } from "./vec";
import type { Wind } from "./wind";

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
  /** 風（SGD のノイズ）。無風なら null */
  wind: Wind | null;
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
  wind: null,
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
  wind: null,
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
  wind: null,
  loss: ({ x, y }) => {
    const v = y - 0.5 * x * x + 0.4;
    return 0.3 * (x - 1.1) ** 2 + 3 * v * v;
  },
  grad: ({ x, y }) => {
    const v = y - 0.5 * x * x + 0.4;
    return { x: 0.6 * (x - 1.1) - 6 * v * x, y: 6 * v };
  },
};

/** ホール4 Breeze：f = 0.5·((x−0.5)² + 3(y+0.2)²)。丸い谷に弱い風 */
const breeze: Hole = {
  no: 4,
  name: "Breeze",
  nameJa: "微風の谷",
  par: 3,
  limit: 6,
  start: { x: -1.3, y: 0.7 },
  cup: { x: 0.5, y: -0.2 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  wind: { dir: 0, strength: 0.15, seed: 4 },
  loss: ({ x, y }) => 0.5 * (0.6 * (x - 0.5) ** 2 + 5 * (y + 0.2) ** 2),
  grad: ({ x, y }) => ({ x: 0.6 * (x - 0.5), y: 5 * (y + 0.2) }),
};

/** ホール5 Crosswind：f = 0.5·(0.3(x+1)² + 8(y−0.2)²)。細長い谷に、急な向き（縦）の風 */
const crosswind: Hole = {
  no: 5,
  name: "Crosswind",
  nameJa: "横風の細い谷",
  par: 4,
  limit: 8,
  start: { x: 1.3, y: -0.6 },
  cup: { x: -1, y: 0.2 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  wind: { dir: 90, strength: 0.2, seed: 5 },
  loss: ({ x, y }) => 0.5 * (0.3 * (x + 1) ** 2 + 8 * (y - 0.2) ** 2),
  grad: ({ x, y }) => ({ x: 0.3 * (x + 1), y: 8 * (y - 0.2) }),
};

/** ホール6 Twin Pits：f = 0.6(x²−1)² + 0.08(x−1)² + 1.5y²。左に浅い窪み（局所解）、右に谷底 */
const twin: Hole = {
  no: 6,
  name: "Twin Pits",
  nameJa: "二つの窪み",
  par: 4,
  limit: 8,
  start: { x: -1.2, y: 0.6 },
  cup: { x: 1, y: 0 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  wind: { dir: 0, strength: 0.25, seed: 6 },
  loss: ({ x, y }) => 1.2 * (x * x - 1) ** 2 + 0.06 * (x - 1) ** 2 + 1.5 * y * y,
  grad: ({ x, y }) => ({ x: 4.8 * x * (x * x - 1) + 0.12 * (x - 1), y: 3 * y }),
};

// ホール7 の谷の向き（30°）
const TILT_C = Math.cos(Math.PI / 6);
const TILT_S = Math.sin(Math.PI / 6);

/** ホール7 Tilted：谷の向きに a、横に b を取り f = 0.5·(0.2a² + 12b²)。斜めで、縦と横の急さが大きく違う */
const tilted: Hole = {
  no: 7,
  name: "Tilted",
  nameJa: "斜めの谷",
  par: 4,
  limit: 8,
  start: { x: -1.3, y: -0.3 },
  cup: { x: 0.9, y: 0.35 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  wind: { dir: 120, strength: 0.2, seed: 7 },
  loss: ({ x, y }) => {
    const dx = x - 0.9;
    const dy = y - 0.35;
    const a = TILT_C * dx + TILT_S * dy;
    const b = -TILT_S * dx + TILT_C * dy;
    return 0.5 * (0.2 * a * a + 12 * b * b);
  },
  grad: ({ x, y }) => {
    const dx = x - 0.9;
    const dy = y - 0.35;
    const a = TILT_C * dx + TILT_S * dy;
    const b = -TILT_S * dx + TILT_C * dy;
    const ga = 0.2 * a;
    const gb = 12 * b;
    return { x: TILT_C * ga - TILT_S * gb, y: TILT_S * ga + TILT_C * gb };
  },
};

/** ホール8 Plateau：f = 1.5·(1 − exp(−((x−0.9)² + (y+0.3)²)/2))。遠くは平らで勾配が小さく、谷底の近くだけ急 */
const plateau: Hole = {
  no: 8,
  name: "Plateau",
  nameJa: "平らな台地",
  par: 3,
  limit: 7,
  start: { x: -1.35, y: 0.75 },
  cup: { x: 0.9, y: -0.3 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  wind: { dir: 45, strength: 0.2, seed: 8 },
  loss: ({ x, y }) => 1.5 * (1 - Math.exp(-((x - 0.9) ** 2 + (y + 0.3) ** 2) / 1.2)),
  grad: ({ x, y }) => {
    const e = Math.exp(-((x - 0.9) ** 2 + (y + 0.3) ** 2) / 1.2);
    return { x: 2.5 * e * (x - 0.9), y: 2.5 * e * (y + 0.3) };
  },
};

/** ホール9 Storm：f = (x+0.3)² + (y−0.1)²。急な丸い谷に、いちばん強い風 */
const storm: Hole = {
  no: 9,
  name: "Storm",
  nameJa: "嵐の谷",
  par: 3,
  limit: 6,
  start: { x: 1.35, y: -0.8 },
  cup: { x: -0.3, y: 0.1 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  wind: { dir: 200, strength: 0.35, seed: 9 },
  loss: ({ x, y }) => 1.5 * (x + 0.3) ** 2 + 0.3 * (y - 0.1) ** 2,
  grad: ({ x, y }) => ({ x: 3 * (x + 0.3), y: 0.6 * (y - 0.1) }),
};

/** ホール10 Gale Bend：f = 0.3(x+1.1)² + 3(y + 0.5x² − 0.4)²。逆に曲がった谷に強い風 */
const gale: Hole = {
  no: 10,
  name: "Gale Bend",
  nameJa: "強風の曲がった谷",
  par: 4,
  limit: 8,
  start: { x: 1.35, y: -0.75 },
  cup: { x: -1.1, y: 0.4 - 0.5 * 1.1 * 1.1 },
  cupRadius: CUP_RADIUS,
  bounds: BOUNDS,
  wind: { dir: 270, strength: 0.3, seed: 10 },
  loss: ({ x, y }) => {
    const v = y + 0.5 * x * x - 0.4;
    return 0.3 * (x + 1.1) ** 2 + 3 * v * v;
  },
  grad: ({ x, y }) => {
    const v = y + 0.5 * x * x - 0.4;
    return { x: 0.6 * (x + 1.1) + 6 * v * x, y: 6 * v };
  },
};

export const HOLES: readonly Hole[] = [bowl, ravine, bend, breeze, crosswind, twin, tilted, plateau, storm, gale];

/** #1 の挑戦（最初の3ホール）のホール数。前の版の保存を読む時に使う */
export const FIRST_HOLES = 3;

/** 全ホールのパーの合計 */
export const TOTAL_PAR = HOLES.reduce((s, h) => s + h.par, 0);
