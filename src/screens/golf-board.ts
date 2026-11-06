import { contourLevels, contourSegments } from "../lib/golf/contour";
import type { Hole } from "../lib/golf/holes";
import type { Vec } from "../lib/golf/vec";
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

  draw(v: BoardView): void {
    if (!this.ensureSize()) return;
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
