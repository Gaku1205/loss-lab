import { contourLevels, contourSegments } from "../lib/golf/contour";
import type { Hole } from "../lib/golf/holes";
import type { Vec } from "../lib/golf/vec";
import {
  buildSurface,
  cellOrder,
  DEFAULT_CAMERA,
  fitScreen,
  gridPoint,
  liftZ,
  project,
  toPixel,
  type ScreenFit,
  type Surface,
} from "../lib/golf/view3d";
import { formatWind, WIND_MAX, windDir, type Wind } from "../lib/golf/wind";
import { COLORS } from "../ui";

/** 盤に描く軌跡 */
export interface Trail {
  path: Vec[];
  ob: boolean;
}

export interface BoardView {
  hole: Hole;
  ball: Vec;
  /** 終わった打の軌跡 */
  trails: Trail[];
  /** 今動いている打（無ければ null）。shown は何ステップぶん描くか（小数で途中まで） */
  live: { trail: Trail; shown: number } | null;
  /** OB の印を出す所 */
  obMark: Vec | null;
  /** 盤の枠を朱にする（失敗） */
  alarm: boolean;
  /** 打つ前の立体表示（斜め上から）。false なら上から見た等高線 */
  view3d: boolean;
}

/** 立体表示の格子の升の数（0.1 刻み） */
const MESH_NX = 32;
const MESH_NY = 20;

interface Scene3D {
  key: string;
  surface: Surface;
  fit: ScreenFit;
  bg: HTMLCanvasElement;
}

interface Fit {
  s: number;
  cx: number;
  cy: number;
}

