import type { Bounds } from "./holes";
import type { Vec } from "./vec";

/** 線分（a から b） */
export interface Segment {
  a: Vec;
  b: Vec;
}

/**
 * 等高線の線分を求める（マーチングスクエア）。
 * 範囲を nx × ny の升に分け、各升の4隅の値から、値が level になる所を線分で結ぶ
 */
export function contourSegments(f: (p: Vec) => number, b: Bounds, nx: number, ny: number, level: number): Segment[] {
  const dx = (b.xMax - b.xMin) / nx;
  const dy = (b.yMax - b.yMin) / ny;
  const vals: number[] = new Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = f({ x: b.xMin + i * dx, y: b.yMin + j * dy });
  }
  const at = (i: number, j: number) => vals[j * (nx + 1) + i];
  const lerp = (p: Vec, q: Vec, vp: number, vq: number): Vec => {
    const t = (level - vp) / (vq - vp);
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  };
  const out: Segment[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = b.xMin + i * dx;
      const y0 = b.yMin + j * dy;
      const c = [
        { p: { x: x0, y: y0 }, v: at(i, j) },
        { p: { x: x0 + dx, y: y0 }, v: at(i + 1, j) },
        { p: { x: x0 + dx, y: y0 + dy }, v: at(i + 1, j + 1) },
        { p: { x: x0, y: y0 + dy }, v: at(i, j + 1) },
      ];
      const pts: Vec[] = [];
      for (let k = 0; k < 4; k++) {
        const p = c[k];
        const q = c[(k + 1) % 4];
        if (p.v < level !== q.v < level) pts.push(lerp(p.p, q.p, p.v, q.v));
      }
      if (pts.length === 2) out.push({ a: pts[0], b: pts[1] });
      else if (pts.length === 4) {
        out.push({ a: pts[0], b: pts[1] });
        out.push({ a: pts[2], b: pts[3] });
      }
    }
  }
  return out;
}

/** 等高線を引く損失の値。最小値の少し上から max まで、倍々で増やす */
export function contourLevels(max: number, first = 0.01, ratio = 1.6): number[] {
  const out: number[] = [];
  for (let v = first; v < max; v *= ratio) out.push(v);
  return out;
}
