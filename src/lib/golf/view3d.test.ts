import { describe, expect, it } from "vitest";
import { HOLES } from "./holes";
import { buildSurface, cellOrder, DEFAULT_CAMERA, fitScreen, gridPoint, liftZ, project, SURFACE_HEIGHT, toPixel } from "./view3d";

const b = HOLES[0].bounds;

describe("project", () => {
  it("真上から（pitch=π/2・yaw=0）は x, y がそのまま画面になり、高さは効かない", () => {
    const cam = { yaw: 0, pitch: Math.PI / 2 };
    const p = project(cam, { x: 0.5, y: -0.3 }, 0.9);
    expect(p.u).toBeCloseTo(0.5);
    expect(p.v).toBeCloseTo(-0.3);
  });

  it("斜めから見ると、高い点ほど画面の上に出る", () => {
    const lo = project(DEFAULT_CAMERA, { x: 0, y: 0 }, 0);
    const hi = project(DEFAULT_CAMERA, { x: 0, y: 0 }, 1);
    expect(hi.v).toBeGreaterThan(lo.v);
    expect(hi.u).toBeCloseTo(lo.u);
  });

  it("奥の点ほど奥行きが大きく、画面の上に出る", () => {
    const cam = { yaw: 0, pitch: 0.9 };
    const near = project(cam, { x: 0, y: -1 }, 0);
    const far = project(cam, { x: 0, y: 1 }, 0);
    expect(far.depth).toBeGreaterThan(near.depth);
    expect(far.v).toBeGreaterThan(near.v);
  });
});

describe("buildSurface", () => {
  it("いちばん高い頂点が zMax になり、頂点の数は (nx+1)(ny+1)", () => {
    const s = buildSurface(HOLES[0].loss, b, 16, 10);
    expect(s.z).toHaveLength(17 * 11);
    expect(Math.max(...s.z)).toBeCloseTo(SURFACE_HEIGHT);
    expect(Math.min(...s.z)).toBeGreaterThanOrEqual(0);
  });

  it("谷底（カップ）の近くは低い", () => {
    const hole = HOLES[0];
    const s = buildSurface(hole.loss, b, 32, 20);
    expect(liftZ(hole.loss(hole.cup), s.scale, s.zMax)).toBeLessThan(0.01);
    expect(liftZ(hole.loss(hole.start), s.scale, s.zMax)).toBeGreaterThan(0.1);
  });

  it("全ホールで、高さは 0〜zMax に収まる数になる", () => {
    for (const h of HOLES) {
      const s = buildSurface(h.loss, h.bounds, 32, 20);
      for (const z of s.z) {
        expect(Number.isFinite(z)).toBe(true);
        expect(z).toBeGreaterThanOrEqual(0);
        expect(z).toBeLessThanOrEqual(s.zMax + 1e-9);
      }
    }
  });
});

describe("liftZ", () => {
  it("大きすぎる値・数でない値は上限に収める", () => {
    expect(liftZ(100, 1, 1.1)).toBe(1.1);
    expect(liftZ(Infinity, 1, 1.1)).toBe(1.1);
    expect(liftZ(NaN, 1, 1.1)).toBe(1.1);
    expect(liftZ(0.5, 0.5, 1.1)).toBeCloseTo(0.25);
  });
});

describe("gridPoint", () => {
  it("角の頂点がコースの角になる", () => {
    expect(gridPoint(b, 8, 5, 0, 0)).toEqual({ x: b.xMin, y: b.yMin });
    expect(gridPoint(b, 8, 5, 8, 5)).toEqual({ x: b.xMax, y: b.yMax });
  });
});

describe("cellOrder", () => {
  it("全部の升が1回ずつ、奥から手前の順に並ぶ", () => {
    const nx = 8;
    const ny = 5;
    const order = cellOrder(DEFAULT_CAMERA, b, nx, ny);
    expect(order).toHaveLength(nx * ny);
    expect(new Set(order.map((c) => `${c.i},${c.j}`)).size).toBe(nx * ny);
    const depth = (c: { i: number; j: number }) => project(DEFAULT_CAMERA, gridPoint(b, nx, ny, c.i + 0.5, c.j + 0.5), 0).depth;
    for (let k = 1; k < order.length; k++) expect(depth(order[k - 1])).toBeGreaterThanOrEqual(depth(order[k]));
  });
});

describe("fitScreen", () => {
  it("全部の点が余白を残して画面に収まり、中央に置かれる", () => {
    const surface = buildSurface(HOLES[0].loss, b, 16, 10);
    const pts: { u: number; v: number }[] = [];
    for (let j = 0; j <= 10; j++) {
      for (let i = 0; i <= 16; i++) pts.push(project(DEFAULT_CAMERA, gridPoint(b, 16, 10, i, j), surface.z[j * 17 + i]));
    }
    const fit = fitScreen(pts, 800, 400, 24);
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of pts) {
      const q = toPixel(fit, p);
      xMin = Math.min(xMin, q.x);
      xMax = Math.max(xMax, q.x);
      yMin = Math.min(yMin, q.y);
      yMax = Math.max(yMax, q.y);
    }
    expect(xMin).toBeGreaterThanOrEqual(24 - 1e-6);
    expect(xMax).toBeLessThanOrEqual(800 - 24 + 1e-6);
    expect(yMin).toBeGreaterThanOrEqual(24 - 1e-6);
    expect(yMax).toBeLessThanOrEqual(400 - 24 + 1e-6);
    expect((xMin + xMax) / 2).toBeCloseTo(400);
    expect((yMin + yMax) / 2).toBeCloseTo(200);
  });
});
