import { contourSegments } from "../lib/golf/contour";
import type { Vec } from "../lib/golf/vec";
import { FIELD, type Cls } from "../lib/defense/data";
import { classify, cover, COVER_MIN, KINDS, score, type Judge, type Neuron } from "../lib/defense/model";
import { COLORS } from "../ui";

/** 盤に描く点 */
export interface DotView {
  p: Vec;
  cls: Cls;
  /** 着いた時の判定（流れている間・見せるだけの点は null） */
  judge: Judge | null;
}

export interface DefenseView {
  neurons: readonly Neuron[];
  /** マウスの所に薄く出す、置く前のニューロン */
  ghost: Neuron | null;
  /** これから流れる点（薄く見せる） */
  preview: readonly DotView[];
  /** 流れている点・着いた点 */
  dots: readonly DotView[];
  /** 盤の枠を朱にする（失敗） */
  alarm: boolean;
}

interface Fit {
  s: number;
  cx: number;
  cy: number;
}

/** 区切りの大きさ（陣地の色を塗る升、CSS px） */
const CELL = 3;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 境界防衛線の盤。陣地と境界線は、ニューロンか大きさが変わった時だけ描き直す */
export class DefenseBoard {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement = document.createElement("canvas");
  private bgKey = "";
  private w = 0;
  private h = 0;
  private f: Fit = { s: 1, cx: 0, cy: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D の描画が使えません");
    this.ctx = ctx;
  }

  /** 1 単位が何 px か */
  get scale(): number {
    return this.f.s;
  }

  private fit(): Fit {
    const bw = FIELD.xMax - FIELD.xMin;
    const bh = FIELD.yMax - FIELD.yMin;
    const pad = this.w < 600 ? 12 : 24;
    const s = Math.max(1, Math.min((this.w - pad * 2) / bw, (this.h - pad * 2) / bh));
    return { s, cx: this.w / 2 - ((FIELD.xMin + FIELD.xMax) / 2) * s, cy: this.h / 2 + ((FIELD.yMin + FIELD.yMax) / 2) * s };
  }

  private toScreen(p: Vec): Vec {
    return { x: this.f.cx + p.x * this.f.s, y: this.f.cy - p.y * this.f.s };
  }

  /** 画面の位置（canvas の左上から CSS px）を盤の位置へ */
  toWorld(px: number, py: number): Vec {
    return { x: (px - this.f.cx) / this.f.s, y: (this.f.cy - py) / this.f.s };
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
    this.f = this.fit();
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  private drawBackground(neurons: readonly Neuron[]): void {
    const dpr = window.devicePixelRatio || 1;
    const key = `${JSON.stringify(neurons)}:${this.w}x${this.h}@${dpr}`;
    if (key === this.bgKey) return;
    this.bgKey = key;
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const g = this.bg.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COLORS.floor;
    g.fillRect(0, 0, this.w, this.h);
    const tl = this.toScreen({ x: FIELD.xMin, y: FIELD.yMax });
    const br = this.toScreen({ x: FIELD.xMax, y: FIELD.yMin });
    const fw = br.x - tl.x;
    const fh = br.y - tl.y;

    // 陣地の色分け（升ごとに中心で判定し、1升 = 1画素の絵を引き伸ばす。升の継ぎ目・段々が出ない）
    const nx = Math.max(1, Math.ceil(fw / CELL));
    const ny = Math.max(1, Math.ceil(fh / CELL));
    const cells = document.createElement("canvas");
    cells.width = nx;
    cells.height = ny;
    const cg = cells.getContext("2d");
    if (cg) {
      const img = cg.createImageData(nx, ny);
      const colA = rgb(COLORS.board);
      const colB = rgb(COLORS.rule);
      const colGap = rgb(COLORS.floor);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const p = {
            x: FIELD.xMin + ((i + 0.5) / nx) * (FIELD.xMax - FIELD.xMin),
            y: FIELD.yMax - ((j + 0.5) / ny) * (FIELD.yMax - FIELD.yMin),
          };
          const c = classify(neurons, p);
          const col = c === null ? colGap : c === "a" ? colA : colB;
          const o = (j * nx + i) * 4;
          img.data[o] = col[0];
          img.data[o + 1] = col[1];
          img.data[o + 2] = col[2];
          img.data[o + 3] = 255;
        }
      }
      cg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(cells, tl.x, tl.y, fw, fh);
    }

