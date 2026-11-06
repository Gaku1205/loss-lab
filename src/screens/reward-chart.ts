import { LEARN } from "../lib/reward/learn";
import { COLORS } from "../ui";

const FONT_EN = '600 11px "Chakra Petch", system-ui, sans-serif';
const FONT_JA = '400 10px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
const FONT_NUM = '400 11px "JetBrains Mono", ui-monospace, monospace';

/** 報酬の推移（エピソードごとの報酬の合計） */
export class RewardChart {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D の描画が使えません");
    this.ctx = ctx;
  }

  /** returns のうち shown 個まで描く */
  draw(returns: readonly number[], shown: number): void {
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
    ctx.clearRect(0, 0, w, h);

    const pad = w < 600 ? 16 : 32;
    const padT = 26;
    const padB = 8;
    const iw = w - pad * 2;
    const ih = h - padT - padB;
    const n = LEARN.episodes;
    const lo = Math.min(0, ...returns);
    const hi = Math.max(0, ...returns);
    const span = Math.max(1, hi - lo);
    const xOf = (i: number) => pad + (iw * i) / Math.max(1, n - 1);
    const yOf = (v: number) => padT + ih * (1 - (v - lo) / span);

    // 報酬 0 の線
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const zy = Math.round(yOf(0)) + 0.5;
    ctx.moveTo(pad, zy);
    ctx.lineTo(pad + iw, zy);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const m = Math.min(shown, returns.length);
    if (m > 0) {
      ctx.strokeStyle = COLORS.leaf;
      ctx.shadowColor = COLORS.leaf;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < m; i++) {
        if (i === 0) ctx.moveTo(xOf(i), yOf(returns[i]));
        else ctx.lineTo(xOf(i), yOf(returns[i]));
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.text;
    ctx.font = FONT_EN;
    ctx.fillText("REWARD", pad, 13);
    const ew = ctx.measureText("REWARD").width;
    ctx.globalAlpha = 0.7;
    ctx.font = FONT_JA;
    ctx.fillText("報酬の推移", pad + ew + 6, 13);
    ctx.textAlign = "right";
    ctx.font = FONT_NUM;
    ctx.fillText(`EPISODE 1–${n}`, pad + iw, 13);
    ctx.globalAlpha = 1;
  }
}
