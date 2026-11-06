import { TEST, TRAIN } from "./data";
import { accuracy, percent, type Neuron } from "./model";
import { WAVES, type WaveRun } from "./wave";

/** 1回の挑戦（4波）の進み具合。これをそのまま保存する */
export interface DefenseProgress {
  /** 次に流す波の番号（0 始まり）。WAVES.length なら最終波まで守り切った */
  wave: number;
  /** 盤に置いたニューロン */
  neurons: Neuron[];
}

export function newDefense(): DefenseProgress {
  return { wave: 0, neurons: [] };
}

export function isDefenseFinished(p: DefenseProgress): boolean {
  return p.wave >= WAVES.length;
}

/**
 * 1波を終えた後に起きたこと
 * - clear：守り切った（次の波へ）
 * - finish：最終波（テスト）を守り切った（挑戦を終えた）
 * - fail：ライフが 0 になった。同じ波をやり直す（ニューロンはそのまま）
 */
export type WaveEvent = "clear" | "finish" | "fail";

export function applyWave(p: DefenseProgress, run: WaveRun): { progress: DefenseProgress; event: WaveEvent } {
  if (run.failed) return { progress: p, event: "fail" };
  const wave = p.wave + 1;
  return { progress: { ...p, wave }, event: wave >= WAVES.length ? "finish" : "clear" };
}

/** 練習データ全部（24点）での正解率（%） */
export function trainPercent(neurons: readonly Neuron[]): number {
  return percent(accuracy(neurons, TRAIN));
}

/** テストデータ全部（40点）での正解率（%） */
export function testPercent(neurons: readonly Neuron[]): number {
  return percent(accuracy(neurons, TEST));
}

/** 練習の正解率がテストより OVERFIT_GAP ポイント以上高ければ、過学習と見なす */
export const OVERFIT_GAP = 15;

export function isOverfit(trainPct: number, testPct: number): boolean {
  return trainPct - testPct >= OVERFIT_GAP;
}

/** 最高記録（最終波を守り切った時のテストの正解率。高いほど良い） */
export function betterDefenseBest(prev: number | null, pct: number): number {
  return prev === null ? pct : Math.max(prev, pct);
}
