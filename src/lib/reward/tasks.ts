import type { BlockId } from "./blocks";

/** 課題の種類。goal：ゴールまで行く、marks：目印を順に通ってゴール、clean：全部のマスを通る */
export type TaskKind = "goal" | "marks" | "clean";

export interface TaskSpec {
  no: number;
  en: string;
  ja: string;
  kind: TaskKind;
  /** 箱庭の地図。# 壁、S スタート、G ゴール、1 2 目印（この順に通る）、. 床 */
  map: readonly string[];
  /** この課題で使える条件ブロック */
  palette: readonly BlockId[];
  /** 課題を始めた時に並んでいる条件ブロック（前の担当者が書いた報酬） */
  preset: readonly BlockId[];
  /** 1エピソードの歩数の上限 */
  maxSteps: number;
}

export const TASKS: readonly TaskSpec[] = [
  {
    no: 1,
    en: "REACH",
    ja: "ゴールまで行く",
    kind: "goal",
    map: ["##########", "#S.......#", "#........#", "#.....#..#", "#.....#.G#", "##########"],
    palette: ["goal", "closer", "away", "step", "wall"],
    preset: ["closer"],
    maxSteps: 30,
  },
  {
    no: 2,
    en: "CHECKPOINTS",
    ja: "目印を順に通ってゴール",
    kind: "marks",
    map: ["##########", "#S......1#", "#........#", "#........#", "#G......2#", "##########"],
    palette: ["goal", "finish", "mark", "order", "step", "wall"],
    preset: ["goal", "mark"],
    maxSteps: 40,
  },
  {
    no: 3,
    en: "CLEAN",
    ja: "部屋を掃除（全マスを通る）",
    kind: "clean",
    map: ["######", "#S...#", "#....#", "#..#.#", "######"],
    palette: ["wipe", "fresh", "revisit", "step", "wall"],
    preset: ["wipe"],
    maxSteps: 30,
  },
];

/** 1回の挑戦で並べられる条件ブロックの数 */
export const MAX_BLOCKS = 4;
/** 1つの課題で学習できる回数（試行の上限） */
export const MAX_TRIALS = 5;
