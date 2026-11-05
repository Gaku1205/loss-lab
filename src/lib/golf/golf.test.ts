import { describe, expect, it } from "vitest";
import { contourLevels, contourSegments } from "./contour";
import { applyShot, isFinished, newRun } from "./game";
import { HOLES, TOTAL_PAR } from "./holes";
import { barelyMoved, formatLoss, lossRose, shotNote } from "./note";
import { step } from "./optimizer";
import { formatDiff, scoreName, totalStrokes, betterBest } from "./score";
import { isInCup, isOut, lrToSlider, simulateShot, sliderToLr, type ShotResult } from "./shot";

describe("損失の地形と勾配", () => {
  it("カップ（谷底）で損失が最小、勾配が 0", () => {
    for (const h of HOLES) {
      const g = h.grad(h.cup);
      expect(Math.abs(g.x)).toBeLessThan(1e-12);
      expect(Math.abs(g.y)).toBeLessThan(1e-12);
      expect(h.loss(h.cup)).toBeCloseTo(0, 12);
      expect(h.loss(h.start)).toBeGreaterThan(0);
    }
  });
  it("勾配が数値微分と合う", () => {
    const e = 1e-6;
    for (const h of HOLES) {
      for (const p of [h.start, { x: 0.3, y: -0.2 }, { x: -0.7, y: 0.4 }]) {
        const g = h.grad(p);
        const nx = (h.loss({ x: p.x + e, y: p.y }) - h.loss({ x: p.x - e, y: p.y })) / (2 * e);
        const ny = (h.loss({ x: p.x, y: p.y + e }) - h.loss({ x: p.x, y: p.y - e })) / (2 * e);
        expect(g.x).toBeCloseTo(nx, 5);
        expect(g.y).toBeCloseTo(ny, 5);
      }
    }
  });
  it("パーの合計は 10", () => expect(TOTAL_PAR).toBe(10));
});

describe("GD と Momentum の1ステップ", () => {
  const grad = () => ({ x: 2, y: -4 });
  it("GD：θ ← θ − η∇f", () => {
    const s = step("gd", { pos: { x: 1, y: 1 }, vel: { x: 0, y: 0 } }, 0.1, grad);
    expect(s.pos.x).toBeCloseTo(0.8);
    expect(s.pos.y).toBeCloseTo(1.4);
  });
  it("Momentum：v ← βv − η∇f、θ ← θ + v", () => {
    const s = step("momentum", { pos: { x: 1, y: 1 }, vel: { x: 1, y: 0 } }, 0.1, grad, 0.9);
    expect(s.vel.x).toBeCloseTo(0.9 - 0.2);
    expect(s.vel.y).toBeCloseTo(0.4);
    expect(s.pos.x).toBeCloseTo(1.7);
    expect(s.pos.y).toBeCloseTo(1.4);
  });
});

describe("OB とカップの判定", () => {
  const h = HOLES[0];
  it("盤の外・数でない値は OB", () => {
    expect(isOut({ x: 0, y: 0 }, h.bounds)).toBe(false);
    expect(isOut({ x: 1.7, y: 0 }, h.bounds)).toBe(true);
    expect(isOut({ x: 0, y: -1.1 }, h.bounds)).toBe(true);
    expect(isOut({ x: Number.NaN, y: 0 }, h.bounds)).toBe(true);
  });
  it("カップの半径の中ならカップイン", () => {
    expect(isInCup({ x: 0.05, y: 0 }, h)).toBe(true);
    expect(isInCup({ x: 0.1, y: 0 }, h)).toBe(false);
  });
});

describe("1打の計算", () => {
  const h = HOLES[0];
  it("学習率が大きすぎると発散して OB", () => {
    const r = simulateShot(h, h.start, 1, "gd");
    expect(r.outcome).toBe("ob");
  });
  it("学習率が小さすぎるとほとんど進まない", () => {
    const r = simulateShot(h, h.start, 0.003, "gd");
    expect(r.outcome).toBe("stop");
    expect(barelyMoved(r.path, h.cup)).toBe(true);
    expect(barelyMoved(simulateShot(h, h.start, 0.1, "gd").path, h.cup)).toBe(false);
  });
  it("ちょうどよい学習率ならカップに入る", () => {
    const r = simulateShot(h, h.start, 0.4, "gd");
    expect(r.outcome).toBe("cup");
    expect(r.path[0]).toEqual(h.start);
  });
  it("細長い谷では Momentum のほうが少ない打数で入る", () => {
    const strokesFor = (lr: number, m: "gd" | "momentum") => {
      const hole = HOLES[1];
      let p = hole.start;
      for (let n = 1; n <= 20; n++) {
        const r = simulateShot(hole, p, lr, m);
        if (r.outcome === "cup") return n;
        if (r.outcome === "stop") p = r.path[r.path.length - 1];
      }
      return 99;
    };
    expect(strokesFor(0.08, "momentum")).toBeLessThanOrEqual(HOLES[1].par);
    expect(strokesFor(0.15, "gd")).toBeGreaterThan(HOLES[1].par);
  });
  it("スライダーは対数で、端は学習率の範囲", () => {
    expect(sliderToLr(0)).toBeCloseTo(0.001);
    expect(sliderToLr(1)).toBeCloseTo(1);
    expect(sliderToLr(lrToSlider(0.05))).toBeCloseTo(0.05);
  });
});