/** 等高線つきのコースの盤。等高線は大きさとホールが変わった時だけ描き直す */
export class Board {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement = document.createElement("canvas");
  private bgKey = "";
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D の描画が使えません");
    this.ctx = ctx;
  }

  private fit(hole: Hole): Fit {
    const b = hole.bounds;
    const bw = b.xMax - b.xMin;
    const bh = b.yMax - b.yMin;
    const pad = this.w < 600 ? 16 : 32;
    const s = Math.max(1, Math.min((this.w - pad * 2) / bw, (this.h - pad * 2) / bh));
    return { s, cx: this.w / 2 - ((b.xMin + b.xMax) / 2) * s, cy: this.h / 2 + ((b.yMin + b.yMax) / 2) * s };
  }

  private toScreen(f: Fit, p: Vec): Vec {
    return { x: f.cx + p.x * f.s, y: f.cy - p.y * f.s };
  }

  private ensureSize(): boolean {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w < 2 || h < 2) return false;
    const dpr = window.devicePixelRatio || 1;
    if (w !== this.w || h !== this.h || this.canvas.width !== Math.round(w * dpr)) {
      this.w = w;
      this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.bgKey = "";
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  private drawBackground(hole: Hole, f: Fit): void {
    const dpr = window.devicePixelRatio || 1;
    const key = `${hole.no}:${this.w}x${this.h}@${dpr}`;
    if (key === this.bgKey) return;
    this.bgKey = key;
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const g = this.bg.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COLORS.floor;
    g.fillRect(0, 0, this.w, this.h);
    const b = hole.bounds;
    const tl = this.toScreen(f, { x: b.xMin, y: b.yMax });
    const br = this.toScreen(f, { x: b.xMax, y: b.yMin });
    g.fillStyle = COLORS.board;
    g.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // 見えている範囲いっぱいに等高線を引く
    const view = {
      xMin: (0 - f.cx) / f.s,
      xMax: (this.w - f.cx) / f.s,
      yMin: (f.cy - this.h) / f.s,
      yMax: f.cy / f.s,
    };
    const nx = Math.max(24, Math.round(this.w / 6));
    const ny = Math.max(16, Math.round(this.h / 6));
    const corners = [
      { x: view.xMin, y: view.yMin },
      { x: view.xMax, y: view.yMin },
      { x: view.xMin, y: view.yMax },
      { x: view.xMax, y: view.yMax },
      { x: b.xMin, y: b.yMax },
      { x: b.xMax, y: b.yMin },
    ];
    const maxLoss = Math.max(...corners.map((p) => hole.loss(p)));
    g.strokeStyle = COLORS.rule;
    g.lineWidth = 1;
    g.beginPath();
    for (const level of contourLevels(maxLoss, 0.005, 1.6)) {
      for (const sgm of contourSegments(hole.loss, view, nx, ny, level)) {
        const a = this.toScreen(f, sgm.a);
        const c = this.toScreen(f, sgm.b);
        g.moveTo(a.x, a.y);
        g.lineTo(c.x, c.y);
      }
    }
    g.stroke();

    // OB の境目
    g.strokeStyle = COLORS.text;
    g.globalAlpha = 0.45;
    g.strokeRect(Math.round(tl.x) + 0.5, Math.round(tl.y) + 0.5, Math.round(br.x - tl.x), Math.round(br.y - tl.y));
    g.globalAlpha = 1;

    // スタートとカップ
    const st = this.toScreen(f, hole.start);
    g.strokeStyle = COLORS.text;
    g.strokeRect(Math.round(st.x - 3) + 0.5, Math.round(st.y - 3) + 0.5, 6, 6);
    const cup = this.toScreen(f, hole.cup);
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cup.x, cup.y, Math.max(6, hole.cupRadius * f.s), 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cup.x - 3, cup.y);
    g.lineTo(cup.x + 3, cup.y);
    g.moveTo(cup.x, cup.y - 3);
    g.lineTo(cup.x, cup.y + 3);
    g.stroke();
    g.fillStyle = COLORS.text;
    g.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    g.textBaseline = "middle";
    g.fillText("START", st.x + 10, st.y - 10);
    g.fillText("CUP", cup.x + Math.max(6, hole.cupRadius * f.s) + 6, cup.y - 10);

    if (hole.wind) this.drawWind(g, hole.wind);
  }

  /** 盤の右上の内側に、風の向き（矢印）と強さ（数字） */
  private drawWind(g: CanvasRenderingContext2D, wind: Wind): void {
    const pad = this.w < 600 ? 16 : 24;
    const box = 40;
    const right = this.w - pad;
    const bx = right - box;
    const by = pad + 16;
    // ラベル `WIND 風`（右寄せ）
    g.textBaseline = "middle";
    g.textAlign = "right";
    g.fillStyle = COLORS.text;
    g.font = '400 10px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
    g.globalAlpha = 0.7;
    g.fillText("風", right, pad + 5);
    const jaW = g.measureText("風").width;
    g.globalAlpha = 1;
    g.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    g.fillText("WIND", right - jaW - 4, pad + 5);
    // 矢印の枠
    g.strokeStyle = COLORS.rule;
    g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, box - 1, box - 1);
    // 矢印（長さは強さに比例）
    const u = windDir(wind);
    const half = 6 + 10 * (wind.strength / WIND_MAX);
    const cx = bx + box / 2;
    const cy = by + box / 2;
    const tip = { x: cx + u.x * half, y: cy - u.y * half };
    const tail = { x: cx - u.x * half, y: cy + u.y * half };
    const ang = Math.atan2(tip.y - tail.y, tip.x - tail.x);
    g.strokeStyle = COLORS.text;
    g.lineWidth = 1.5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(tail.x, tail.y);
    g.lineTo(tip.x, tip.y);
    for (const d of [Math.PI * 0.8, -Math.PI * 0.8]) {
      g.moveTo(tip.x, tip.y);
      g.lineTo(tip.x + Math.cos(ang + d) * 6, tip.y + Math.sin(ang + d) * 6);
    }
    g.stroke();
    g.lineCap = "butt";
    // 強さ
    g.font = '400 12px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = COLORS.text;
    g.fillText(formatWind(wind.strength), bx - 8, cy);
    g.textAlign = "start";
  }

  private strokePath(f: Fit, path: Vec[], shown: number): Vec | null {
    if (path.length === 0) return null;
    const ctx = this.ctx;
    const n = Math.max(0, Math.min(shown, path.length - 1));
    const whole = Math.floor(n);
    const start = this.toScreen(f, path[0]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    let last = start;
    for (let i = 1; i <= whole; i++) {
      last = this.toScreen(f, path[i]);
      ctx.lineTo(last.x, last.y);
    }
    const frac = n - whole;
    if (frac > 0 && whole + 1 < path.length) {
      const a = path[whole];
      const b = path[whole + 1];
      last = this.toScreen(f, { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac });
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
    return { x: (last.x - f.cx) / f.s, y: (f.cy - last.y) / f.s };
  }

  // ---- 立体表示（打つ前だけ） ----

  private scene: Scene3D | null = null;

  private ensureScene(hole: Hole): Scene3D {
    const dpr = window.devicePixelRatio || 1;
    const key = `${hole.no}:${this.w}x${this.h}@${dpr}`;
    if (this.scene && this.scene.key === key) return this.scene;
    const b = hole.bounds;
    const surface = buildSurface(hole.loss, b, MESH_NX, MESH_NY);
    const cam = DEFAULT_CAMERA;
    const pts: { u: number; v: number }[] = [];
    for (let j = 0; j <= MESH_NY; j++) {
      for (let i = 0; i <= MESH_NX; i++) pts.push(project(cam, gridPoint(b, MESH_NX, MESH_NY, i, j), surface.z[j * (MESH_NX + 1) + i]));
    }
    const fit = fitScreen(pts, this.w, this.h, this.w < 600 ? 16 : 32);
    const bg = document.createElement("canvas");
    bg.width = this.canvas.width;
    bg.height = this.canvas.height;
    const scene: Scene3D = { key, surface, fit, bg };
    const g = bg.getContext("2d");
    if (g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.paintSurface(g, hole, scene);
    }
    this.scene = scene;
    return scene;
  }

  private lift3d(hole: Hole, s: Scene3D, p: Vec): Vec {
    const z = liftZ(hole.loss(p), s.surface.scale, s.surface.zMax);
    return toPixel(s.fit, project(DEFAULT_CAMERA, p, z));
  }

  /** 地形を奥から手前へ面で塗って、罫色の線で格子を引く。スタートとカップも描く */
  private paintSurface(g: CanvasRenderingContext2D, hole: Hole, s: Scene3D): void {
    const b = hole.bounds;
    const { surface, fit } = s;
    const cam = DEFAULT_CAMERA;
    const at = (i: number, j: number): Vec =>
      toPixel(fit, project(cam, gridPoint(b, MESH_NX, MESH_NY, i, j), surface.z[j * (MESH_NX + 1) + i]));
    g.fillStyle = COLORS.floor;
    g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = COLORS.board;
    g.strokeStyle = COLORS.rule;
    g.lineWidth = 1;
    g.lineJoin = "round";
    for (const { i, j } of cellOrder(cam, b, MESH_NX, MESH_NY)) {
      const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      g.beginPath();
      g.moveTo(q[0].x, q[0].y);
      for (let k = 1; k < 4; k++) g.lineTo(q[k].x, q[k].y);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // OB の境目（コースの外枠）
    g.strokeStyle = COLORS.text;
    g.globalAlpha = 0.45;
    g.beginPath();
    const edge: [number, number][] = [];
    for (let i = 0; i <= MESH_NX; i++) edge.push([i, 0]);
    for (let j = 1; j <= MESH_NY; j++) edge.push([MESH_NX, j]);
    for (let i = MESH_NX - 1; i >= 0; i--) edge.push([i, MESH_NY]);
    for (let j = MESH_NY - 1; j >= 0; j--) edge.push([0, j]);
    edge.forEach(([i, j], k) => {
      const p = at(i, j);
      if (k === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    });
    g.stroke();
    g.globalAlpha = 1;

    // スタート（小さな四角）とカップ（輪と十字）。地形の上の高さに置く
    const st = this.lift3d(hole, s, hole.start);
    g.strokeStyle = COLORS.text;
    g.strokeRect(Math.round(st.x - 3) + 0.5, Math.round(st.y - 3) + 0.5, 6, 6);
    const cup = this.lift3d(hole, s, hole.cup);
    const ring = Math.max(6, hole.cupRadius * fit.s);
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(cup.x, cup.y, ring, ring * Math.sin(cam.pitch), 0, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cup.x - 3, cup.y);
    g.lineTo(cup.x + 3, cup.y);
    g.moveTo(cup.x, cup.y - 3);
    g.lineTo(cup.x, cup.y + 3);
    g.stroke();
    g.fillStyle = COLORS.text;
    g.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    g.textBaseline = "middle";
    g.fillText("START", st.x + 10, st.y - 10);
    g.fillText("CUP", cup.x + ring + 6, cup.y - 10);
  }

  private draw3d(v: BoardView): void {
    const s = this.ensureScene(v.hole);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(s.bg, 0, 0);
    ctx.restore();

    // 前の打の軌跡（地形の上の高さで）
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 1.5;
    for (const t of v.trails) {
      if (t.path.length === 0) continue;
      ctx.strokeStyle = t.ob ? COLORS.vermilion : COLORS.cyan;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      t.path.forEach((p, k) => {
        const q = this.lift3d(v.hole, s, p);
        if (k === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const p = this.lift3d(v.hole, s, v.ball);
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();

    if (v.hole.wind) this.drawWind(ctx, v.hole.wind);
    if (v.alarm) {
      ctx.strokeStyle = COLORS.vermilion;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, this.w - 2, this.h - 2);
    }
  }

  draw(v: BoardView): void {
    if (!this.ensureSize()) return;
    if (v.view3d && !v.live) {
      this.draw3d(v);
      return;
    }
    const f = this.fit(v.hole);
    this.drawBackground(v.hole, f);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.restore();

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 1.5;
    for (const t of v.trails) {
      ctx.strokeStyle = t.ob ? COLORS.vermilion : COLORS.cyan;
      ctx.globalAlpha = 0.45;
      this.strokePath(f, t.path, t.path.length);
    }
    ctx.globalAlpha = 1;

    let ball = v.ball;
    if (v.live) {
      ctx.lineWidth = 2;
      ctx.shadowBlur = 6;
      const path = v.live.trail.path;
      // OB の打は、最後の1ステップ（外へ出た線）だけ朱
      const lastIn = v.live.trail.ob ? path.length - 2 : path.length - 1;
      ctx.strokeStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan;
      let end = this.strokePath(f, path.slice(0, lastIn + 1), Math.min(v.live.shown, lastIn));
      if (v.live.trail.ob && v.live.shown > lastIn) {
        ctx.strokeStyle = COLORS.vermilion;
        ctx.shadowColor = COLORS.vermilion;
        end = this.strokePath(f, path.slice(lastIn), v.live.shown - lastIn);
      }
      ctx.shadowBlur = 0;
      if (end) ball = end;
    }

    // 玉
    const p = this.toScreen(f, ball);
    if (p.x > -20 && p.x < this.w + 20 && p.y > -20 && p.y < this.h + 20) {
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (v.obMark) {
      const m = this.toScreen(f, v.obMark);
      const x = Math.min(this.w - 24, Math.max(24, m.x));
      const y = Math.min(this.h - 16, Math.max(16, m.y));
      ctx.fillStyle = COLORS.vermilion;
      ctx.font = '600 16px "Chakra Petch", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("OB", x, y);
      ctx.textAlign = "start";
    }

    if (v.alarm) {
      ctx.strokeStyle = COLORS.vermilion;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, this.w - 2, this.h - 2);
    }
  }
}
