import { rng } from "../defense/data";
import { BOSSES, BUDGET, evaluate, judge, type Fit, type Verdict } from "./boss";
import { CARDS, cardPool, modelStats, type CardId } from "./cards";

export const HAND_SIZE = 4;

/** 1回の挑戦（1階から最後の階まで） */
export interface RogueRun {
  /** それまでにクリアした周回の数（解禁に使う） */
  loop: number;
  /** 今の階（0 始まり） */
  floor: number;
  /** 足したカード（前から順） */
  model: CardId[];
  /** この階で出したカードの数 */
  used: number;
  hand: CardId[];
  /** 手札の乱数の種 */
  seed: number;
  /** これまでに引いた枚数 */
  draws: number;
  /** この階の学習曲線の節（階の始まり ＋ 出したカードごと） */
  curve: Fit[];
}

export type PlayEvent = "continue" | "clear" | "allclear" | "overfit" | "vanish" | "budget";

/** 種 seed の n 枚目に引くカード */
export function drawAt(pool: readonly CardId[], seed: number, n: number): CardId {
  const r = rng((seed * 2654435761 + n * 40503) >>> 0);
  return pool[Math.floor(r() * pool.length)];
}

/** 層のカードが1枚も無ければ、最後の1枚を層に替える（何も足せない手札を出さない） */
function ensureLayer(hand: CardId[], pool: readonly CardId[], seed: number, n: number): CardId[] {
  if (hand.some((id) => CARDS[id].type === "layer")) return hand;
  const layers = pool.filter((id) => CARDS[id].type === "layer");
  const out = [...hand];
  out[out.length - 1] = drawAt(layers, seed, n);
  return out;
}

export function newRun(loop: number, seed: number): RogueRun {
  const pool = cardPool(loop);
  const hand = ensureLayer(
    Array.from({ length: HAND_SIZE }, (_, i) => drawAt(pool, seed, i)),
    pool,
    seed,
    HAND_SIZE,
  );
  return { loop, floor: 0, model: [], used: 0, hand, seed, draws: HAND_SIZE + 1, curve: [evaluate(modelStats([]), BOSSES[0])] };
}

export function boss(run: RogueRun) {
  return BOSSES[Math.min(run.floor, BOSSES.length - 1)];
}

export function currentFit(run: RogueRun): Fit {
  return run.curve[run.curve.length - 1] ?? evaluate(modelStats(run.model), boss(run));
}

/** 手札の slot 番目（0〜3）を出す。出したカードは手札から抜け、新しい1枚が入る */
export function play(run: RogueRun, slot: number): { run: RogueRun; event: PlayEvent; fit: Fit } | null {
  const id = run.hand[slot];
  if (id === undefined || run.floor >= BOSSES.length) return null;
  const pool = cardPool(run.loop);
  const model = [...run.model, id];
  const stats = modelStats(model);
  const b = boss(run);
  const fit = evaluate(stats, b);
  const used = run.used + 1;
  const verdict: Verdict = judge(stats, fit, b, used);
  let hand = [...run.hand];
  hand[slot] = drawAt(pool, run.seed, run.draws);
  hand = ensureLayer(hand, pool, run.seed, run.draws + 1);
  const next: RogueRun = { ...run, model, used, hand, draws: run.draws + 2, curve: [...run.curve, fit] };
  if (verdict === "clear") {
    const last = run.floor === BOSSES.length - 1;
    return { run: next, event: last ? "allclear" : "clear", fit };
  }
  return { run: next, event: verdict, fit };
}

/** 倒した後、次の階へ進む（モデルはそのまま、出した数は 0 に） */
export function nextFloor(run: RogueRun): RogueRun {
  const floor = Math.min(run.floor + 1, BOSSES.length - 1);
  const curve = [evaluate(modelStats(run.model), BOSSES[floor])];
  return { ...run, floor, used: 0, curve };
}

/** 負けた時：同じ周回のまま、最初（1階・空のモデル）から */
export function restartRun(run: RogueRun, seed: number): RogueRun {
  return newRun(run.loop, seed);
}

/** 全階を倒した後：周回を1つ進め、カードを解禁して最初から */
export function nextLoop(run: RogueRun, seed: number): RogueRun {
  return newRun(run.loop + 1, seed);
}

export function isDefeat(e: PlayEvent): boolean {
  return e === "overfit" || e === "vanish" || e === "budget";
}

/** 残りの手（この階で、あと何枚出せるか） */
export function budgetLeft(run: RogueRun): number {
  return BUDGET - run.used;
}

/** 最高記録 */
export interface RogueBest {
  /** 到達した階の最高（1〜4）。無ければ null */
  floor: number | null;
  /** 全階を倒した回数 */
  loops: number;
}

/** 階 floor（0 始まり）に着いた時の最高記録 */
export function reachFloor(best: RogueBest, floor: number): RogueBest {
  const f = floor + 1;
  return { ...best, floor: best.floor === null || f > best.floor ? f : best.floor };
}

/** 全階を倒した時の最高記録（周回 +1、到達階は最後の階） */
export function clearLoop(best: RogueBest): RogueBest {
  return { floor: BOSSES.length, loops: best.loops + 1 };
}

/** 学習曲線の1目盛り */
export interface CurvePoint {
  train: number;
  val: number;
}

/** 1枚あたりのエポック（曲線の目盛り） */
export const EPOCHS = 8;

/** 節と節の間を、1枚あたり EPOCHS 目盛りの曲線にする（はじめ速く、あとでゆっくり） */
export function curvePoints(nodes: readonly Fit[]): CurvePoint[] {
  const first = nodes[0];
  if (!first) return [];
  const out: CurvePoint[] = [{ train: first.train, val: first.val }];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    for (let k = 1; k <= EPOCHS; k++) {
      const s = k / EPOCHS;
      const e = 1 - (1 - s) * (1 - s);
      out.push({ train: a.train + (b.train - a.train) * e, val: a.val + (b.val - a.val) * e });
    }
  }
  return out;
}
