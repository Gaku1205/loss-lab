import { BUDGET } from "../lib/rogue/boss";
import { EPOCHS, type CurvePoint } from "../lib/rogue/game";
import { COLORS } from "../ui";

export interface CurveView {
  points: readonly CurvePoint[];
  /** 何目盛りまで描くか（伸びている途中は points より少ない） */
  shown: number;
  target: number;
  /** 縦の下端（ボスの当てずっぽうの正解率 %） */
  floorPct: number;
  /** 最後の1手が負けなら、その部分の検証精度を朱にする */
  lostLast: boolean;
}

const FONT_EN = '600 11px "Chakra Petch", system-ui, sans-serif';
const FONT_JA = '400 10px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';

/** 上の学習曲線（学習精度と検証精度、縦は当てずっぽうの正解率〜100%） */
export class RogueChart {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D の描画が使えません");
    this.ctx = ctx;
  }

  draw(v: CurveView): void {
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
    ctx.fillStyle = COLORS.board;
    ctx.fillRect(0, 0, w, h);

    const pad = w < 600 ? 16 : 32;
    const padT = 28;
    const padB = 10;
    const iw = w - pad * 2;
    const ih = h - padT - padB;
    const capacity = 1 + BUDGET * EPOCHS;
    const xOf = (i: number) => pad + (iw * i) / (capacity - 1);
    const lo = Math.min(v.floorPct, ...v.points.map((p) => p.val));
    const yOf = (pct: number) => padT + ih * (1 - (Math.min(100, Math.max(lo, pct)) - lo) / Math.max(1, 100 - lo));

    const n = Math.min(v.shown, v.points.length);
    // 枠の下の線・カードの区切り
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, Math.round(padT + ih) + 0.5);
    ctx.lineTo(pad + iw, Math.round(padT + ih) + 0.5);
    for (let m = EPOCHS; m <= n - 1; m += EPOCHS) {
      const x = Math.round(xOf(m)) + 0.5;
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + ih);
    }
    ctx.stroke();

    // 目標の線
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = COLORS.text;
    ctx.beginPath();
    const ty = Math.round(yOf(v.target)) + 0.5;
    ctx.moveTo(pad, ty);
    ctx.lineTo(pad + iw, ty);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const lostFrom = v.lostLast ? Math.max(0, v.points.length - 1 - EPOCHS) : Number.POSITIVE_INFINITY;
    // 学習精度（にじみなし）
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = v.points[i];
      if (i === 0) ctx.moveTo(xOf(i), yOf(p.train));
      else ctx.lineTo(xOf(i), yOf(p.train));
    }
    ctx.stroke();
    // 検証精度（光る線）
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 6;
    for (let i = 1; i < n; i++) {
      const color = i > lostFrom ? COLORS.vermilion : COLORS.amber;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(xOf(i - 1), yOf(v.points[i - 1].val));
      ctx.lineTo(xOf(i), yOf(v.points[i].val));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (n === 1) {
      const p = v.points[0];
      ctx.fillStyle = COLORS.amber;
      ctx.fillRect(xOf(0) - 2, yOf(p.val) - 2, 4, 4);
    }

    // 見出しと凡例
    ctx.textBaseline = "middle";
    const label = (x: number, en: string, ja: string) => {
      ctx.fillStyle = COLORS.text;
      ctx.font = FONT_EN;
      ctx.fillText(en, x, 14);
      const ew = ctx.measureText(en).width;
      ctx.globalAlpha = 0.7;
      ctx.font = FONT_JA;
      ctx.fillText(ja, x + ew + 6, 14);
      const jw = ctx.measureText(ja).width;
      ctx.globalAlpha = 1;
      return ew + 6 + jw;
    };
    label(pad, "LEARNING CURVE", "学習曲線");
    if (w >= 480) {
      const items: [string, string, string, number, number][] = [
        ["TRAIN", "学習", COLORS.text, 1, 1],
        ["VAL", "検証", COLORS.amber, 1.5, 1],
        ["TARGET", "目標", COLORS.text, 1, 0.45],
      ];
      ctx.font = FONT_EN;
      const widths = items.map(([en, ja]) => {
        ctx.font = FONT_EN;
        const a = ctx.measureText(en).width;
        ctx.font = FONT_JA;
        return 16 + 6 + a + 6 + ctx.measureText(ja).width;
      });
      let x = pad + iw - widths.reduce((s, x2) => s + x2, 0) - 16 * (items.length - 1);
      items.forEach(([en, ja, color, lw, alpha], i) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x, 14.5);
        ctx.lineTo(x + 16, 14.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
        label(x + 22, en, ja);
        x += widths[i] + 16;
      });
    }
  }
}
