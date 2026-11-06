import type { Verdict } from "./cheat";
import { MAX_TRIALS } from "./tasks";

/** 課題を始めた時の LAB NOTE（文言は docs/design.md） */
export function taskIntroNote(task: number): string {
  switch (task) {
    case 0:
      return "課題1。ロボットをゴールまで行かせたい。前の担当者は「近づいたら＋」だけを書いた。まず学習してみる。";
    case 1:
      return "課題2。目印 1 → 2 の順に通ってからゴール。条件の書き方しだいで、ロボットは近道を探す。";
    default:
      return "課題3。部屋の床を全部拭かせたい。「拭いたら＋」だけだと、どこを拭くかは気にしない。";
  }
}

/** 報酬の合計の形（`19` `−0.3` `8.6`） */
export function rewardText(v: number): string {
  const r = Math.round(v * 10) / 10;
  if (r < 0) return `−${Math.abs(r)}`;
  return String(r);
}

export interface LearnNoteInput {
  verdict: Verdict;
  outcome: "clear" | "cheat" | "lost" | "failed";
  total: number;
  blocks: number;
  trials: number;
}

/** 学習を終えた時の LAB NOTE。warn は朱で出す */
export function learnNote(i: LearnNoteInput): { text: string; warn: boolean } {
  const r = rewardText(i.total);
  if (i.outcome === "failed") {
    return { text: `試行が上限 ${MAX_TRIALS} 回に達した。条件を見直して、この課題を最初から。`, warn: true };
  }
  switch (i.verdict) {
    case "clear":
      return { text: `報酬 ${r}。ズルなしで課題を達成。条件 ${i.blocks} 個・試行 ${i.trials} 回。`, warn: false };
    case "shuttle":
      return { text: `報酬 ${r}。同じ2マスを往復して報酬を稼いでいる（ズル）。行き来しても得をしない条件にする。`, warn: true };
    case "loop":
      return { text: `報酬 ${r}。同じ道をぐるぐる回って報酬を稼いでいる（ズル）。回っても得をしない条件にする。`, warn: true };
    case "shortcut":
      return { text: `報酬 ${r}。目印を飛ばしてゴールだけしている（ズル）。課題の中身に報酬を付ける。`, warn: true };
    case "farm":
      return { text: `報酬 ${r}。報酬は稼いだが、課題は終わっていない（ズル）。報酬と課題がずれている。`, warn: true };
    case "lost":
      return { text: `報酬 ${r}。ロボットは何をすれば良いか分からない（学習不足）。手がかりになる条件を足す。`, warn: true };
  }
}
