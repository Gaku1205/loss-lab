import { describe, expect, it } from "vitest";
import { rng } from "../defense/data";
import { emptySave, parseSave, serializeSave } from "../save";
import { NO_EVENTS, stepReward, valueText, type BlockId, type StepEvents } from "./blocks";
import { innerRepeat, isCheat, judge, repeatPeriod, repeatSpan } from "./cheat";
import { isComplete, parseWorld, startAgent, step } from "./env";
import {
  canLearn,
  isRewardFinished,
  isTaskCleared,
  isTaskFailed,
  learn,
  newRewardRun,
  nextTask,
  passedMarks,
  retryTask,
  rewardSpots,
  seedOf,
  toggleBlock,
  worldOf,
  type RewardProgress,
} from "./game";
import { learnEpisode, LEARN, newQ, train, type Episode } from "./learn";
import { learnNote, rewardText, taskIntroNote } from "./note";
import { isBetter, taskScore, totalScore } from "./score";
import { MAX_BLOCKS, MAX_TRIALS, TASKS } from "./tasks";

const ev = (e: Partial<StepEvents>): StepEvents => ({ ...NO_EVENTS, ...e });
const ep = (path: number[], total: number, complete = false): Episode => ({ path, total, complete, rewards: [] });

/** 条件を並べ替えて学習まで進める */
function withBlocks(p: RewardProgress, blocks: BlockId[]): RewardProgress {
  return { ...p, blocks };
}

describe("報酬の計算（1歩）", () => {
  it("成り立った条件の値を足す", () => {
    expect(stepReward(["goal", "step"], ev({ goal: true, moved: true }))).toBeCloseTo(9.9);
    expect(stepReward(["closer"], ev({ closer: true }))).toBe(1);
    expect(stepReward(["closer", "away"], ev({ away: true }))).toBe(-1);
    expect(stepReward(["wall", "step"], ev({ bump: true }))).toBeCloseTo(-1.1);
  });
  it("成り立たない条件は 0。同じブロックは1回だけ", () => {
    expect(stepReward(["goal", "mark"], ev({ moved: true }))).toBe(0);
    expect(stepReward(["wipe", "wipe"], ev({ moved: true }))).toBe(1);
    expect(stepReward([], ev({ goal: true }))).toBe(0);
  });
  it("拭く・目印・ゴールの条件", () => {
    expect(stepReward(["wipe", "revisit"], ev({ moved: true, revisit: true }))).toBe(0);
    expect(stepReward(["wipe", "fresh"], ev({ moved: true, fresh: true }))).toBe(2);
    expect(stepReward(["mark", "order"], ev({ onMark: true, nextMark: true }))).toBe(6);
    expect(stepReward(["finish"], ev({ goal: true }))).toBe(0);
    expect(stepReward(["finish"], ev({ goal: true, finish: true }))).toBe(10);
  });
  it("値の形", () => {
    expect(valueText(10)).toBe("+10");
    expect(valueText(-0.1)).toBe("−0.1");
  });
});

describe("箱庭", () => {
  it("地図を読む", () => {
    const w = parseWorld(TASKS[0]);
    expect(w.w).toBe(10);
    expect(w.h).toBe(6);
    expect(w.floor[w.start]).toEqual({ x: 1, y: 1 });
    expect(w.floor[w.goal]).toEqual({ x: 8, y: 4 });
    expect(w.dist[w.start]).toBe(10);
  });
  it("壁に当たると動かず、bump が立つ", () => {
    const w = parseWorld(TASKS[0]);
    const r = step(w, startAgent(w), 0);
    expect(r.agent.pos).toBe(w.start);
    expect(r.events.bump).toBe(true);
    expect(r.events.moved).toBe(false);
  });
  it("目印は順に数え、全部の後のゴールで finish", () => {
    const w = parseWorld(TASKS[1]);
    expect(w.marks.map((i) => w.floor[i])).toEqual([
      { x: 8, y: 1 },
      { x: 8, y: 4 },
    ]);
    let a = startAgent(w);
    // 2 の目印へ先に行っても next は増えない
    a = { ...a, pos: w.index[3 * w.w + 8] };
    const toTwo = step(w, a, 2);
    expect(toTwo.events.onMark).toBe(true);
    expect(toTwo.events.nextMark).toBe(false);
    const done = step(w, { pos: w.index[4 * w.w + 2], next: 2, visited: 0 }, 3);
    expect(done.events.goal).toBe(true);
    expect(done.events.finish).toBe(true);
    expect(isComplete(w, done.agent)).toBe(true);
    const skip = step(w, { pos: w.index[4 * w.w + 2], next: 0, visited: 0 }, 3);
    expect(skip.events.goal).toBe(true);
    expect(skip.events.finish).toBe(false);
    expect(isComplete(w, skip.agent)).toBe(false);
  });
  it("掃除：初めてのマスと戻ったマス", () => {
    const w = parseWorld(TASKS[2]);
    const a = startAgent(w);
    const r1 = step(w, a, 1);
    expect(r1.events.fresh).toBe(true);
    const r2 = step(w, r1.agent, 3);
    expect(r2.events.revisit).toBe(true);
  });
});

