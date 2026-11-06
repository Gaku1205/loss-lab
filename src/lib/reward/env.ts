import type { StepEvents } from "./blocks";
import type { TaskKind, TaskSpec } from "./tasks";

export interface Cell {
  x: number;
  y: number;
}

/** 動く向き：上・右・下・左 */
export const MOVES: readonly Cell[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** 地図を読んだ箱庭 */
export interface World {
  kind: TaskKind;
  w: number;
  h: number;
  /** 壁なら true（y * w + x） */
  wall: boolean[];
  /** 床のマスの並び（番号 → 位置） */
  floor: Cell[];
  /** 位置（y * w + x） → 床の番号（壁は −1） */
  index: number[];
  start: number;
  /** ゴールの床の番号（無ければ −1） */
  goal: number;
  /** 目印の床の番号（通る順） */
  marks: number[];
  /** ゴールまでの歩数（床の番号ごと。ゴールが無ければ 0） */
  dist: number[];
  /** 状態の数（床の数 × おまけの情報の数） */
  states: number;
}

export function parseWorld(task: Pick<TaskSpec, "map" | "kind">): World {
  const h = task.map.length;
  const w = Math.max(...task.map.map((r) => r.length));
  const wall: boolean[] = [];
  const floor: Cell[] = [];
  const index: number[] = [];
  let start = -1;
  let goal = -1;
  const markAt: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = task.map[y][x] ?? "#";
      const isWall = ch === "#";
      wall.push(isWall);
      if (isWall) {
        index.push(-1);
        continue;
      }
      const i = floor.length;
      index.push(i);
      floor.push({ x, y });
      if (ch === "S") start = i;
      if (ch === "G") goal = i;
      if (/[1-9]/.test(ch)) markAt.push([Number(ch), i]);
    }
  }
  if (start < 0) throw new Error("スタートがありません");
  const marks = markAt.sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  const world: World = { kind: task.kind, w, h, wall, floor, index, start, goal, marks, dist: [], states: 0 };
  world.dist = goal >= 0 ? bfs(world, goal) : floor.map(() => 0);
  const extra = task.kind === "marks" ? marks.length + 1 : task.kind === "clean" ? 2 ** floor.length : 1;
  world.states = floor.length * extra;
  return world;
}

/** あるマスからの歩数（壁を回り込む） */
function bfs(world: World, from: number): number[] {
  const d = world.floor.map(() => Number.POSITIVE_INFINITY);
  d[from] = 0;
  const queue = [from];
  while (queue.length > 0) {
    const i = queue.shift() as number;
    const c = world.floor[i];
    for (const m of MOVES) {
      const j = cellAt(world, c.x + m.x, c.y + m.y);
      if (j >= 0 && d[j] === Number.POSITIVE_INFINITY) {
        d[j] = d[i] + 1;
        queue.push(j);
      }
    }
  }
  return d;
}

/** 位置の床の番号（壁・外は −1） */
export function cellAt(world: World, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return -1;
  return world.index[y * world.w + x];
}

/** ロボットの今の様子 */
export interface Agent {
  pos: number;
  /** 次に通る目印の番号（marks のとき） */
  next: number;
  /** 通ったマス（床の番号のビット） */
  visited: number;
}

export function startAgent(world: World): Agent {
  return { pos: world.start, next: 0, visited: 1 << world.start };
}

/** Q 表の行の番号 */
export function stateId(world: World, a: Agent): number {
  const n = world.floor.length;
  if (world.kind === "marks") return a.pos + n * a.next;
  if (world.kind === "clean") return a.pos + n * a.visited;
  return a.pos;
}

/** 課題をやり遂げたか */
export function isComplete(world: World, a: Agent): boolean {
  if (world.kind === "clean") return a.visited === 2 ** world.floor.length - 1;
  if (world.kind === "marks") return a.pos === world.goal && a.next === world.marks.length;
  return a.pos === world.goal;
}

/** エピソードが終わるか（ゴールに着いた・全部拭いた） */
export function isTerminal(world: World, a: Agent): boolean {
  if (world.kind === "clean") return isComplete(world, a);
  return a.pos === world.goal;
}

export interface StepResult {
  agent: Agent;
  events: StepEvents;
}

/** 1歩動かす。壁なら動かない */
export function step(world: World, a: Agent, action: number): StepResult {
  const c = world.floor[a.pos];
  const m = MOVES[action];
  const to = cellAt(world, c.x + m.x, c.y + m.y);
  const bump = to < 0;
  const pos = bump ? a.pos : to;
  const bit = 1 << pos;
  const seen = (a.visited & bit) !== 0;
  const isMark = world.marks.includes(pos);
  const nextMark = !bump && world.kind === "marks" && a.next < world.marks.length && world.marks[a.next] === pos;
  const d0 = world.dist[a.pos];
  const d1 = world.dist[pos];
  const events: StepEvents = {
    bump,
    closer: world.goal >= 0 && d1 < d0,
    away: world.goal >= 0 && d1 > d0,
    onMark: !bump && isMark,
    nextMark,
    goal: !bump && pos === world.goal,
    finish: !bump && pos === world.goal && a.next + (nextMark ? 1 : 0) === world.marks.length,
    moved: !bump,
    fresh: !bump && !seen,
    revisit: !bump && seen,
  };
  return { agent: { pos, next: a.next + (nextMark ? 1 : 0), visited: a.visited | bit }, events };
}
