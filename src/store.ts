import { loadSave, writeSave, type KeyValueStore, type SaveData } from "./lib/save";
import { loadHowtoSeen, writeHowtoSeen } from "./lib/howto-seen";
import { loadSoundOn, writeSoundOn } from "./lib/sound";

/** localStorage を、使えない時は null で返す */
function storage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSave(): SaveData {
  return loadSave(storage());
}

export function readSoundOn(): boolean {
  return loadSoundOn(storage());
}

export function saveSoundOn(on: boolean): void {
  writeSoundOn(storage(), on);
}

export function readHowtoSeen(game: string): boolean {
  return loadHowtoSeen(storage(), game);
}

export function saveHowtoSeen(game: string): void {
  writeHowtoSeen(storage(), game);
}

export function saveData(data: SaveData): void {
  writeSave(storage(), data);
}
