import { describe, expect, it } from "vitest";
import { FIELD, rng, samplePoints, TEST, TRAIN, truthClass, truthCurve, type DataPoint } from "./data";
import { applyWave, betterDefenseBest, isDefenseFinished, isOverfit, newDefense, testPercent, trainPercent } from "./game";
import { accuracy, classify, COVER_MIN, judge, kernel, KINDS, pick, place, remaining, removeAt, score, type Neuron } from "./model";
import { waveIntroNote, waveNote } from "./note";
import { arriveMs, LIFE, lifeAfter, pointAt, runWave, spawnMs, WAVES, wavePoints } from "./wave";

/** 真の境目に沿って、上に ●・下に ○ の WIDE を3つずつ（汎化する配置） */
function goodLayout(): Neuron[] {
  const out: Neuron[] = [];
  for (const x of [-1.1, 0, 1.1]) {
    out.push({ x, y: truthCurve(x) + 0.45, kind: "wide", cls: "b" });
    out.push({ x, y: truthCurve(x) - 0.45, kind: "wide", cls: "a" });
  }
  return out;
}

/** 良い配置に、練習データのノイズ3点を NARROW で拾いにいった配置（過学習） */
function overfitLayout(): Neuron[] {
  const noise = TRAIN.filter((p) => p.noise);
  return [...goodLayout(), ...noise.map((p): Neuron => ({ x: p.x, y: p.y, kind: "narrow", cls: p.cls }))];
}

