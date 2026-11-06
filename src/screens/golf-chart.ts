import { COLORS } from "../ui";

export interface LossPoint {
  v: number;
  ob: boolean;
}

export interface ChartView {
  points: LossPoint[];
  /** 打ちの区切り（points の何番目から次の打か） */
  marks: number[];
  /** 横の目盛りの数（上限の打数 × 1打のステップ ＋ 1） */
  capacity: number;
  /** 縦の上端に使う損失 */
  top: number;
}

const FLOOR = 1e-4;

/** 下の損失の折れ線（縦は対数） */
export class LossChart {
  private ctx: CanvasRenderingContext2D;

  /** mini：上の帯の小さな折れ線（見出し・余白なし） */
  constructor(
    private canvas: HTMLCanvasElement,
    private mini = false,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D の描画が使えません");
    this.ctx = ctx;
  }

  draw(v: ChartView): void {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w < 2 || h < 2) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.mini) {
      ctx.clearRect(0, 0, w, h);
    } else {
      ctx.fillStyle = COLORS.board;
      ctx.fillRect(0, 0, w, h);
    }

    const padL = this.mini ? 4 : w < 600 ? 16 : 32;
    const padR = padL;
    const padT = this.mini ? 6 : 24;
    const padB = this.mini ? 6 : 8;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    const lo = Math.log10(FLOOR);
    const hi = Math.log10(Math.max(v.top, FLOOR * 10));
    const xOf = (i: number) => padL + (iw * i) / Math.max(1, v.capacity - 1);
    const yOf = (val: number) => {
      const c = Math.min(hi, Math.max(lo, Math.log10(Math.max(FLOOR, Number.isFinite(val) ? val : 1e300))));
      return padT + ih * (1 - (c - lo) / (hi - lo));
    };

    // 区切りの縦線
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const m of v.marks) {
      const x = Math.round(xOf(m)) + 0.5;
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + ih);
    }
    ctx.moveTo(padL, Math.round(padT + ih) + 0.5);
    ctx.lineTo(padL + iw, Math.round(padT + ih) + 0.5);
    ctx.stroke();

    // 折れ線
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.shadowBlur = 6;
    for (let i = 1; i < v.points.length; i++) {
      const a = v.points[i - 1];
      const b = v.points[i];
      const color = b.ob ? COLORS.vermilion : COLORS.cyan;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(xOf(i - 1), yOf(a.v));
      ctx.lineTo(xOf(i), yOf(b.v));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (this.mini) return;

    ctx.fillStyle = COLORS.text;
    ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    ctx.textBaseline = "middle";
    ctx.fillText("LOSS", padL, 12);
    const enW = ctx.measureText("LOSS").width;
    ctx.globalAlpha = 0.7;
    ctx.font = '400 10px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillText("損失（対数）", padL + enW + 6, 12);
    ctx.globalAlpha = 1;
  }
}
