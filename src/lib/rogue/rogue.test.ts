import { describe, expect, it } from "vitest";
import { BOSSES, BUDGET, evaluate, judge, OVERFIT_GAP } from "./boss";
import { BASE_STATS, CARDS, cardPool, effectText, modelStats, newCards, type CardId } from "./cards";
import {
  clearLoop,
  curvePoints,
  drawAt,
  EPOCHS,
  HAND_SIZE,
  isDefeat,
  newRun,
  nextFloor,
  nextLoop,
  play,
  reachFloor,
  restartRun,
  type RogueRun,
} from "./game";
import { floorIntroNote, playNote } from "./note";

const [MOONS, , DIGITS, PHOTOS] = BOSSES;

function layerSlot(run: RogueRun): number {
  return run.hand.findIndex((id) => CARDS[id].type === "layer");
}

describe("カードの効果", () => {
  it("入力だけのモデル", () => {
    expect(modelStats([])).toEqual(BASE_STATS);
  });
  it("層は表現力を足し、勾配の流れを細くする", () => {
    const s = modelStats(["relu", "sigmoid"]);
    expect(s.cap).toBe(1 + 3 + 4);
    expect(s.depth).toBe(2);
    expect(s.grad).toBeCloseTo(0.9 * 0.6);
  });
  it("正則化のカードは正則化だけを足す", () => {
    const s = modelStats(["dropout", "augment", "decay"]);
    expect(s).toEqual({ cap: 1, reg: 2 + 3 + 1, grad: 1, depth: 0 });
  });
  it("バッチ正規化・残差接続は勾配を戻す（1 を超えない）", () => {
    expect(modelStats(["sigmoid", "sigmoid", "batchnorm"]).grad).toBeCloseTo(0.36 * 1.6);
    expect(modelStats(["relu", "residual"]).grad).toBe(1);
  });
  it("畳み込み層は表現力と少しの正則化", () => {
    expect(modelStats(["conv"])).toEqual({ cap: 6, reg: 1, grad: 0.9, depth: 1 });
  });
  it("効果の1行", () => {
    expect(effectText("relu")).toBe("CAP +3 ・ GRAD ×0.9");
    expect(effectText("dropout")).toBe("REG +2");
    expect(effectText("conv")).toBe("CAP +5 ・ REG +1 ・ GRAD ×0.9");
    expect(effectText("batchnorm")).toBe("GRAD ×1.6");
  });
  it("周回でカードが増える", () => {
    expect(cardPool(0)).toEqual(["sigmoid", "relu", "dropout", "augment", "batchnorm"]);
    expect(cardPool(1)).toHaveLength(7);
    expect(cardPool(2)).toHaveLength(9);
    expect(cardPool(5)).toHaveLength(9);
    expect(newCards(1)).toEqual(["wide", "decay"]);
    expect(newCards(2)).toEqual(["residual", "conv"]);
    expect(newCards(3)).toEqual([]);
  });
});

describe("ボスの判定", () => {
  it("入力だけでは MOONS に届かない", () => {
    expect(evaluate(BASE_STATS, MOONS)).toEqual({ eff: 1, train: 61, val: 61 });
  });
  it("ちょうど良い表現力なら検証精度は ceil まで上がる", () => {
    const s = modelStats(["relu"]);
    const f = evaluate(s, MOONS);
    expect(f).toEqual({ eff: 4, train: 95, val: 95 });
    expect(judge(s, f, MOONS, 1)).toBe("clear");
  });
  it("表現力が余ると、学習は上がり検証は下がる（過学習）", () => {
    const s = { cap: 22, reg: 0, grad: 1, depth: 6 };
    const f = evaluate(s, DIGITS);
    expect(f.train).toBe(100);
    expect(f.val).toBe(76);
    expect(f.train - f.val).toBeGreaterThanOrEqual(OVERFIT_GAP);
    expect(judge(s, f, DIGITS, 1)).toBe("overfit");
  });
  it("正則化で過学習を抑えられる（表現力は少し減る）", () => {
    const s = { cap: 22, reg: 8, grad: 1, depth: 6 };
    const f = evaluate(s, DIGITS);
    expect(f.eff).toBe(20);
    expect(f.train - f.val).toBe(0);
    expect(judge(s, f, DIGITS, 1)).toBe("clear");
  });
  it("Sigmoid を3枚重ねると勾配消失で負け", () => {
    const s = modelStats(["sigmoid", "sigmoid", "sigmoid"]);
    expect(s.grad).toBeLessThan(0.25);
    expect(judge(s, evaluate(s, MOONS), MOONS, 3)).toBe("vanish");
  });
  it("勾配が細いと学習が鈍る", () => {
    const thin = evaluate({ cap: 12, reg: 0, grad: 0.3, depth: 3 }, PHOTOS);
    const full = evaluate({ cap: 12, reg: 0, grad: 1, depth: 3 }, PHOTOS);
    expect(thin.eff).toBeCloseTo(12 * 0.6);
    expect(thin.val).toBeLessThan(full.val);
  });
  it("目標に届かないまま出せる数を使い切ると負け", () => {
    const s = modelStats(["dropout"]);
    const f = evaluate(s, MOONS);
    expect(judge(s, f, MOONS, BUDGET - 1)).toBe("continue");
    expect(judge(s, f, MOONS, BUDGET)).toBe("budget");
  });
});

