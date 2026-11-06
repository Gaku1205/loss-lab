import { FIRST_HOLES, HOLES } from "./golf/holes";
import type { GolfProgress } from "./golf/game";
import { LR_MAX, LR_MIN } from "./golf/shot";
import type { DefenseProgress } from "./defense/game";
import { inField, remaining, type Neuron } from "./defense/model";
import { WAVES } from "./defense/wave";
import { BOSSES } from "./rogue/boss";
import type { RogueBest } from "./rogue/game";
import type { BlockId } from "./reward/blocks";
import type { RewardProgress, TaskRecord } from "./reward/game";
import { TASK_MAX, taskScore } from "./reward/score";
import { MAX_BLOCKS, MAX_TRIALS, TASKS } from "./reward/tasks";

/** localStorage のキー */
export const SAVE_KEY = "loss-lab:v1";

export interface SaveData {
  golf: {
    /** 途中の挑戦。無ければ null（次に開いた時に新しく始める） */
    progress: GolfProgress | null;
    /** 10ホールの合計打数の最高記録（少ないほど良い） */
    best: number | null;
    /** 前の版（#1、3ホールで1回の挑戦）の合計打数の最高記録。読むだけで、更新しない */
    firstBest: number | null;
  };
  defense: {
    /** 途中の挑戦。無ければ null */
    progress: DefenseProgress | null;
    /** 最終波を守り切った時のテストの正解率（%）の最高記録（高いほど良い） */
    best: number | null;
  };
  /** Model Rogue の最高記録（到達階の最高と、全階を倒した回数）。途中の挑戦は保存しない */
  rogue: RogueBest;
  reward: {
    /** 途中の挑戦。無ければ null */
    progress: RewardProgress | null;
    /** 3問の合計得点の最高記録（高いほど良い） */
    best: number | null;
  };
}

export function emptySave(): SaveData {
  return {
    golf: { progress: null, best: null, firstBest: null },
    defense: { progress: null, best: null },
    rogue: { floor: null, loops: 0 },
    reward: { progress: null, best: null },
  };
}

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isInt(v: unknown, min: number, max: number): v is number {
  return isNum(v) && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * 勾配ゴルフの途中の挑戦を読む。holeCount は、その保存が作られた版のホール数（今は 10、前の版は 3）。
 * 前の版で3ホールを終えた状態は、4ホール目のスタートから続ける
 */
function parseProgress(v: unknown, holeCount: number): GolfProgress | null {
  if (!isRec(v)) return null;
  const { hole, pos, strokes, cards, lr, method } = v;
  if (!isInt(hole, 0, holeCount)) return null;
  if (!isRec(pos) || !isNum(pos.x) || !isNum(pos.y)) return null;
  const h = hole < holeCount ? HOLES[hole] : undefined;
  if (!isInt(strokes, 0, h ? h.limit - 1 : 0)) return null;
  if (!Array.isArray(cards) || cards.length !== hole) return null;
  if (!cards.every((c, i) => isInt(c, 1, HOLES[i].limit))) return null;
  if (!isNum(lr) || lr < LR_MIN || lr > LR_MAX) return null;
  if (method !== "gd" && method !== "momentum") return null;
  const next = holeCount < HOLES.length && hole === holeCount ? HOLES[hole] : undefined;
  const at = next ? { ...next.start } : { x: pos.x, y: pos.y };
  return { hole, pos: at, strokes, cards: [...cards], lr, method };
}

/** 保存された文字列を読む。壊れていたら、読めた所だけ使い、残りは最初の状態にする */
export function parseSave(raw: string | null): SaveData {
  const out = emptySave();
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!isRec(data)) return out;
  if (isRec(data.golf)) {
    const { progress, best, firstBest, holes } = data.golf;
    if (holes === HOLES.length) {
      out.golf.progress = parseProgress(progress, HOLES.length);
      out.golf.best = isInt(best, HOLES.length, 1000) ? best : null;
      out.golf.firstBest = isInt(firstBest, FIRST_HOLES, 1000) ? firstBest : null;
    } else {
      // 前の版（3ホール）：最高記録は3ホールの記録として残し、途中の挑戦は続きから遊べるようにする
      out.golf.progress = parseProgress(progress, FIRST_HOLES);
      out.golf.firstBest = isInt(best, FIRST_HOLES, 1000) ? best : null;
    }
  }
  if (isRec(data.defense)) {
    const { progress, best } = data.defense;
    out.defense.progress = parseDefense(progress);
    out.defense.best = isInt(best, 0, 100) ? best : null;
  }
  if (isRec(data.rogue)) {
    const { floor, loops } = data.rogue;
    out.rogue.floor = isInt(floor, 1, BOSSES.length) ? floor : null;
    out.rogue.loops = isInt(loops, 0, 100000) ? loops : 0;
  }
  if (isRec(data.reward)) {
    const { progress, best } = data.reward;
    out.reward.progress = parseReward(progress);
    out.reward.best = isInt(best, 0, TASK_MAX * TASKS.length) ? best : null;
  }
  return out;
}

