import { describe, expect, it } from "vitest";
import { newRun } from "./golf/game";
import { HOLES } from "./golf/holes";
import { emptySave, golfBestText, hasNoRecord, loadSave, parseSave, SAVE_KEY, serializeSave, writeSave, type KeyValueStore } from "./save";
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
    const raw = JSON.stringify({ golf: { holes: 10, best: 40, progress: { ...newRun(), hole: 1, cards: [] } } });
    const s = parseSave(raw);
    expect(s.golf.progress).toBeNull();
    expect(s.golf.best).toBe(40);
  });
  it("学習率や手法が範囲の外なら捨てる", () => {
    const golf = (progress: object) => ({ best: null, firstBest: null, progress });
    expect(parseSave(serializeSave({ ...emptySave(), golf: { ...golf({}), progress: { ...newRun(), lr: 5 } } })).golf.progress).toBeNull();
    const bad = JSON.stringify({ golf: { holes: 10, ...golf({ ...newRun(), method: "adam" }) } });
    expect(parseSave(bad).golf.progress).toBeNull();
  });
  it("10ホールを終えた状態も読める", () => {
    const done = { ...newRun(), hole: 10, cards: [3, 4, 3, 3, 4, 4, 4, 3, 3, 4], strokes: 0 };
    const s = parseSave(serializeSave({ ...emptySave(), golf: { best: 35, firstBest: null, progress: done } }));
    expect(s.golf.progress).toEqual(done);
    expect(s.golf.best).toBe(35);
  });
  it("途中のホール（7ホール目）の続きも読める", () => {
    const mid = { ...newRun(0.1, "momentum"), hole: 6, cards: [3, 4, 3, 2, 3, 3], strokes: 2, pos: { x: 0.2, y: 0.1 } };
    expect(parseSave(serializeSave({ ...emptySave(), golf: { best: null, firstBest: 9, progress: mid } })).golf).toEqual({
      best: null,
      firstBest: 9,
      progress: mid,
    });
  });
  it("10ホールの最高記録は 10 打より少なくならない", () => {
    expect(parseSave(JSON.stringify({ golf: { holes: 10, best: 9, progress: null } })).golf.best).toBeNull();
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
    expect(hasNoRecord({ ...emptySave(), golf: { best: 30, firstBest: null, progress: null } })).toBe(false);
    expect(hasNoRecord({ ...emptySave(), golf: { best: null, firstBest: 9, progress: null } })).toBe(false);
  });
  it("メニューの最高記録", () => {
    expect(golfBestText(emptySave())).toBe("—");
    expect(golfBestText({ ...emptySave(), golf: { best: 30, firstBest: 9, progress: null } })).toBe("30 打");
    expect(golfBestText({ ...emptySave(), golf: { best: null, firstBest: 9, progress: null } })).toBe("9 打（3ホール）");
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
    expect(s.golf.firstBest).toBe(12);
    expect(s.golf.best).toBeNull();
    expect(s.defense).toEqual(emptySave().defense);
  });
  it("#1 の3ホールの保存：途中の挑戦はそのまま続きから、最高記録は3ホールの記録として残る", () => {
    const old = { hole: 1, pos: { x: 0.3, y: 0.1 }, strokes: 2, cards: [3], lr: 0.2, method: "momentum" };
    const s = parseSave(JSON.stringify({ golf: { best: 11, progress: old } }));
    expect(s.golf.progress).toEqual(old);
    expect(s.golf.firstBest).toBe(11);
    expect(s.golf.best).toBeNull();
    // 書き直しても3ホールの記録は消えない
    expect(parseSave(serializeSave(s)).golf).toEqual(s.golf);
  });
  it("#1 で3ホールを終えた状態は、4ホール目のスタートから続ける", () => {
    const old = { hole: 3, pos: { ...HOLES[2].cup }, strokes: 0, cards: [3, 4, 3], lr: 0.05, method: "gd" };
    const s = parseSave(JSON.stringify({ golf: { best: 10, progress: old } }));
    expect(s.golf.progress).toEqual({ ...old, pos: HOLES[3].start });
    expect(s.golf.firstBest).toBe(10);
  });
  it("#1 の保存で、4ホール目より先にいるのはおかしいので捨てる", () => {
    const bad = { hole: 4, pos: { x: 0, y: 0 }, strokes: 0, cards: [3, 4, 3, 3], lr: 0.05, method: "gd" };
    const s = parseSave(JSON.stringify({ golf: { best: 10, progress: bad } }));
    expect(s.golf.progress).toBeNull();
    expect(s.golf.firstBest).toBe(10);
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
    expect(parseRoute("#/golf/explain")).toBe("explain");
    expect(parseRoute("#/golf/explain/")).toBe("explain");
    expect(routeHash("explain")).toBe("#/golf/explain");
    expect(parseRoute("#/defense")).toBe("defense");
    expect(routeHash("defense")).toBe("#/defense");
    expect(parseRoute("#/rogue")).toBe("rogue");
    expect(routeHash("rogue")).toBe("#/rogue");
    expect(parseRoute("#/reward")).toBe("reward");
    expect(routeHash("reward")).toBe("#/reward");
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
