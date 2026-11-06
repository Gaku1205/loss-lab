import type { Bounds } from "./holes";
import type { Vec } from "./vec";

/** 立体表示の視点。yaw は縦軸まわりの回転、pitch は見下ろす角（π/2 で真上） */
export interface Camera {
  yaw: number;
  pitch: number;
}

/** 斜め上から見る（yaw −29°・pitch 52°） */
export const DEFAULT_CAMERA: Camera = { yaw: -0.5, pitch: 0.9 };

/** 地形のいちばん高い所の高さ（コースの縦の長さを 2 としたときの比で 1.1） */
export const SURFACE_HEIGHT = 1.1;

export interface Projected {
  /** 画面の右向き */
  u: number;
  /** 画面の上向き */
  v: number;
  /** 奥行き（大きいほど奥） */
  depth: number;
}

/** 地形の点 (x, y) と高さ z を、画面の (u, v) に写す（平行投影） */
export function project(cam: Camera, p: Vec, z: number): Projected {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const u = p.x * cy - p.y * sy;
  const depth = p.x * sy + p.y * cy;
  const v = depth * Math.sin(cam.pitch) + z * Math.cos(cam.pitch);
  return { u, v, depth };
}

export interface Surface {
  nx: number;
  ny: number;
  /** (nx + 1) × (ny + 1) 個の頂点の高さ。j 行目 i 列目は z[j * (nx + 1) + i] */
  z: number[];
  /** 損失から高さへの倍率 */
  scale: number;
  /** 高さの上限 */
  zMax: number;
}

/** 頂点の座標（i は 0〜nx、j は 0〜ny） */
export function gridPoint(b: Bounds, nx: number, ny: number, i: number, j: number): Vec {
  return { x: b.xMin + ((b.xMax - b.xMin) * i) / nx, y: b.yMin + ((b.yMax - b.yMin) * j) / ny };
}

/** 損失を高さに直す。数でない・大きすぎる値は上限に収める */
export function liftZ(loss: number, scale: number, zMax: number): number {
  if (Number.isNaN(loss)) return zMax;
  return Math.max(0, Math.min(zMax, loss * scale));
}

/** コースの範囲を升に分けて、損失を高さにした地形を作る。いちばん高い頂点が zMax になる */
export function buildSurface(loss: (p: Vec) => number, b: Bounds, nx: number, ny: number, zMax = SURFACE_HEIGHT): Surface {
  const raw: number[] = [];
  let top = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const v = loss(gridPoint(b, nx, ny, i, j));
      raw.push(v);
      if (Number.isFinite(v) && v > top) top = v;
    }
  }
  const scale = top > 0 ? zMax / top : 1;
  return { nx, ny, z: raw.map((v) => liftZ(v, scale, zMax)), scale, zMax };
}

export interface Cell {
  i: number;
  j: number;
}

/** 升を奥から手前の順に並べる（奥から描けば、手前の面が奥の線を隠す） */
export function cellOrder(cam: Camera, b: Bounds, nx: number, ny: number): Cell[] {
  const cells: { cell: Cell; depth: number }[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = gridPoint(b, nx, ny, i + 0.5, j + 0.5);
      cells.push({ cell: { i, j }, depth: project(cam, c, 0).depth });
    }
  }
  cells.sort((a, c) => c.depth - a.depth);
  return cells.map((c) => c.cell);
}

export interface ScreenFit {
  /** 1 単位あたりの画素数 */
  s: number;
  ox: number;
  oy: number;
}

/** (u, v) の点の全部が、余白 pad を残して w × h に収まる拡大と位置を求める（中央に置く） */
export function fitScreen(pts: { u: number; v: number }[], w: number, h: number, pad: number): ScreenFit {
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const p of pts) {
    uMin = Math.min(uMin, p.u);
    uMax = Math.max(uMax, p.u);
    vMin = Math.min(vMin, p.v);
    vMax = Math.max(vMax, p.v);
  }
  const bw = Math.max(1e-9, uMax - uMin);
  const bh = Math.max(1e-9, vMax - vMin);
  const s = Math.max(1, Math.min((w - pad * 2) / bw, (h - pad * 2) / bh));
  return { s, ox: w / 2 - ((uMin + uMax) / 2) * s, oy: h / 2 + ((vMin + vMax) / 2) * s };
}

/** (u, v) を画面の画素に写す（画面の y は下向き） */
export function toPixel(fit: ScreenFit, p: { u: number; v: number }): Vec {
  return { x: fit.ox + p.u * fit.s, y: fit.oy - p.v * fit.s };
}