describe("ズルの判定", () => {
  it("くり返しの周期", () => {
    expect(repeatPeriod([1, 2, 3, 4, 3, 4, 3, 4])).toBe(2);
    expect(repeatPeriod([1, 2, 5, 6, 7, 8, 5, 6, 7, 8])).toBe(4);
    expect(repeatPeriod([1, 2, 3, 4, 5])).toBe(0);
    // その場で止まっているだけはくり返しにしない
    expect(repeatPeriod([1, 2, 2, 2, 2])).toBe(0);
    expect(innerRepeat([0, 1, 2, 1, 2, 3, 9])).toBe(2);
    expect(innerRepeat([0, 1, 2, 3, 9])).toBe(0);
  });
  it("くり返した所", () => {
    expect(repeatSpan([0, 1, 2, 1, 2, 1, 2])).toEqual({ start: 1, end: 7, period: 2 });
    expect(repeatSpan([0, 5, 1, 2, 1, 2, 3, 9])).toEqual({ start: 2, end: 6, period: 2 });
    expect(repeatSpan([0, 1, 2, 3])).toBeNull();
  });
  it("同じ場所の往復", () => {
    expect(judge({ ep: ep([0, 1, 2, 1, 2, 1, 2], 5), skippedMarks: false })).toBe("shuttle");
  });
  it("ぐるぐる", () => {
    expect(judge({ ep: ep([0, 1, 2, 3, 4, 1, 2, 3, 4, 1], 6), skippedMarks: false })).toBe("loop");
  });
  it("ゴールせず報酬だけ高い", () => {
    expect(judge({ ep: ep([0, 1, 2, 3, 3, 3, 3], 9), skippedMarks: false })).toBe("farm");
  });
  it("目印を飛ばしたゴール", () => {
    expect(judge({ ep: ep([0, 1, 2], 10), skippedMarks: true })).toBe("shortcut");
  });
  it("やり遂げても途中で稼いでいたらズル、そうでなければクリア", () => {
    expect(judge({ ep: ep([0, 1, 2, 1, 2, 3], 8, true), skippedMarks: false })).toBe("shuttle");
    expect(judge({ ep: ep([0, 1, 2, 3], 8, true), skippedMarks: false })).toBe("clear");
  });
  it("報酬も稼げていない迷子は学習不足（ズルではない）", () => {
    const v = judge({ ep: ep([0, 1, 0, 1, 0], 0), skippedMarks: false });
    expect(v).toBe("lost");
    expect(isCheat(v)).toBe(false);
    expect(isCheat("shuttle")).toBe(true);
  });
});

describe("得点", () => {
  it("条件の数と試行回数が少ないほど高い", () => {
    expect(taskScore(1, 1)).toBe(1000);
    expect(taskScore(2, 1)).toBe(900);
    expect(taskScore(1, 2)).toBe(850);
    expect(taskScore(4, 5)).toBe(100);
    expect(taskScore(2, 1)).toBeGreaterThan(taskScore(3, 1));
    expect(taskScore(2, 1)).toBeGreaterThan(taskScore(2, 2));
  });
  it("合計と最高記録", () => {
    expect(totalScore([{ score: 1000 }, { score: 850 }])).toBe(1850);
    expect(isBetter(10, null)).toBe(true);
    expect(isBetter(10, 10)).toBe(false);
    expect(isBetter(11, 10)).toBe(true);
  });
});

