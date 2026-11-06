import { describe, expect, it } from "vitest";
import { HOWTO_KEY, loadHowtoSeen, parseHowtoSeen, writeHowtoSeen } from "./howto-seen";
import type { KeyValueStore } from "./save";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("遊び方の既読の保存", () => {
  it("何も保存していなければ未読", () => {
    expect(loadHowtoSeen(memoryStore(), "golf")).toBe(false);
    expect(parseHowtoSeen(null)).toEqual({});
  });
  it("書いた物を読める。別キーに {\"golf\":true} の形で入り、ゲームの保存は触らない", () => {
    const s = memoryStore();
    s.data.set("loss-lab:v1", "{}");
    expect(writeHowtoSeen(s, "golf")).toBe(true);
    expect(s.data.get(HOWTO_KEY)).toBe('{"golf":true}');
    expect(s.data.get("loss-lab:v1")).toBe("{}");
    expect(loadHowtoSeen(s, "golf")).toBe(true);
    expect(loadHowtoSeen(s, "defense")).toBe(false);
  });
  it("ほかのゲームの既読を消さない", () => {
    const s = memoryStore();
    writeHowtoSeen(s, "defense");
    writeHowtoSeen(s, "golf");
    expect(loadHowtoSeen(s, "defense")).toBe(true);
    expect(loadHowtoSeen(s, "golf")).toBe(true);
  });
  it("壊れた・形の合わない中身は未読", () => {
    expect(parseHowtoSeen("{oops")).toEqual({});
    expect(parseHowtoSeen("[]")).toEqual({});
    expect(parseHowtoSeen("null")).toEqual({});
    expect(parseHowtoSeen("true")).toEqual({});
    expect(parseHowtoSeen('{"golf":"yes"}')).toEqual({});
    expect(parseHowtoSeen('{"golf":1,"defense":true}')).toEqual({ defense: true });
  });
  it("壊れた中身の上にも書ける", () => {
    const s = memoryStore();
    s.data.set(HOWTO_KEY, "{oops");
    expect(loadHowtoSeen(s, "golf")).toBe(false);
    expect(writeHowtoSeen(s, "golf")).toBe(true);
    expect(loadHowtoSeen(s, "golf")).toBe(true);
  });
  it("保存が使えなくても落ちない（未読として扱う）", () => {
    expect(loadHowtoSeen(null, "golf")).toBe(false);
    expect(writeHowtoSeen(null, "golf")).toBe(false);
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadHowtoSeen(broken, "golf")).toBe(false);
    expect(writeHowtoSeen(broken, "golf")).toBe(false);
  });
});
