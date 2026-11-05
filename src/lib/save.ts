import { HOLES } from "./golf/holes";
import type { GolfProgress } from "./golf/game";
import { LR_MAX, LR_MIN } from "./golf/shot";

/** localStorage のキー */
export const SAVE_KEY = "loss-lab:v1";

export interface SaveData {
  golf: {
    /** 途中の挑戦。無ければ null（次に開いた時に新しく始める） */
    progress: GolfProgress | null;
    /** 3ホールの合計打数の最高記録（少ないほど良い） */
    best: number | null;
  };
}

export function emptySave(): SaveData {
  return { golf: { progress: null, best: null } };
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

function parseProgress(v: unknown): GolfProgress | null {
  if (!isRec(v)) return null;
  const { hole, pos, strokes, cards, lr, method } = v;
  if (!isInt(hole, 0, HOLES.length)) return null;
  if (!isRec(pos) || !isNum(pos.x) || !isNum(pos.y)) return null;
  const h = HOLES[hole];
  if (!isInt(strokes, 0, h ? h.limit - 1 : 0)) return null;
  if (!Array.isArray(cards) || cards.length !== hole) return null;
  if (!cards.every((c, i) => isInt(c, 1, HOLES[i].limit))) return null;
  if (!isNum(lr) || lr < LR_MIN || lr > LR_MAX) return null;
  if (method !== "gd" && method !== "momentum") return null;
  return { hole, pos: { x: pos.x, y: pos.y }, strokes, cards: [...cards], lr, method };
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
  if (!isRec(data) || !isRec(data.golf)) return out;
  const { progress, best } = data.golf;
  out.golf.progress = parseProgress(progress);
  out.golf.best = isInt(best, HOLES.length, 1000) ? best : null;
  return out;
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
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
  return data.golf.best === null;
}
