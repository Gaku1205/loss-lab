import type { KeyValueStore } from "./save";

/** 効果音のオン／オフを入れる localStorage のキー（ゲームの保存とは分ける） */
export const SOUND_KEY = "loss-lab:sound:v1";

/** 保存の文字列から、効果音がオンかを読む。無い・壊れている・形が合わない時は消音 */
export function parseSoundOn(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return false;
    return (v as { on?: unknown }).on === true;
  } catch {
    return false;
  }
}

export function serializeSoundOn(on: boolean): string {
  return JSON.stringify({ on });
}

/** 保存されたオン／オフを読む。保存が使えなくても消音で返す */
export function loadSoundOn(store: KeyValueStore | null): boolean {
  if (!store) return false;
  try {
    return parseSoundOn(store.getItem(SOUND_KEY));
  } catch {
    return false;
  }
}

/** オン／オフを保存する。書けなければ false（エラーは出さない） */
export function writeSoundOn(store: KeyValueStore | null, on: boolean): boolean {
  if (!store) return false;
  try {
    store.setItem(SOUND_KEY, serializeSoundOn(on));
    return true;
  } catch {
    return false;
  }
}