describe("学習（シード固定）", () => {
  it("1エピソードは同じ乱数なら同じ結果", () => {
    const w = worldOf(0);
    const run = () => learnEpisode(w, ["closer"], newQ(w), rng(5), 0.3, 30);
    const a = run();
    expect(a).toEqual(run());
    expect(a.path[0]).toBe(w.start);
    expect(a.path.length).toBe(a.rewards.length + 1);
    expect(a.total).toBeCloseTo(a.rewards.reduce((s, r) => s + r, 0));
  });
  it("1エピソードで Q 表が書き換わる", () => {
    const w = worldOf(0);
    const q = newQ(w);
    learnEpisode(w, ["step"], q, rng(1), 1, 10);
    expect(q.some((v) => v !== 0)).toBe(true);
  });
  it("同じ条件なら学習の結果も同じ", () => {
    const w = worldOf(0);
    const a = train(w, ["closer"], seedOf(0), TASKS[0].maxSteps);
    const b = train(w, ["closer"], seedOf(0), TASKS[0].maxSteps);
    expect(a).toEqual(b);
    expect(a.returns).toHaveLength(LEARN.episodes);
  });
});

describe("課題（目安どおりにズルが出て、塞げる）", () => {
  const verdictOf = (task: number, blocks: BlockId[]) => {
    let p = newRewardRun();
    for (let i = 0; i < task; i++) p = { ...p, task: i + 1, records: [...p.records, { blocks: 1, trials: 1, score: 1000 }] };
    return learn(withBlocks(p, blocks))?.verdict;
  };
  it("課題1：近づいたら＋だけだと往復、1歩ごとに−を足すとぐるぐる。ゴール＋で塞げる", () => {
    expect(verdictOf(0, ["closer"])).toBe("shuttle");
    expect(verdictOf(0, ["closer", "step"])).toBe("loop");
    expect(verdictOf(0, ["closer", "goal"])).toBe("clear");
    expect(verdictOf(0, ["closer", "away"])).toBe("clear");
    expect(verdictOf(0, ["step"])).toBe("clear");
    expect(verdictOf(0, ["goal"])).toBe("lost");
  });
  it("課題2：ゴール＋は目印を飛ばす、目印＋は往復。順番と全部通ったゴールで塞げる", () => {
    expect(verdictOf(1, ["goal", "mark"])).toBe("shortcut");
    expect(verdictOf(1, ["mark"])).toBe("shuttle");
    expect(verdictOf(1, ["finish", "order"])).toBe("clear");
  });
  it("課題3：拭いたら＋は往復。まだ拭いていないマスで塞げる", () => {
    expect(verdictOf(2, ["wipe"])).toBe("shuttle");
    expect(verdictOf(2, ["fresh"])).toBe("clear");
    expect(verdictOf(2, ["wipe", "revisit"])).toBe("clear");
  });
});

