import type { ShotEvent } from "./game";
import type { Method } from "./optimizer";
import { dist, type Vec } from "./vec";

/** 損失の数字を、桁が大きく変わっても読める形に */
export function formatLoss(v: number): string {
  if (!Number.isFinite(v) || v >= 1e6) return "∞";
  if (v === 0) return "0";
  if (v < 0.001 || v >= 1000) return v.toExponential(1);
  return v.toPrecision(3);
}

export function methodLabel(m: Method): string {
  return m === "gd" ? "GD" : "Momentum";
}

/** 学習率を表示する形（η=0.050） */
export function formatLr(lr: number): string {
  return lr < 0.01 ? lr.toFixed(4) : lr < 0.1 ? lr.toFixed(3) : lr.toFixed(2);
}

const INTRO_NOTES: readonly string[] = [
  "丸い谷。まず学習率 η を変えて、1打で進む距離の違いを記録する。",
  "細長い谷。縦は急、横はゆるい。GD と Momentum を比べる。",
  "曲がった谷。谷の向きが途中で変わる。η を打つたびに見直す。",
  "ここから風が吹く。風はミニバッチごとの勾配のばらつき（SGD のノイズ）。打つたびに軌跡が揺れる。",
  "細長い谷に縦の風。急な向きに揺さぶられる。η を上げすぎると谷の壁を越える。",
  "窪みが二つ。手前の浅い窪みは局所解。GD では抜けにくい。勢いで越える。",
  "斜めの細い谷。縦と横の急さが 60 倍ちがう。GD では谷に沿って進まない。",
  "平らな台地。遠くは勾配が小さく、ほとんど進まない。谷底の近くだけ急になる。",
  "嵐の谷。風がいちばん強い。勢いを付けると風で暴れる。η を控えめに。",
  "最終ホール。逆に曲がった谷に強い風。これまでの打ち方を組み合わせる。",
];

/** ホールを始めた時の LAB NOTE（ホールの番号 1〜10） */
export function holeIntroNote(no: number): string {
  return INTRO_NOTES[Math.min(INTRO_NOTES.length, Math.max(1, no)) - 1];
}

export interface NoteInput {
  event: ShotEvent;
  lr: number;
  method: Method;
  /** 打つ前の損失 */
  before: number;
  /** 止まった所の損失 */
  after: number;
  /** 途中で損失が上がったステップがあった */
  rose: boolean;
  /** カップまでの距離に比べて、ほとんど進まなかった */
  slow: boolean;
  /** 打数の上限（fail の時に使う） */
  limit: number;
}

/** 打つたびに出す1行の LAB NOTE（実験ノート風） */
export function shotNote(n: NoteInput): string {
  const head = `η=${formatLr(n.lr)}・${methodLabel(n.method)}：`;
  const change = `損失 ${formatLoss(n.before)} → ${formatLoss(n.after)}。`;
  switch (n.event) {
    case "cup":
    case "finish":
      return `${head}${change}谷底に到達。カップイン。`;
    case "ob":
      return `${head}ステップが大きすぎて発散。盤の外へ（OB）。打った位置に戻す。`;
    case "fail":
      return `打数が上限 ${n.limit} に達した。条件を見直して、このホールを最初から。`;
    case "stop":
      if (n.slow) return `${head}${change}ほとんど進まない。学習率が小さすぎる。`;
      if (n.rose) return `${head}${change}谷を行き来して振動している。`;
      return `${head}${change}勾配に沿って下った。`;
  }
}

/** 1打で動いた距離が、打つ前のカップまでの距離の 10% 未満なら「ほとんど進まない」 */
export function barelyMoved(path: readonly Vec[], cup: Vec): boolean {
  if (path.length < 2) return true;
  const start = path[0];
  return dist(start, path[path.length - 1]) < 0.1 * dist(start, cup);
}

/** 損失の列の途中で、前より上がった所があるか */
export function lossRose(losses: readonly number[]): boolean {
  for (let i = 1; i < losses.length; i++) if (losses[i] > losses[i - 1]) return true;
  return false;
}
