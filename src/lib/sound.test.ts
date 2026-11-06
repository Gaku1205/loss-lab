import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./save";
import { loadSoundOn, parseSoundOn, serializeSoundOn, SOUND_KEY, writeSoundOn } from "./sound";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("効果音のオン／オフの保存", () => {
  it("何も保存していなければ消音", () => {
    expect(loadSoundOn(memoryStore())).toBe(false);
    expect(parseSoundOn(null)).toBe(false);
  });
  it("書いた物をそのまま読める", () => {
    const s = memoryStore();
    expect(writeSoundOn(s, true)).toBe(true);
    expect(s.data.get(SOUND_KEY)).toBe('{"on":true}');
    expect(loadSoundOn(s)).toBe(true);
    writeSoundOn(s, false);
    expect(loadSoundOn(s)).toBe(false);
  });
  it("壊れた・形の合わない中身は消音", () => {
    expect(parseSoundOn("{oops")).toBe(false);
    expect(parseSoundOn("[]")).toBe(false);
    expect(parseSoundOn("null")).toBe(false);
    expect(parseSoundOn("true")).toBe(false);
    expect(parseSoundOn('{"on":"yes"}')).toBe(false);
    expect(parseSoundOn('{"on":1}')).toBe(false);
    expect(parseSoundOn(serializeSoundOn(true))).toBe(true);
  });
  it("保存が使えなくても落ちない", () => {
    expect(loadSoundOn(null)).toBe(false);
    expect(writeSoundOn(null, true)).toBe(false);
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadSoundOn(broken)).toBe(false);
    expect(writeSoundOn(broken, true)).toBe(false);
  });
});