function parseRecord(v: unknown): TaskRecord | null {
  if (!isRec(v)) return null;
  const { blocks, trials, score } = v;
  if (!isInt(blocks, 1, MAX_BLOCKS) || !isInt(trials, 1, MAX_TRIALS)) return null;
  if (score !== taskScore(blocks, trials)) return null;
  return { blocks, trials, score };
}

function parseReward(v: unknown): RewardProgress | null {
  if (!isRec(v)) return null;
  const { task, blocks, trials, records } = v;
  if (!isInt(task, 0, TASKS.length - 1) || !Array.isArray(blocks) || !Array.isArray(records)) return null;
  if (!isInt(trials, 0, MAX_TRIALS)) return null;
  const palette: readonly string[] = TASKS[task].palette;
  if (blocks.length > MAX_BLOCKS || new Set(blocks).size !== blocks.length) return null;
  if (!blocks.every((b): b is BlockId => typeof b === "string" && palette.includes(b))) return null;
  // クリアした課題の記録は、今の課題の前まで（今の課題をクリアして次を待っている時は今の課題まで）
  if (records.length !== task && records.length !== task + 1) return null;
  const list: TaskRecord[] = [];
  for (const r of records) {
    const p = parseRecord(r);
    if (!p) return null;
    list.push(p);
  }
  if (list.length === task + 1 && list[task].trials !== trials) return null;
  return { task, blocks: [...blocks], trials, records: list };
}

function parseNeuron(v: unknown): Neuron | null {
  if (!isRec(v)) return null;
  const { x, y, kind, cls } = v;
  if (!isNum(x) || !isNum(y) || !inField({ x, y })) return null;
  if (kind !== "wide" && kind !== "narrow") return null;
  if (cls !== "a" && cls !== "b") return null;
  return { x, y, kind, cls };
}

function parseDefense(v: unknown): DefenseProgress | null {
  if (!isRec(v)) return null;
  const { wave, neurons } = v;
  if (!isInt(wave, 0, WAVES.length) || !Array.isArray(neurons)) return null;
  const list: Neuron[] = [];
  for (const n of neurons) {
    const p = parseNeuron(n);
    if (!p) return null;
    list.push(p);
  }
  if (remaining(list, "wide") < 0 || remaining(list, "narrow") < 0) return null;
  return { wave, neurons: list };
}

/** 書く形。勾配ゴルフには、何ホールの版で書いたか（holes）を付ける。前の版の保存と見分けるため */
export function serializeSave(data: SaveData): string {
  return JSON.stringify({ ...data, golf: { ...data.golf, holes: HOLES.length } });
}

/** 読み書きに使う所（テストでは偽物を渡す） */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 読む。localStorage が使えない時は最初の状態 */
export function loadSave(store: KeyValueStore | null): SaveData {
  if (!store) return emptySave();
  try {
    return parseSave(store.getItem(SAVE_KEY));
  } catch {
    return emptySave();
  }
}

/** 書く。書けなかったら false（遊ぶのは続けられる） */
export function writeSave(store: KeyValueStore | null, data: SaveData): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, serializeSave(data));
    return true;
  } catch {
    return false;
  }
}

/** 記録が1つも無いか（メニューの「最初はここから」の印を出すか） */
export function hasNoRecord(data: SaveData): boolean {
  return data.golf.best === null && data.golf.firstBest === null;
}

/** メニューに出す勾配ゴルフの最高記録。10ホールの記録が無く、前の版の3ホールの記録だけある時はそれを出す */
export function golfBestText(data: SaveData): string {
  if (data.golf.best !== null) return `${data.golf.best} 打`;
  if (data.golf.firstBest !== null) return `${data.golf.firstBest} 打（3ホール）`;
  return "—";
}
