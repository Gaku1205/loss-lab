import type { RepeatSpan } from "../lib/reward/cheat";
import type { World } from "../lib/reward/env";
import { COLORS } from "../ui";

export interface RewardBoardView {
  world: World;
  /** 盤の左上に出す課題（英語・日本語） */
  taskNo: number;
  taskEn: string;
  taskJa: string;
  /** 報酬が出るマスと値 */
  spots: Map<number, number>;
  /** 学習の途中の軌跡（薄く） */
  samples: readonly (readonly number[])[];
  /** 学び終えた動き。shown は何歩ぶん描くか（小数で途中まで） */
  final: { path: readonly number[]; shown: number } | null;
  /** ズルでくり返した所（shown が届いたら出す） */
  cheat: RepeatSpan | null;
  /** 順番どおりに通った目印の数 */
  passed: number;
  /** 学習している間のエピソード（無ければ null） */
  episode: string | null;
  /** 盤の枠を朱にする（ズル・失敗）。ロボットは学び終えた動きが無い時はスタートに置く */
  alarm: boolean;
}

const FONT_EN = '600 12px "Chakra Petch", system-ui, sans-serif';
const FONT_JA = '400 11px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
const FONT_NUM = '400 12px "JetBrains Mono", ui-monospace, monospace';
const FONT_NUM_S = '400 11px "JetBrains Mono", ui-monospace, monospace';