describe("挑戦の進み方", () => {
  it("最初は課題1・前の担当者の条件", () => {
    const p = newRewardRun();
    expect(p).toEqual({ task: 0, blocks: ["closer"], trials: 0, records: [] });
    expect(taskIntroNote(0)).toContain("課題1");
  });
  it("条件を足す・外す（課題に無い物・上限より多くは足せない）", () => {
    let p = newRewardRun();
    p = toggleBlock(p, "goal");
    expect(p.blocks).toEqual(["closer", "goal"]);
    p = toggleBlock(p, "closer");
    expect(p.blocks).toEqual(["goal"]);
    expect(toggleBlock(p, "wipe")).toBe(p);
    for (const id of ["away", "step", "wall"] as const) p = toggleBlock(p, id);
    expect(p.blocks).toHaveLength(MAX_BLOCKS);
    expect(toggleBlock(p, "closer")).toBe(p);
    expect(canLearn({ ...p, blocks: [] })).toBe(false);
  });
  it("ズルが残る間はクリアにならず、試行だけ増える", () => {
    const r = learn(newRewardRun());
    expect(r?.outcome).toBe("cheat");
    expect(r?.progress.trials).toBe(1);
    expect(r?.progress.records).toEqual([]);
    expect(learnNote({ verdict: "shuttle", outcome: "cheat", total: 19, blocks: 1, trials: 1 }).warn).toBe(true);
  });
  it("3問をクリアすると結果。得点は条件の数と試行で決まる", () => {
    let p = newRewardRun();
    const r1 = learn(withBlocks(p, ["closer", "goal"]));
    expect(r1?.outcome).toBe("clear");
    expect(r1?.record).toEqual({ blocks: 2, trials: 1, score: 900 });
    p = r1?.progress as RewardProgress;
    expect(isTaskCleared(p)).toBe(true);
    expect(canLearn(p)).toBe(false);
    p = nextTask(p);
    expect(p.task).toBe(1);
    expect(p.blocks).toEqual(["goal", "mark"]);
    p = learn(p)?.progress as RewardProgress;
    p = learn(withBlocks(p, ["finish", "order"]))?.progress as RewardProgress;
    expect(p.records[1]).toEqual({ blocks: 2, trials: 2, score: 750 });
    p = learn(withBlocks(nextTask(p), ["fresh"]))?.progress as RewardProgress;
    expect(isRewardFinished(p)).toBe(true);
    expect(totalScore(p.records)).toBe(900 + 750 + 1000);
    expect(nextTask(p)).toBe(p);
  });
  it("試行の上限までにクリアできなければ失敗、すぐやり直せる", () => {
    let p = newRewardRun();
    let last = null;
    for (let i = 0; i < MAX_TRIALS; i++) {
      last = learn(p);
      p = last?.progress as RewardProgress;
    }
    expect(last?.outcome).toBe("failed");
    expect(isTaskFailed(p)).toBe(true);
    expect(learn(p)).toBeNull();
    expect(learnNote({ verdict: "shuttle", outcome: "failed", total: 1, blocks: 1, trials: 5 }).text).toContain("上限");
    const again = retryTask(p);
    expect(again).toEqual(newRewardRun());
  });
  it("報酬が出る場所と、通った目印", () => {
    const w = worldOf(1);
    const spots = rewardSpots(w, ["goal", "finish", "mark"]);
    expect(spots.get(w.goal)).toBe(20);
    expect(spots.get(w.marks[0])).toBe(3);
    expect(rewardSpots(w, ["step"]).size).toBe(0);
    const path = [w.start, w.marks[1], w.marks[0], w.marks[1]];
    expect(passedMarks(w, path, 1)).toBe(0);
    expect(passedMarks(w, path, 2)).toBe(1);
    expect(passedMarks(w, path, 3)).toBe(2);
  });
  it("報酬の形", () => {
    expect(rewardText(19)).toBe("19");
    expect(rewardText(-0.3)).toBe("−0.3");
    expect(rewardText(8.6)).toBe("8.6");
  });
});

describe("保存（Reward Lab）", () => {
  it("進み具合と最高記録を読み書きできる", () => {
    const save = emptySave();
    save.reward.progress = { task: 1, blocks: ["finish", "order"], trials: 2, records: [{ blocks: 2, trials: 1, score: 900 }] };
    save.reward.best = 2650;
    expect(parseSave(serializeSave(save))).toEqual(save);
  });
  it("クリアして次を待つ・3問を終えた状態も読める", () => {
    const save = emptySave();
    const rec = { blocks: 1, trials: 1, score: 1000 };
    save.reward.progress = { task: 2, blocks: ["fresh"], trials: 1, records: [rec, rec, rec] };
    expect(parseSave(serializeSave(save)).reward.progress).toEqual(save.reward.progress);
  });
  it("おかしな中身は捨て、最高記録は残す", () => {
    for (const progress of [
      { task: 5, blocks: [], trials: 0, records: [] },
      { task: 0, blocks: ["wipe"], trials: 0, records: [] },
      { task: 0, blocks: ["goal", "goal"], trials: 0, records: [] },
      { task: 0, blocks: ["goal"], trials: 9, records: [] },
      { task: 1, blocks: ["goal"], trials: 0, records: [] },
      { task: 1, blocks: ["goal"], trials: 0, records: [{ blocks: 1, trials: 1, score: 5000 }] },
    ]) {
      const s = parseSave(JSON.stringify({ reward: { best: 1200, progress } }));
      expect(s.reward.progress).toBeNull();
      expect(s.reward.best).toBe(1200);
    }
    expect(parseSave(JSON.stringify({ reward: { best: 99999, progress: null } })).reward.best).toBeNull();
  });
  it("前の版（reward が無い）も読める", () => {
    expect(parseSave(JSON.stringify({ golf: { best: 12, progress: null } })).reward).toEqual({ progress: null, best: null });
  });
});
