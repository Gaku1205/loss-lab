import type { KeyValueStore } from "./save";

/** 遊び方の板の既読を入れる localStorage のキー（ゲームの保存とは分ける） */
export const HOWTO_KEY = "loss-lab:howto:v1";

export type HowtoSeen = Record<string, true>;

/** 保存の文字列から、既読のゲームの表を読む。無い・壊れている・形が合わない時は空（すべて未読） */
export function parseHowtoSeen(raw: string | null): HowtoSeen {
  if (raw === null) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
    const out: HowtoSeen = {};
    for (const [k, val] of Object.entries(v)) if (val === true) out[k] = true;
    return out;
  } catch {
    return {};
  }
}

export function serializeHowtoSeen(seen: HowtoSeen): string {
  return JSON.stringify(seen);
}

function readAll(store: KeyValueStore | null): HowtoSeen {
  if (!store) return {};
  try {
    return parseHowtoSeen(store.getItem(HOWTO_KEY));
  } catch {
    return {};
  }
}

/** そのゲームの遊び方を既読か。保存が使えなくても未読で返す */
export function loadHowtoSeen(store: KeyValueStore | null, game: string): boolean {
  return readAll(store)[game] === true;
}

/** そのゲームを既読にする（ほかのゲームの印は残す）。書けなければ false（エラーは出さない） */
export function writeHowtoSeen(store: KeyValueStore | null, game: string): boolean {
  if (!store) return false;
  try {
    store.setItem(HOWTO_KEY, serializeHowtoSeen({ ...readAll(store), [game]: true }));
    return true;
  } catch {
    return false;
  }
}