/** 箱庭の盤（上から見た部屋） */
export class RewardBoard {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D の描画が使えません");
    this.ctx = ctx;
  }

  draw(v: RewardBoardView): void {
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
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, w, h);

    const world = v.world;
    const pad = w < 600 ? 16 : 24;
    const top = 40;
    // 外周の壁は描かず、内側の部屋を外枠で囲む（外周の壁のマスは 1 マスぶん外にはみ出す）
    const iw = world.w - 2;
    const ih = world.h - 2;
    const s = Math.max(8, Math.floor(Math.min((w - pad * 2) / iw, (h - top - pad) / ih)));
    const ox = Math.round((w - s * iw) / 2) - s;
    const oy = Math.round(top + (h - top - pad - s * ih) / 2) - s;
    const cx = (cell: number) => ox + (world.floor[cell].x + 0.5) * s;
    const cy = (cell: number) => oy + (world.floor[cell].y + 0.5) * s;

    // 床と壁
    for (let y = 1; y < world.h - 1; y++) {
      for (let x = 1; x < world.w - 1; x++) {
        ctx.fillStyle = world.wall[y * world.w + x] ? COLORS.rule : COLORS.board;
        ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
    }
    // 拭いたマス（課題3）
    const shownSteps = v.final ? Math.min(v.final.path.length - 1, Math.floor(v.final.shown)) : -1;
    if (world.kind === "clean" && v.final) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = COLORS.leaf;
      const seen = new Set(v.final.path.slice(0, shownSteps + 1));
      for (const c of seen) ctx.fillRect(ox + world.floor[c].x * s, oy + world.floor[c].y * s, s, s);
      ctx.globalAlpha = 1;
    }
    // マスの区切り
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 2; x <= world.w - 2; x++) {
      ctx.moveTo(ox + x * s + 0.5, oy + s);
      ctx.lineTo(ox + x * s + 0.5, oy + (world.h - 1) * s);
    }
    for (let y = 2; y <= world.h - 2; y++) {
      ctx.moveTo(ox + s, oy + y * s + 0.5);
      ctx.lineTo(ox + (world.w - 1) * s, oy + y * s + 0.5);
    }
    ctx.stroke();
    // 部屋の外枠（外周の壁）
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = COLORS.text;
    ctx.strokeRect(ox + s + 0.5, oy + s + 0.5, iw * s - 1, ih * s - 1);
    ctx.globalAlpha = 1;

    // スタート
    ctx.strokeStyle = COLORS.text;
    ctx.strokeRect(Math.round(cx(world.start)) - 2.5, Math.round(cy(world.start)) - 2.5, 6, 6);
    // ゴール
    if (world.goal >= 0) {
      const gx = cx(world.goal);
      const gy = cy(world.goal);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(gx, gy, s * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx - 3, gy);
      ctx.lineTo(gx + 3, gy);
      ctx.moveTo(gx, gy - 3);
      ctx.lineTo(gx, gy + 3);
      ctx.stroke();
    }
    // 目印
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    world.marks.forEach((m, i) => {
      const color = i < v.passed ? COLORS.leaf : COLORS.text;
      const half = Math.round(s * 0.25);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(cx(m)) - half + 0.5, Math.round(cy(m)) - half + 0.5, half * 2, half * 2);
      ctx.fillStyle = color;
      ctx.font = FONT_NUM;
      ctx.fillText(String(i + 1), cx(m), cy(m) + 1);
    });
    // 報酬が出る場所の値
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = FONT_NUM_S;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.text;
    for (const [cell, val] of v.spots) {
      const c = world.floor[cell];
      ctx.fillText(`${val >= 0 ? "+" : "−"}${Math.abs(val)}`, ox + (c.x + 1) * s - 3, oy + c.y * s + 3);
    }
    ctx.globalAlpha = 1;

    // 学習の途中の軌跡
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = COLORS.leaf;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.25;
    v.samples.forEach((path, k) => {
      // 重なりを少しずらして、別々の線と分かるようにする
      const off = ((k % 5) - 2) * Math.max(1, s * 0.03);
      ctx.beginPath();
      path.forEach((c, i) => {
        if (i === 0) ctx.moveTo(cx(c) + off, cy(c) + off);
        else ctx.lineTo(cx(c) + off, cy(c) + off);
      });
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // 学び終えた動き
    let robot = { x: cx(world.start), y: cy(world.start) };
    if (v.final) {
      const path = v.final.path;
      const shown = Math.min(path.length - 1, Math.max(0, v.final.shown));
      const cheatFrom = v.cheat ? v.cheat.start : Number.POSITIVE_INFINITY;
      const cheatTo = v.cheat ? v.cheat.end - 1 : -1;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 6;
      for (let i = 1; i <= Math.ceil(shown); i++) {
        const t = Math.min(1, shown - (i - 1));
        const a = path[i - 1];
        const b = path[i];
        const bad = i > cheatFrom && i <= cheatTo;
        const color = bad ? COLORS.vermilion : COLORS.leaf;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.moveTo(cx(a), cy(a));
        ctx.lineTo(cx(a) + (cx(b) - cx(a)) * t, cy(a) + (cy(b) - cy(a)) * t);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const i0 = Math.floor(shown);
      const i1 = Math.min(path.length - 1, i0 + 1);
      const f = shown - i0;
      robot = { x: cx(path[i0]) + (cx(path[i1]) - cx(path[i0])) * f, y: cy(path[i0]) + (cy(path[i1]) - cy(path[i0])) * f };
      // くり返したマス
      if (v.cheat && shown >= cheatTo) {
        ctx.strokeStyle = COLORS.vermilion;
        ctx.lineWidth = 1.5;
        for (const c of new Set(path.slice(v.cheat.start, v.cheat.end))) {
          const p = world.floor[c];
          ctx.strokeRect(ox + p.x * s + 4.5, oy + p.y * s + 4.5, s - 9, s - 9);
        }
      }
    }

    // ロボット
    const body = Math.max(10, Math.round(s * 0.36));
    const ring = Math.round(s * 0.6);
    ctx.fillStyle = COLORS.text;
    ctx.fillRect(Math.round(robot.x - body / 2), Math.round(robot.y - body / 2), body, body);
    ctx.strokeStyle = COLORS.leaf;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.round(robot.x - ring / 2) + 0.5, Math.round(robot.y - ring / 2) + 0.5, ring - 1, ring - 1);

    // 見出し
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.text;
    ctx.font = FONT_EN;
    const head = `TASK ${v.taskNo}  ${v.taskEn}`;
    ctx.fillText(head, pad, 20);
    const hw = ctx.measureText(head).width;
    ctx.globalAlpha = 0.7;
    ctx.font = FONT_JA;
    ctx.fillText(v.taskJa, pad + hw + 8, 20);
    ctx.globalAlpha = 1;
    if (v.episode) {
      ctx.textAlign = "right";
      ctx.font = FONT_NUM;
      ctx.fillText(v.episode, w - pad, 20);
    }

    // 失敗・ズルの時の枠
    if (v.alarm) {
      ctx.strokeStyle = COLORS.vermilion;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }
  }
}