    const gx = Math.max(24, Math.round(fw / 5));
    const gy = Math.max(16, Math.round(fh / 5));
    if (neurons.length > 0) {
      // すき間の縁
      g.strokeStyle = COLORS.rule;
      g.lineWidth = 1;
      g.beginPath();
      for (const sg of contourSegments((p) => cover(neurons, p), FIELD, gx, gy, COVER_MIN)) {
        const a = this.toScreen(sg.a);
        const b = this.toScreen(sg.b);
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      }
      g.stroke();

      // 境界線（すき間の中は引かない）
      g.strokeStyle = COLORS.vermilion;
      g.shadowColor = COLORS.vermilion;
      g.shadowBlur = 6;
      g.lineWidth = 2;
      g.lineCap = "round";
      g.beginPath();
      for (const sg of contourSegments((p) => score(neurons, p), FIELD, gx, gy, 0)) {
        const mid = { x: (sg.a.x + sg.b.x) / 2, y: (sg.a.y + sg.b.y) / 2 };
        if (cover(neurons, mid) < COVER_MIN) continue;
        const a = this.toScreen(sg.a);
        const b = this.toScreen(sg.b);
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      }
      g.stroke();
      g.shadowBlur = 0;
    }

    // 場の外枠
    g.strokeStyle = COLORS.text;
    g.globalAlpha = 0.45;
    g.lineWidth = 1;
    g.strokeRect(Math.round(tl.x) + 0.5, Math.round(tl.y) + 0.5, Math.round(fw), Math.round(fh));
    g.globalAlpha = 0.7;
    g.fillStyle = COLORS.text;
    g.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    g.textBaseline = "top";
    g.fillText("INFLOW", tl.x + 8, tl.y + 8);
    const w1 = g.measureText("INFLOW ").width;
    g.font = '400 10px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
    g.fillText("流入 →", tl.x + 8 + w1, tl.y + 9);
    g.globalAlpha = 1;
  }

  private drawNeuron(n: Neuron): void {
    const ctx = this.ctx;
    const p = this.toScreen(n);
    const k = KINDS[n.kind];
    ctx.strokeStyle = COLORS.text;
    ctx.globalAlpha *= 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, k.sigma * this.f.s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha /= 0.45;
    const size = n.kind === "wide" ? 14 : 8;
    const x = Math.round(p.x - size / 2);
    const y = Math.round(p.y - size / 2);
    if (n.cls === "b") {
      ctx.fillStyle = COLORS.text;
      ctx.fillRect(x, y, size, size);
    } else {
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(x, y, size, size);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);
    }
  }

  private drawDot(d: DotView, color: string): void {
    const ctx = this.ctx;
    const p = this.toScreen(d.p);
    ctx.beginPath();
    if (d.cls === "b") {
      ctx.fillStyle = color;
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.arc(p.x, p.y, 3.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (d.judge === "miss" || d.judge === "leak") {
      ctx.strokeStyle = COLORS.vermilion;
      ctx.lineWidth = 1.5;
      const cx = p.x + 7;
      const cy = p.y - 7;
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - 3);
      ctx.lineTo(cx + 3, cy + 3);
      ctx.moveTo(cx + 3, cy - 3);
      ctx.lineTo(cx - 3, cy + 3);
      ctx.stroke();
    }
  }

  draw(v: DefenseView): void {
    if (!this.ensureSize()) return;
    this.drawBackground(v.neurons);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.restore();

    ctx.globalAlpha = 0.45;
    for (const d of v.preview) this.drawDot(d, COLORS.text);
    ctx.globalAlpha = 1;

    // ニューロン（効く広さの円は場の中だけ）
    const tl = this.toScreen({ x: FIELD.xMin, y: FIELD.yMax });
    const br = this.toScreen({ x: FIELD.xMax, y: FIELD.yMin });
    ctx.save();
    ctx.beginPath();
    ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.clip();
    for (const n of v.neurons) this.drawNeuron(n);
    if (v.ghost) {
      ctx.globalAlpha = 0.45;
      this.drawNeuron(v.ghost);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    for (const d of v.dots) {
      const color = d.judge === null ? COLORS.text : d.judge === "hit" ? COLORS.leaf : COLORS.vermilion;
      this.drawDot(d, color);
    }

    if (v.alarm) {
      ctx.strokeStyle = COLORS.vermilion;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, this.w - 2, this.h - 2);
    }
  }
}
