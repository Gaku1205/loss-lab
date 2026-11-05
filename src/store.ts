import { loadSave, writeSave, type KeyValueStore, type SaveData } from "./lib/save";

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

export function saveData(data: SaveData): void {
  writeSave(storage(), data);
}
