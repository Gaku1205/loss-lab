import { describe, expect, it } from "vitest";
import { newRun } from "./golf/game";
import { emptySave, hasNoRecord, loadSave, parseSave, SAVE_KEY, serializeSave, writeSave, type KeyValueStore } from "./save";
import { parseRoute, routeHash } from "./route";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("保存データの読み書き", () => {
  it("書いた物をそのまま読める", () => {
    const s = memoryStore();
    const save = emptySave();
    save.golf.progress = { ...newRun(0.2, "momentum"), hole: 1, cards: [3], strokes: 2, pos: { x: 0.1, y: -0.2 } };
    save.golf.best = 11;
    expect(writeSave(s, save)).toBe(true);
    expect(s.data.has(SAVE_KEY)).toBe(true);
    expect(loadSave(s)).toEqual(save);
  });
  it("何も無い・壊れた文字列なら最初の状態", () => {
    expect(parseSave(null)).toEqual(emptySave());
    expect(parseSave("{oops")).toEqual(emptySave());
    expect(parseSave("[]")).toEqual(emptySave());
  });
  it("おかしな進み具合は捨て、最高記録は残す", () => {
    const raw = JSON.stringify({ golf: { best: 12, progress: { ...newRun(), hole: 1, cards: [] } } });
    const s = parseSave(raw);
    expect(s.golf.progress).toBeNull();
    expect(s.golf.best).toBe(12);
  });
  it("学習率や手法が範囲の外なら捨てる", () => {
    expect(parseSave(serializeSave({ golf: { best: null, progress: { ...newRun(), lr: 5 } } })).golf.progress).toBeNull();
    const bad = JSON.stringify({ golf: { best: null, progress: { ...newRun(), method: "adam" } } });
    expect(parseSave(bad).golf.progress).toBeNull();
  });
  it("3ホールを終えた状態も読める", () => {
    const done = { ...newRun(), hole: 3, cards: [3, 4, 3], strokes: 0 };
    expect(parseSave(serializeSave({ golf: { best: 10, progress: done } })).golf.progress).toEqual(done);
  });
  it("localStorage が使えなくても止まらない", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadSave(broken)).toEqual(emptySave());
    expect(writeSave(broken, emptySave())).toBe(false);
    expect(loadSave(null)).toEqual(emptySave());
  });
  it("記録ゼロの判定", () => {
    expect(hasNoRecord(emptySave())).toBe(true);
    expect(hasNoRecord({ golf: { best: 10, progress: null } })).toBe(false);
  });
});

describe("ページの切り替え", () => {
  it("ハッシュから画面", () => {
    expect(parseRoute("")).toBe("menu");
    expect(parseRoute("#/")).toBe("menu");
    expect(parseRoute("#/golf")).toBe("golf");
    expect(parseRoute("#/golf/")).toBe("golf");
    expect(parseRoute("#/nope")).toBe("menu");
    expect(routeHash("golf")).toBe("#/golf");
  });
});