describe("手札と階の進み方", () => {
  it("同じ種なら同じ手札。手札は4枚で、層のカードが必ずある", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = newRun(0, seed);
      expect(r.hand).toHaveLength(HAND_SIZE);
      expect(layerSlot(r)).toBeGreaterThanOrEqual(0);
      expect(r.hand.every((id) => cardPool(0).includes(id))).toBe(true);
    }
    expect(newRun(0, 5)).toEqual(newRun(0, 5));
    expect(drawAt(cardPool(0), 3, 1)).toBe(drawAt(cardPool(0), 3, 1));
  });
  it("最初の階は、層を1枚足せば倒せる", () => {
    const r = newRun(0, 1);
    const out = play(r, layerSlot(r));
    expect(out?.event).toBe("clear");
    expect(out?.run.model).toHaveLength(1);
    expect(out?.run.used).toBe(1);
    expect(out?.run.curve).toHaveLength(2);
  });
  it("出したカードは手札から抜け、新しい1枚が入る（層のカードは残る）", () => {
    const r: RogueRun = { ...newRun(0, 2), hand: ["dropout", "augment", "batchnorm", "relu"] };
    const out = play(r, 0);
    expect(out?.event).toBe("continue");
    expect(out?.run.model).toEqual(["dropout"]);
    expect(out?.run.hand.slice(1, 3)).toEqual(["augment", "batchnorm"]);
    expect(out?.run.hand.some((id) => CARDS[id].type === "layer")).toBe(true);
    expect(play(r, 7)).toBeNull();
  });
  it("倒すと次の階へ。モデルはそのまま、出した数は 0 から", () => {
    const r = newRun(0, 1);
    const out = play(r, layerSlot(r));
    if (!out) throw new Error("出せない");
    const n = nextFloor(out.run);
    expect(n.floor).toBe(1);
    expect(n.used).toBe(0);
    expect(n.model).toEqual(out.run.model);
    expect(n.curve).toEqual([evaluate(modelStats(n.model), BOSSES[1])]);
  });
  it("最後の階を倒すと全階突破", () => {
    const model: CardId[] = ["relu", "relu", "relu", "relu", "relu", "relu", "batchnorm", "augment"];
    const r: RogueRun = { ...newRun(0, 1), floor: 3, model, hand: ["relu", "relu", "relu", "relu"] };
    const out = play(r, 0);
    expect(out?.fit.val).toBe(94);
    expect(out?.event).toBe("allclear");
  });
  it("負けると、同じ周回のまま最初から。全階突破なら周回が進む", () => {
    const r: RogueRun = { ...newRun(1, 1), floor: 2, model: ["relu"], used: 3 };
    const again = restartRun(r, 9);
    expect(again.loop).toBe(1);
    expect(again.floor).toBe(0);
    expect(again.model).toEqual([]);
    const next = nextLoop(r, 9);
    expect(next.loop).toBe(2);
    expect(next.floor).toBe(0);
    expect(isDefeat("overfit") && isDefeat("vanish") && isDefeat("budget")).toBe(true);
    expect(isDefeat("clear") || isDefeat("continue") || isDefeat("allclear")).toBe(false);
  });
});

describe("最高記録", () => {
  it("到達階の最高と周回", () => {
    let b = { floor: null as number | null, loops: 0 };
    b = reachFloor(b, 0);
    expect(b).toEqual({ floor: 1, loops: 0 });
    b = reachFloor(b, 2);
    b = reachFloor(b, 1);
    expect(b.floor).toBe(3);
    b = clearLoop(b);
    expect(b).toEqual({ floor: 4, loops: 1 });
  });
});

describe("学習曲線", () => {
  it("1枚ごとに EPOCHS 目盛り。最後は次の節に着く", () => {
    const a = { eff: 1, train: 60, val: 60 };
    const b = { eff: 4, train: 96, val: 90 };
    const pts = curvePoints([a, b]);
    expect(pts).toHaveLength(1 + EPOCHS);
    expect(pts[0]).toEqual({ train: 60, val: 60 });
    expect(pts[EPOCHS]).toEqual({ train: 96, val: 90 });
    for (let i = 1; i < pts.length; i++) expect(pts[i].train).toBeGreaterThan(pts[i - 1].train);
    expect(curvePoints([])).toEqual([]);
  });
});

describe("LAB NOTE", () => {
  it("階の始まり", () => {
    expect(floorIntroNote(0)).toContain("MOONS");
    expect(floorIntroNote(3)).toContain("PHOTOS");
  });
  it("負けは朱、勝ちはふつう", () => {
    const fit = { eff: 4, train: 99, val: 80 };
    expect(playNote({ event: "overfit", card: "wide", fit, grad: 1, floor: 2, loop: 0 })).toEqual({
      text: "学習 99% に対して検証 80%。訓練データを覚えただけ（過学習）。最初から。",
      warn: true,
    });
    expect(playNote({ event: "vanish", card: "sigmoid", fit, grad: 0.216, floor: 0, loop: 0 }).text).toContain("0.22");
    expect(playNote({ event: "clear", card: "relu", fit: { eff: 4, train: 95, val: 95 }, grad: 1, floor: 0, loop: 0 }).text).toBe(
      "検証精度 95% で MOONS を撃破。モデルはそのまま次の階へ。",
    );
    expect(playNote({ event: "allclear", card: "relu", fit, grad: 1, floor: 3, loop: 0 }).text).toContain("周回 2");
    expect(playNote({ event: "continue", card: "relu", fit: { eff: 3, train: 80, val: 80 }, grad: 1, floor: 1, loop: 0 }).text).toBe(
      "DENSE·ReLU：学習 80% ／ 検証 80%。目標まであと 8 ポイント。",
    );
  });
});
