import { COLORS } from "../ui";

export const BOSS_W = 160;
export const BOSS_H = 112;

const DIGIT_3 = ["11110", "00001", "00001", "01110", "00001", "00001", "11110"];
const DIGIT_8 = ["01110", "10001", "10001", "01110", "10001", "10001", "01110"];

/** ボスの絵（データセットの形）。docs/design.md の「ボスの絵」。160×112 の絵を、画面の大きさ width に合わせて拡大する */
export function drawBoss(canvas: HTMLCanvasElement, floor: number, width: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const k = width / BOSS_W;
  canvas.width = Math.round(BOSS_W * k * dpr);
  canvas.height = Math.round(BOSS_H * k * dpr);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, 0, BOSS_W, BOSS_H);
  ctx.fillStyle = COLORS.text;
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 1;
  const dot = (x: number, y: number, filled: boolean) => {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    if (filled) ctx.fill();
    else ctx.stroke();
  };
  const cx = BOSS_W / 2;
  const cy = BOSS_H / 2;
  if (floor === 0) {
    // 噛み合った2つの三日月（x −1〜2、y −0.5〜1）
    const s = 40;
    for (let i = 0; i < 24; i++) {
      const t = (Math.PI * i) / 23;
      dot(cx + (Math.cos(t) - 0.5) * s, cy - (Math.sin(t) - 0.25) * s, true);
      dot(cx + (0.5 - Math.cos(t)) * s, cy - (0.25 - Math.sin(t)) * s, false);
    }
  } else if (floor === 1) {
    // 2本の腕の渦巻き
    const s = 46;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 28; i++) {
        const t = 0.12 + (0.88 * i) / 27;
        const a = 3 * Math.PI * t + k * Math.PI;
        dot(cx + Math.cos(a) * t * s, cy + Math.sin(a) * t * s, k === 0);
      }
    }
  } else if (floor === 2) {
    // 5×7 の升目で描いた 3 と 8
    const cell = 4;
    const gap = 3 * cell;
    const w = cell * 5 * 2 + gap;
    const x0 = Math.round(cx - w / 2);
    const y0 = Math.round(cy - (cell * 7) / 2);
    [DIGIT_3, DIGIT_8].forEach((rows, d) => {
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          if (row[i] === "1") ctx.fillRect(x0 + d * (cell * 5 + gap) + i * cell, y0 + j * cell, cell - 1, cell - 1);
        }
      });
    });
  } else {
    // 4×3 に並べた写真の枠
    const fw = 32;
    const fh = 28;
    const g = 4;
    const x0 = Math.round(cx - (fw * 4 + g * 3) / 2);
    const y0 = Math.round(cy - (fh * 3 + g * 2) / 2);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 4; i++) {
        const x = x0 + i * (fw + g);
        const y = y0 + j * (fh + g);
        ctx.strokeStyle = COLORS.rule;
        ctx.globalAlpha = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, fw - 1, fh - 1);
        ctx.strokeStyle = COLORS.text;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        const lines = 2 + ((i + j * 4) % 3);
        for (let k = 0; k < lines; k++) {
          const ly = y + 7 + k * 5 + 0.5;
          const len = 10 + ((i * 7 + j * 5 + k * 3) % 14);
          ctx.moveTo(x + 5, ly);
          ctx.lineTo(x + 5 + len, ly);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
