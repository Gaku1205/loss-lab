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
    expect(parseSave(serializeSave({ ...emptySave(), golf: { best: null, progress: { ...newRun(), lr: 5 } } })).golf.progress).toBeNull();
    const bad = JSON.stringify({ golf: { best: null, progress: { ...newRun(), method: "adam" } } });
    expect(parseSave(bad).golf.progress).toBeNull();
  });
  it("3ホールを終えた状態も読める", () => {
    const done = { ...newRun(), hole: 3, cards: [3, 4, 3], strokes: 0 };
    expect(parseSave(serializeSave({ ...emptySave(), golf: { best: 10, progress: done } })).golf.progress).toEqual(done);
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
    expect(hasNoRecord({ ...emptySave(), golf: { best: 10, progress: null } })).toBe(false);
  });
  it("境界防衛線の進み具合と最高記録を読み書きできる", () => {
    const save = emptySave();
    save.defense.progress = { wave: 2, neurons: [{ x: 0.1, y: -0.2, kind: "wide", cls: "a" }] };
    save.defense.best = 92;
    expect(parseSave(serializeSave(save))).toEqual(save);
  });
  it("前の版（golf だけ）の保存も読める", () => {
    const raw = JSON.stringify({ golf: { best: 12, progress: null } });
    const s = parseSave(raw);
    expect(s.golf.best).toBe(12);
    expect(s.defense).toEqual(emptySave().defense);
  });
  it("おかしなニューロン・波の番号は捨て、最高記録は残す", () => {
    const tooMany = Array.from({ length: 7 }, () => ({ x: 0, y: 0, kind: "wide", cls: "a" }));
    for (const progress of [
      { wave: 9, neurons: [] },
      { wave: 0, neurons: [{ x: 5, y: 0, kind: "wide", cls: "a" }] },
      { wave: 0, neurons: [{ x: 0, y: 0, kind: "huge", cls: "a" }] },
      { wave: 0, neurons: [{ x: 0, y: 0, kind: "wide", cls: "c" }] },
      { wave: 0, neurons: tooMany },
    ]) {
      const s = parseSave(JSON.stringify({ defense: { best: 80, progress } }));
      expect(s.defense.progress).toBeNull();
      expect(s.defense.best).toBe(80);
    }
    expect(parseSave(JSON.stringify({ defense: { best: 101, progress: null } })).defense.best).toBeNull();
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
    expect(parseRoute("#/defense")).toBe("defense");
    expect(routeHash("defense")).toBe("#/defense");
    expect(parseRoute("#/rogue")).toBe("rogue");
    expect(routeHash("rogue")).toBe("#/rogue");
    expect(routeHash("menu")).toBe("#/");
  });
});

describe("Model Rogue の記録", () => {
  it("到達階と周回を読み書きできる", () => {
    const save = emptySave();
    save.rogue = { floor: 3, loops: 2 };
    expect(parseSave(serializeSave(save))).toEqual(save);
  });
  it("前の版（rogue が無い）も読める", () => {
    const s = parseSave(JSON.stringify({ golf: { best: 12, progress: null } }));
    expect(s.rogue).toEqual({ floor: null, loops: 0 });
  });
  it("おかしな値は捨てる", () => {
    expect(parseSave(JSON.stringify({ rogue: { floor: 9, loops: -1 } })).rogue).toEqual({ floor: null, loops: 0 });
    expect(parseSave(JSON.stringify({ rogue: { floor: 2.5, loops: "3" } })).rogue).toEqual({ floor: null, loops: 0 });
    expect(parseSave(JSON.stringify({ rogue: { floor: 4, loops: 1 } })).rogue).toEqual({ floor: 4, loops: 1 });
  });
});
