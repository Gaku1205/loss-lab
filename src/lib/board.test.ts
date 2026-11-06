import { describe, expect, it } from "vitest";
import { fetchTop, listUrl, normalizeText, parseRows, readConfig, submitScore, topGolf, validateCode, validateNickname, type BoardEntry, type FetchFn } from "./board";
import { emptySave, parseSave, serializeSave } from "./save";

const cfg = { url: "https://example.supabase.co", key: "anon-key" };
const e = (nickname: string, score: number, createdAt: string): BoardEntry => ({ nickname, score, createdAt });

describe("合言葉・ニックネームの検証と整形", () => {
  it("前後の空白を除き、途中の空白は1つにする", () => {
    expect(normalizeText("  a \n  b\t c ")).toBe("a b c");
    expect(validateCode("  みんな  の　部屋 ")).toBe("みんな の 部屋");
  });
  it("合言葉は1〜32文字", () => {
    expect(validateCode("")).toBeNull();
    expect(validateCode("   ")).toBeNull();
    expect(validateCode("a".repeat(32))).toBe("a".repeat(32));
    expect(validateCode("a".repeat(33))).toBeNull();
  });
  it("ニックネームは1〜16文字（絵文字などは1文字と数える）", () => {
    expect(validateNickname("")).toBeNull();
    expect(validateNickname("あ".repeat(16))).not.toBeNull();
    expect(validateNickname("あ".repeat(17))).toBeNull();
    expect(validateNickname("😀".repeat(16))).not.toBeNull();
  });
});

describe("上位3人の並べ替え", () => {
  it("打数が少ない順、同じ打数は先に送った方が上", () => {
    const list = [e("c", 40, "2026-01-03T00:00:00Z"), e("a", 38, "2026-01-05T00:00:00Z"), e("b", 38, "2026-01-02T00:00:00Z"), e("d", 50, "2026-01-01T00:00:00Z")];
    expect(topGolf(list).map((x) => x.nickname)).toEqual(["b", "a", "c"]);
  });
  it("元の配列は変えない・3件に満たなければそのまま", () => {
    const list = [e("x", 9, "2026-01-02T00:00:00Z"), e("y", 8, "2026-01-01T00:00:00Z")];
    expect(topGolf(list).map((x) => x.nickname)).toEqual(["y", "x"]);
    expect(list[0].nickname).toBe("x");
    expect(topGolf([])).toEqual([]);
  });
});

describe("Supabase の応答の読み取り", () => {
  it("正しい行だけ読み、不正な行・不正な応答は無視する", () => {
    const rows = [
      { nickname: "taro", score: 35, created_at: "2026-01-01T00:00:00Z" },
      { nickname: "", score: 35, created_at: "2026-01-01T00:00:00Z" },
      { nickname: "a".repeat(17), score: 35, created_at: "2026-01-01T00:00:00Z" },
      { nickname: "x", score: "35", created_at: "2026-01-01T00:00:00Z" },
      { nickname: "x", score: 3.5, created_at: "2026-01-01T00:00:00Z" },
      { nickname: "x", score: 35, created_at: "いつか" },
      null,
      7,
    ];
    expect(parseRows(rows)).toEqual([e("taro", 35, "2026-01-01T00:00:00Z")]);
    expect(parseRows({ message: "error" })).toEqual([]);
    expect(parseRows(null)).toEqual([]);
  });
});

describe("設定と通信", () => {
  it("環境変数が無い・おかしい時は null", () => {
    expect(readConfig({})).toBeNull();
    expect(readConfig({ VITE_SUPABASE_URL: "https://a.supabase.co" })).toBeNull();
    expect(readConfig({ VITE_SUPABASE_URL: "abc", VITE_SUPABASE_ANON_KEY: "k" })).toBeNull();
    expect(readConfig({ VITE_SUPABASE_URL: " https://a.supabase.co/ ", VITE_SUPABASE_ANON_KEY: " k " })).toEqual({ url: "https://a.supabase.co", key: "k" });
  });
  it("一覧の URL は合言葉を符号化し、打数の少ない順で3件", () => {
    const u = listUrl(cfg, "a&b=c 部屋");
    expect(u).toContain("board_code=eq.a%26b%3Dc%20%E9%83%A8%E5%B1%8B");
    expect(u).toContain("game=eq.golf");
    expect(u).toContain("order=score.asc,created_at.asc");
    expect(u).toContain("limit=3");
  });
  it("取得：応答を並べて返す。失敗・例外は null", async () => {
    const ok: FetchFn = async () =>
      new Response(JSON.stringify([{ nickname: "b", score: 40, created_at: "2026-01-02T00:00:00Z" }, { nickname: "a", score: 39, created_at: "2026-01-03T00:00:00Z" }]));
    expect((await fetchTop(cfg, "room", ok))?.map((x) => x.nickname)).toEqual(["a", "b"]);
    expect(await fetchTop(cfg, "room", async () => new Response("{}", { status: 500 }))).toBeNull();
    expect(
      await fetchTop(cfg, "room", async () => {
        throw new Error("offline");
      }),
    ).toBeNull();
    expect(await fetchTop(cfg, "room", async () => new Response("<html>"))).toBeNull();
  });
  it("送信：キーとゲーム名を付けて POST する。失敗は false", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const ok: FetchFn = async (url, init) => {
      seen = { url, init };
      return new Response(null, { status: 201 });
    };
    expect(await submitScore(cfg, { code: "room", nickname: "taro", score: 36 }, ok)).toBe(true);
    expect(seen!.url).toBe("https://example.supabase.co/rest/v1/scores");
    expect(seen!.init?.method).toBe("POST");
    expect(JSON.parse(String(seen!.init?.body))).toEqual({ board_code: "room", game: "golf", nickname: "taro", score: 36 });
    expect(await submitScore(cfg, { code: "room", nickname: "t", score: 1 }, async () => new Response(null, { status: 401 }))).toBe(false);
    expect(
      await submitScore(cfg, { code: "room", nickname: "t", score: 1 }, async () => {
        throw new Error("offline");
      }),
    ).toBe(false);
  });
});

describe("保存データの順位表の部分", () => {
  it("書いた物を読める。古い保存（board が無い）でも壊れない", () => {
    const s = emptySave();
    s.board = { code: "room", nickname: "taro" };
    expect(parseSave(serializeSave(s)).board).toEqual({ code: "room", nickname: "taro" });
    expect(parseSave(JSON.stringify({ golf: { holes: 10, best: 40 } })).board).toEqual({ code: null, nickname: null });
  });
  it("形が合わない・長すぎる物は捨てる", () => {
    const raw = JSON.stringify({ board: { code: 5, nickname: "a".repeat(40) } });
    expect(parseSave(raw).board).toEqual({ code: null, nickname: null });
  });
});
