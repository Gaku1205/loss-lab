import { rng } from "../defense/data";
import { stepReward, type BlockId } from "./blocks";
import { isComplete, isTerminal, MOVES, startAgent, stateId, step, type World } from "./env";

/** 学習の決まった値（表形式の Q 学習） */
export const LEARN = {
  /** 1回の学習で回すエピソードの数 */
  episodes: 150,
  /** 学習率 α */
  alpha: 0.5,
  /** 割引率 γ */
  gamma: 0.95,
  /** でたらめに動く割合 ε（最初 → 最後へ一定の割合で減らす） */
  epsStart: 0.4,
  epsEnd: 0.05,
} as const;

/** 1エピソードの記録 */
export interface Episode {
  /** 通ったマス（床の番号。最初はスタート） */
  path: number[];
  /** 得た報酬の合計 */
  total: number;
  /** 課題をやり遂げたか */
  complete: boolean;
  /** 1歩ごとの報酬 */
  rewards: number[];
}

export function newQ(world: World): Float64Array {
  return new Float64Array(world.states * MOVES.length);
}

/** いちばん良い向き。同じ値なら random で選ぶ（無ければ番号の小さい方） */
function bestAction(q: Float64Array, s: number, random?: () => number): number {
  let best = -Infinity;
  const ties: number[] = [];
  for (let a = 0; a < MOVES.length; a++) {
    const v = q[s * MOVES.length + a];
    if (v > best + 1e-9) {
      best = v;
      ties.length = 0;
      ties.push(a);
    } else if (Math.abs(v - best) <= 1e-9) ties.push(a);
  }
  if (!random || ties.length === 1) return ties[0];
  return ties[Math.floor(random() * ties.length)];
}

function maxQ(q: Float64Array, s: number): number {
  let m = -Infinity;
  for (let a = 0; a < MOVES.length; a++) m = Math.max(m, q[s * MOVES.length + a]);
  return m;
}

/** 1エピソード学習する（q を書き換える）。同じ q・同じ乱数なら同じ結果 */
export function learnEpisode(
  world: World,
  blocks: readonly BlockId[],
  q: Float64Array,
  random: () => number,
  eps: number,
  maxSteps: number,
): Episode {
  let agent = startAgent(world);
  const path = [agent.pos];
  const rewards: number[] = [];
  let total = 0;
  for (let t = 0; t < maxSteps; t++) {
    const s = stateId(world, agent);
    const a = random() < eps ? Math.floor(random() * MOVES.length) : bestAction(q, s, random);
    const res = step(world, agent, a);
    const r = stepReward(blocks, res.events);
    const done = isTerminal(world, res.agent);
    const s2 = stateId(world, res.agent);
    const target = r + (done ? 0 : LEARN.gamma * maxQ(q, s2));
    const k = s * MOVES.length + a;
    q[k] += LEARN.alpha * (target - q[k]);
    agent = res.agent;
    path.push(agent.pos);
    rewards.push(r);
    total += r;
    if (done) break;
  }
  return { path, total: round(total), complete: isComplete(world, agent), rewards };
}

/** 学び終えた動き（でたらめなし）で1エピソード動かす */
export function greedyEpisode(world: World, blocks: readonly BlockId[], q: Float64Array, maxSteps: number): Episode {
  let agent = startAgent(world);
  const path = [agent.pos];
  const rewards: number[] = [];
  let total = 0;
  for (let t = 0; t < maxSteps; t++) {
    const res = step(world, agent, bestAction(q, stateId(world, agent)));
    const r = stepReward(blocks, res.events);
    agent = res.agent;
    path.push(agent.pos);
    rewards.push(r);
    total += r;
    if (isTerminal(world, agent)) break;
  }
  return { path, total: round(total), complete: isComplete(world, agent), rewards };
}

export interface Training {
  /** エピソードごとの報酬の合計 */
  returns: number[];
  /** 途中のエピソード（軌跡を描く用。SAMPLE_EVERY ごと） */
  samples: Episode[];
  /** 学び終えた動き */
  final: Episode;
}

/** 途中の軌跡を何エピソードごとに残すか */
export const SAMPLE_EVERY = 25;

/** 条件ブロックで学習する。Q 表は毎回 0 から、乱数の種は課題ごとに決まった値 */
export function train(world: World, blocks: readonly BlockId[], seed: number, maxSteps: number): Training {
  const q = newQ(world);
  const random = rng(seed);
  const returns: number[] = [];
  const samples: Episode[] = [];
  const n = LEARN.episodes;
  for (let e = 0; e < n; e++) {
    const eps = LEARN.epsStart + ((LEARN.epsEnd - LEARN.epsStart) * e) / Math.max(1, n - 1);
    const ep = learnEpisode(world, blocks, q, random, eps, maxSteps);
    returns.push(ep.total);
    if ((e + 1) % SAMPLE_EVERY === 0) samples.push(ep);
  }
  return { returns, samples, final: greedyEpisode(world, blocks, q, maxSteps) };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