describe("データ点", () => {
  it("同じ種なら同じ点、違う種なら違う点", () => {
    expect(samplePoints(3, 5)).toEqual(samplePoints(3, 5));
    expect(samplePoints(3, 5)).not.toEqual(samplePoints(4, 5));
    const r = rng(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("練習24点（ノイズ3）・テスト40点（ノイズ2）", () => {
    expect(TRAIN).toHaveLength(24);
    expect(TEST).toHaveLength(40);
    expect(TRAIN.filter((p) => p.noise)).toHaveLength(3);
    expect(TEST.filter((p) => p.noise)).toHaveLength(2);
    // 第1波（前の8点）にノイズは無い
    expect(TRAIN.slice(0, 8).some((p) => p.noise)).toBe(false);
    expect(TRAIN.slice(0, 16).filter((p) => p.noise)).toHaveLength(1);
  });
  it("ノイズでない点は真の境目どおりのクラス、ノイズは逆", () => {
    for (const p of [...TRAIN, ...TEST]) {
      expect(p.x).toBeGreaterThan(FIELD.xMin);
      expect(p.x).toBeLessThan(FIELD.xMax);
      expect(Math.abs(p.y)).toBeLessThan(1);
      expect(p.cls === truthClass(p)).toBe(!p.noise);
    }
  });
  it("練習とテストに同じ点は無い", () => {
    const key = (p: DataPoint) => `${p.x},${p.y}`;
    const train = new Set(TRAIN.map(key));
    expect(TEST.some((p) => train.has(key(p)))).toBe(false);
  });
});

describe("ニューロンから境界を作る", () => {
  const b: Neuron = { x: 0, y: 0.5, kind: "wide", cls: "b" };
  const a: Neuron = { x: 0, y: -0.5, kind: "wide", cls: "a" };
  it("効く強さは中心で amp、離れると小さくなる", () => {
    expect(kernel(b, b)).toBeCloseTo(KINDS.wide.amp);
    expect(kernel(b, { x: 0, y: 0.5 + KINDS.wide.sigma })).toBeCloseTo(KINDS.wide.amp * Math.exp(-0.5));
    const n: Neuron = { x: 0, y: 0, kind: "narrow", cls: "a" };
    expect(kernel(n, n)).toBeCloseTo(KINDS.narrow.amp);
  });
  it("● は＋、○ は − で足す。間が境界線（値 0）", () => {
    expect(score([b, a], { x: 0, y: 0.3 })).toBeGreaterThan(0);
    expect(score([b, a], { x: 0, y: -0.3 })).toBeLessThan(0);
    expect(score([b, a], { x: 0.4, y: 0 })).toBeCloseTo(0);
  });
  it("陣地の判定。遠くはすき間（null）", () => {
    expect(classify([b, a], { x: 0, y: 0.4 })).toBe("b");
    expect(classify([b, a], { x: 0, y: -0.4 })).toBe("a");
    expect(classify([b, a], { x: 1.5, y: 0.9 })).toBeNull();
    expect(classify([], { x: 0, y: 0 })).toBeNull();
    expect(COVER_MIN).toBeGreaterThan(0);
  });
  it("ニューロンを置くと境界線が動く", () => {
    const p = { x: 0, y: 0.2 };
    expect(classify([b, a], p)).toBe("b");
    const more = place([b, a], { x: 0, y: 0.1, kind: "narrow", cls: "a" });
    expect(more).not.toBeNull();
    expect(classify(more ?? [], p)).toBe("a");
  });
  it("点の判定：正解・誤り・すり抜け", () => {
    const L = [b, a];
    expect(judge(L, { x: 0, y: 0.4, cls: "b", noise: false })).toBe("hit");
    expect(judge(L, { x: 0, y: 0.4, cls: "a", noise: false })).toBe("miss");
    expect(judge(L, { x: 1.5, y: 0.9, cls: "b", noise: false })).toBe("leak");
  });
});

describe("置く・外す", () => {
  it("種類ごとの数まで置ける。盤の外には置けない", () => {
    let L: Neuron[] = [];
    for (let i = 0; i < KINDS.wide.stock; i++) {
      const next = place(L, { x: -1 + i * 0.3, y: 0, kind: "wide", cls: "a" });
      expect(next).not.toBeNull();
      L = next ?? L;
    }
    expect(remaining(L, "wide")).toBe(0);
    expect(place(L, { x: 0, y: 0.5, kind: "wide", cls: "b" })).toBeNull();
    expect(remaining(L, "narrow")).toBe(KINDS.narrow.stock);
    expect(place(L, { x: 0, y: 0.5, kind: "narrow", cls: "b" })).not.toBeNull();
    expect(place([], { x: 2, y: 0, kind: "wide", cls: "a" })).toBeNull();
  });
  it("押した所のいちばん近いニューロンを外す", () => {
    const L: Neuron[] = [
      { x: 0, y: 0, kind: "wide", cls: "a" },
      { x: 0.1, y: 0, kind: "narrow", cls: "b" },
    ];
    expect(pick(L, { x: 0.08, y: 0 }, 0.05)).toBe(1);
    expect(pick(L, { x: -0.02, y: 0 }, 0.05)).toBe(0);
    expect(pick(L, { x: 1, y: 1 }, 0.05)).toBe(-1);
    expect(removeAt(L, 0)).toEqual([L[1]]);
  });
});

describe("ウェーブの点の出し方", () => {
  it("練習3波（8・16・24点）→ 最終波はテスト40点", () => {
    expect(WAVES.map((w) => w.data)).toEqual(["train", "train", "train", "test"]);
    expect(wavePoints(0)).toEqual(TRAIN.slice(0, 8));
    expect(wavePoints(2)).toEqual(TRAIN);
    expect(wavePoints(3)).toEqual(TEST);
    expect(wavePoints(9)).toEqual([]);
  });
  it("点は左の端から右へ流れ、自分の位置で止まる", () => {
    const pt = { x: 0.2, y: 0.3 };
    expect(pointAt(2, pt, spawnMs(2) - 1)).toBeNull();
    expect(pointAt(2, pt, spawnMs(2))).toEqual({ x: FIELD.xMin, y: 0.3 });
    const mid = pointAt(2, pt, (spawnMs(2) + arriveMs(2, pt)) / 2);
    expect(mid?.x).toBeCloseTo((FIELD.xMin + 0.2) / 2);
    expect(pointAt(2, pt, arriveMs(2, pt) + 500)).toEqual(pt);
  });
});

describe("ライフの減り方", () => {
  it("誤り・すり抜けで1減る。0 より下にはならない", () => {
    expect(lifeAfter(3, "hit")).toBe(3);
    expect(lifeAfter(3, "miss")).toBe(2);
    expect(lifeAfter(3, "leak")).toBe(2);
    expect(lifeAfter(0, "miss")).toBe(0);
  });
  it("何も置かないと全部すり抜け、ライフ0で止まる", () => {
    const run = runWave([], wavePoints(0));
    expect(run.failed).toBe(true);
    expect(run.arrivals).toHaveLength(LIFE);
    expect(run.arrivals[run.arrivals.length - 1].life).toBe(0);
  });
  it("着いた順に並ぶ", () => {
    const run = runWave(goodLayout(), wavePoints(3));
    for (let i = 1; i < run.arrivals.length; i++) expect(run.arrivals[i].t).toBeGreaterThanOrEqual(run.arrivals[i - 1].t);
    expect(run.endMs).toBe(run.arrivals[run.arrivals.length - 1].t);
  });
});

describe("過学習の判定", () => {
  it("良い配置は練習でノイズを落としても、4波とも守り切る", () => {
    const L = goodLayout();
    for (let w = 0; w < WAVES.length; w++) expect(runWave(L, wavePoints(w)).failed).toBe(false);
    expect(trainPercent(L)).toBe(87);
    expect(testPercent(L)).toBe(95);
    expect(isOverfit(trainPercent(L), testPercent(L))).toBe(false);
  });
  it("ノイズまで拾った配置は、練習は 100% でも最終波で崩れる", () => {
    const L = overfitLayout();
    expect(accuracy(L, TRAIN)).toBe(1);
    for (let w = 0; w < 3; w++) expect(runWave(L, wavePoints(w)).misses).toBe(0);
    expect(runWave(L, wavePoints(3)).failed).toBe(true);
    expect(testPercent(L)).toBeLessThan(80);
    expect(isOverfit(trainPercent(L), testPercent(L))).toBe(true);
  });
});

describe("進み方", () => {
  it("守り切ると次の波、最終波で終わり、失敗は同じ波のまま", () => {
    const L = goodLayout();
    let p = { ...newDefense(), neurons: L };
    for (let w = 0; w < WAVES.length; w++) {
      const r = applyWave(p, runWave(L, wavePoints(w)));
      expect(r.event).toBe(w === WAVES.length - 1 ? "finish" : "clear");
      p = r.progress;
    }
    expect(isDefenseFinished(p)).toBe(true);
    const start = newDefense();
    const fail = applyWave(start, runWave([], wavePoints(0)));
    expect(fail.event).toBe("fail");
    expect(fail.progress).toEqual(start);
  });
  it("最高記録は高い方", () => {
    expect(betterDefenseBest(null, 80)).toBe(80);
    expect(betterDefenseBest(90, 80)).toBe(90);
    expect(betterDefenseBest(80, 95)).toBe(95);
  });
});

describe("LAB NOTE", () => {
  it("波ごとの始めの1行", () => {
    for (let w = 0; w < WAVES.length; w++) expect(waveIntroNote(w).length).toBeGreaterThan(0);
    expect(waveIntroNote(3)).toContain("テストデータ");
  });
  it("最終波の失敗は、過学習かどうかで言い分ける", () => {
    const over = waveNote({ event: "fail", wave: 3, misses: 5, trainPct: 100, testPct: 70 });
    expect(over.warn).toBe(true);
    expect(over.text).toContain("過学習");
    expect(waveNote({ event: "fail", wave: 3, misses: 5, trainPct: 60, testPct: 55 }).text).not.toContain("過学習");
    expect(waveNote({ event: "fail", wave: 1, misses: 5, trainPct: 50, testPct: 50 }).text).toContain("第2波");
    const ok = waveNote({ event: "finish", wave: 3, misses: 2, trainPct: 87, testPct: 95 });
    expect(ok.warn).toBe(false);
    expect(ok.text).toBe("練習 87% ／ テスト 95%。初見のデータでも境界線が保った（汎化）。");
    expect(waveNote({ event: "clear", wave: 0, misses: 1, trainPct: 0, testPct: 0 }).text).toBe("第1波を守り切った。誤り 1 点。");
  });
});