describe("打数の進み方", () => {
  const stop = (x: number, y: number): ShotResult => ({ path: [HOLES[0].start, { x, y }], losses: [1, 0.5], outcome: "stop" });
  const ob: ShotResult = { path: [HOLES[0].start, { x: 9, y: 9 }], losses: [1, 99], outcome: "ob" };
  const cup: ShotResult = { path: [HOLES[0].start, HOLES[0].cup], losses: [1, 0], outcome: "cup" };

  it("止まったら、その場所から次を打つ", () => {
    const a = applyShot(newRun(), stop(-0.5, 0.2));
    expect(a.event).toBe("stop");
    expect(a.progress.pos).toEqual({ x: -0.5, y: 0.2 });
    expect(a.progress.strokes).toBe(1);
  });
  it("OB なら打った位置に戻り、打数は＋1", () => {
    const a = applyShot(newRun(), ob);
    expect(a.event).toBe("ob");
    expect(a.progress.pos).toEqual(HOLES[0].start);
    expect(a.progress.strokes).toBe(1);
  });
  it("カップに入ったら次のホールへ", () => {
    const a = applyShot({ ...newRun(), strokes: 2 }, cup);
    expect(a.event).toBe("cup");
    expect(a.strokes).toBe(3);
    expect(a.progress.hole).toBe(1);
    expect(a.progress.cards).toEqual([3]);
    expect(a.progress.pos).toEqual(HOLES[1].start);
    expect(a.progress.strokes).toBe(0);
  });
  it("打数の上限に達したらホールを最初から", () => {
    const a = applyShot({ ...newRun(), strokes: HOLES[0].limit - 1, pos: { x: 0.5, y: 0.5 } }, stop(0.4, 0.4));
    expect(a.event).toBe("fail");
    expect(a.progress.strokes).toBe(0);
    expect(a.progress.pos).toEqual(HOLES[0].start);
    expect(a.progress.hole).toBe(0);
  });
  it("上限の打でカップに入ればクリア", () => {
    const a = applyShot({ ...newRun(), strokes: HOLES[0].limit - 1 }, cup);
    expect(a.event).toBe("cup");
  });
  it("3ホール目のカップで終わり", () => {
    const p = { ...newRun(), hole: 2, cards: [3, 4], pos: HOLES[2].start };
    const a = applyShot(p, { ...cup, path: [HOLES[2].start, HOLES[2].cup] });
    expect(a.event).toBe("finish");
    expect(isFinished(a.progress)).toBe(true);
    expect(a.progress.cards).toEqual([3, 4, 1]);
  });
});

describe("等高線", () => {
  it("丸い谷の等高線は、損失が level になる所を通る", () => {
    const h = HOLES[0];
    const segs = contourSegments(h.loss, h.bounds, 40, 25, 0.2);
    expect(segs.length).toBeGreaterThan(10);
    for (const s of segs) expect(h.loss(s.a)).toBeCloseTo(0.2, 1);
  });
  it("値が範囲に無ければ線は無い", () => {
    expect(contourSegments(() => 1, HOLES[0].bounds, 10, 10, 0.5)).toEqual([]);
  });
  it("level は倍々に増え、max を超えない", () => {
    const ls = contourLevels(1, 0.1, 2);
    expect(ls).toEqual([0.1, 0.2, 0.4, 0.8]);
  });
});

describe("採点", () => {
  it("パーとの差", () => {
    expect(formatDiff(0)).toBe("±0");
    expect(formatDiff(2)).toBe("+2");
    expect(formatDiff(-1)).toBe("−1");
  });
  it("呼び名", () => {
    expect(scoreName(1, 3).en).toBe("Hole in One");
    expect(scoreName(2, 3).en).toBe("Birdie");
    expect(scoreName(3, 3).ja).toBe("パー");
    expect(scoreName(4, 3).en).toBe("Bogey");
    expect(scoreName(5, 3).en).toBe("Double Bogey");
    expect(scoreName(7, 3).en).toBe("+4");
    expect(scoreName(2, 4).en).toBe("Eagle");
  });
  it("合計と最高記録", () => {
    expect(totalStrokes([3, 4, 2])).toBe(9);
    expect(betterBest(null, 12)).toBe(12);
    expect(betterBest(10, 12)).toBe(10);
    expect(betterBest(10, 8)).toBe(8);
  });
});

describe("LAB NOTE", () => {
  const base = { lr: 0.05, method: "gd" as const, before: 1, after: 0.5, rose: false, slow: false, limit: 6 };
  it("出来事ごとに1行", () => {
    expect(shotNote({ ...base, event: "ob" })).toContain("OB");
    expect(shotNote({ ...base, event: "cup", after: 0 })).toContain("カップイン");
    expect(shotNote({ ...base, event: "fail" })).toContain("上限 6");
    expect(shotNote({ ...base, event: "stop", slow: true })).toContain("小さすぎる");
    expect(shotNote({ ...base, event: "stop", rose: true })).toContain("振動");
    expect(shotNote({ ...base, event: "stop" })).toContain("勾配に沿って");
    expect(shotNote({ ...base, event: "stop" })).not.toContain("\n");
  });
  it("損失の数字", () => {
    expect(formatLoss(1.23456)).toBe("1.23");
    expect(formatLoss(0.00012)).toBe("1.2e-4");
    expect(formatLoss(Infinity)).toBe("∞");
    expect(formatLoss(0)).toBe("0");
  });
  it("損失が上がった所を見つける", () => {
    expect(lossRose([3, 2, 1])).toBe(false);
    expect(lossRose([3, 1, 2])).toBe(true);
  });
});
