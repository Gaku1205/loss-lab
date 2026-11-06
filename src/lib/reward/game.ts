import { BLOCKS, type BlockId } from "./blocks";
import { judge, type Verdict } from "./cheat";
import { parseWorld, type World } from "./env";
import { train, type Training } from "./learn";
import { taskScore } from "./score";
import { MAX_BLOCKS, MAX_TRIALS, TASKS, type TaskSpec } from "./tasks";

/** クリアした課題の記録 */
export interface TaskRecord {
  blocks: number;
  trials: number;
  score: number;
}

/** 1回の挑戦（3問）の進み具合。保存する */
export interface RewardProgress {
  /** 今の課題（0 から） */
  task: number;
  /** 今並べている条件ブロック */
  blocks: BlockId[];
  /** 今の課題で学習した回数 */
  trials: number;
  /** クリアした課題の記録（前から順に） */
  records: TaskRecord[];
}

export function newRewardRun(): RewardProgress {
  return startTask(0, []);
}

function startTask(task: number, records: TaskRecord[]): RewardProgress {
  return { task, blocks: [...TASKS[task].preset], trials: 0, records };
}

export function taskOf(p: RewardProgress): TaskSpec {
  return TASKS[Math.min(p.task, TASKS.length - 1)];
}

const worlds = new Map<number, World>();
export function worldOf(task: number): World {
  let w = worlds.get(task);
  if (!w) {
    w = parseWorld(TASKS[task]);
    worlds.set(task, w);
  }
  return w;
}

/** 学習の乱数の種（課題ごとに決まった値。同じ条件なら同じ結果） */
export function seedOf(task: number): number {
  return 1000 + task;
}

/** 並べた条件で、入ると報酬が出るマス（ゴール・目印）と、その値の合計 */
export function rewardSpots(world: World, blocks: readonly BlockId[]): Map<number, number> {
  const out = new Map<number, number>();
  const add = (cell: number, v: number) => out.set(cell, Math.round(((out.get(cell) ?? 0) + v) * 1000) / 1000);
  const has = (id: BlockId) => blocks.includes(id);
  if (world.goal >= 0) {
    if (has("goal")) add(world.goal, BLOCKS.goal.value);
    if (has("finish")) add(world.goal, BLOCKS.finish.value);
  }
  for (const m of world.marks) {
    if (has("mark")) add(m, BLOCKS.mark.value);
    if (has("order")) add(m, BLOCKS.order.value);
  }
  return out;
}

/** 学び終えた動きで、順番どおりに通った目印の数（shown 歩目まで） */
export function passedMarks(world: World, path: readonly number[], shown: number): number {
  let next = 0;
  for (let i = 0; i <= Math.min(shown, path.length - 1); i++) {
    if (next < world.marks.length && path[i] === world.marks[next]) next++;
  }
  return next;
}

/** 今の課題をクリアして、次へ進むのを待っているか */
export function isTaskCleared(p: RewardProgress): boolean {
  return p.records.length > p.task;
}

/** 3問を終えたか */
export function isRewardFinished(p: RewardProgress): boolean {
  return p.records.length >= TASKS.length;
}

/** 試行の上限までにクリアできなかったか */
export function isTaskFailed(p: RewardProgress): boolean {
  return !isTaskCleared(p) && p.trials >= MAX_TRIALS;
}

/** 条件ブロックを触れるか（学習の待ち・板を出している間は触れない） */
export function canEdit(p: RewardProgress): boolean {
  return !isTaskCleared(p) && !isTaskFailed(p);
}

/** 条件ブロックを足す・外す（並んでいれば外す） */
export function toggleBlock(p: RewardProgress, id: BlockId): RewardProgress {
  if (!canEdit(p) || !taskOf(p).palette.includes(id)) return p;
  if (p.blocks.includes(id)) return { ...p, blocks: p.blocks.filter((b) => b !== id) };
  if (p.blocks.length >= MAX_BLOCKS) return p;
  return { ...p, blocks: [...p.blocks, id] };
}

export function canLearn(p: RewardProgress): boolean {
  return canEdit(p) && p.blocks.length > 0;
}

export interface LearnResult {
  progress: RewardProgress;
  training: Training;
  verdict: Verdict;
  /** clear：クリア、cheat：ズルが残った、lost：学習不足、failed：試行の上限でクリアできなかった */
  outcome: "clear" | "cheat" | "lost" | "failed";
  /** クリアした時の記録 */
  record: TaskRecord | null;
}

/** 学び終えた動きの判定（目印を飛ばしたかもここで見る） */
export function judgeTraining(world: World, t: Training): Verdict {
  const last = t.final.path[t.final.path.length - 1];
  const skippedMarks = world.kind === "marks" && !t.final.complete && last === world.goal;
  return judge({ ep: t.final, skippedMarks });
}

/** 今の条件ブロックで学習する（試行を1回使う） */
export function learn(p: RewardProgress): LearnResult | null {
  if (!canLearn(p)) return null;
  const task = taskOf(p);
  const world = worldOf(p.task);
  const training = train(world, p.blocks, seedOf(p.task), task.maxSteps);
  const verdict = judgeTraining(world, training);
  const trials = p.trials + 1;
  if (verdict === "clear") {
    const record: TaskRecord = { blocks: p.blocks.length, trials, score: taskScore(p.blocks.length, trials) };
    return { progress: { ...p, trials, records: [...p.records, record] }, training, verdict, outcome: "clear", record };
  }
  const outcome = trials >= MAX_TRIALS ? "failed" : verdict === "lost" ? "lost" : "cheat";
  return { progress: { ...p, trials }, training, verdict, outcome, record: null };
}

/** クリアした課題の次へ */
export function nextTask(p: RewardProgress): RewardProgress {
  if (!isTaskCleared(p) || isRewardFinished(p)) return p;
  return startTask(p.task + 1, p.records);
}

/** 失敗した課題を最初から（試行 0・前の担当者の条件から） */
export function retryTask(p: RewardProgress): RewardProgress {
  return startTask(p.task, p.records.slice(0, p.task));
}
