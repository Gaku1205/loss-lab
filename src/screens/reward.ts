import { BLOCKS, valueText, type BlockId } from "../lib/reward/blocks";
import { isCheat, repeatSpan, type RepeatSpan } from "../lib/reward/cheat";
import {
  canEdit,
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
  taskOf,
  toggleBlock,
  worldOf,
  type LearnResult,
  type RewardProgress,
} from "../lib/reward/game";
import { LEARN, SAMPLE_EVERY } from "../lib/reward/learn";
import { learnNote, rewardText, taskIntroNote } from "../lib/reward/note";
import { isBetter, totalScore } from "../lib/reward/score";
import { MAX_BLOCKS, MAX_TRIALS, TASKS } from "../lib/reward/tasks";
import type { Route } from "../lib/route";
import type { SaveData } from "../lib/save";
import { readSave, saveData } from "../store";
import { el, keycap, prefersReducedMotion, term, type Screen } from "../ui";
import { RewardBoard } from "./reward-board";
import { RewardChart } from "./reward-chart";

const EPISODE_MS = 8;
const STEP_MS = 80;
const ALARM_MS = 600;

type Overlay = { kind: "clear" } | { kind: "failed" } | { kind: "result"; newBest: boolean } | null;

/** 学習を押した後の様子 */
interface Shown {
  result: LearnResult;
  span: RepeatSpan | null;
  /** 動きを始めた時刻（学び終えた動きまで描き終えたら null） */
  t0: number | null;
}

export function bestText(b: SaveData["reward"]): string {
  return b.best === null ? "—" : `${b.best} 点`;
}

/** メニューで「続きから」にするか */
export function isRewardMidway(p: RewardProgress | null): boolean {
  return p !== null && !isRewardFinished(p) && (p.task > 0 || p.trials > 0);
}

function overlayFor(p: RewardProgress, newBest = false): Overlay {
  if (isRewardFinished(p)) return { kind: "result", newBest };
  if (isTaskCleared(p)) return { kind: "clear" };
  if (isTaskFailed(p)) return { kind: "failed" };
  return null;
}

export function createReward(nav: { go(r: Route): void }): Screen {
  const save: SaveData = readSave();
  let progress: RewardProgress = save.reward.progress ?? newRewardRun();
  let shown: Shown | null = null;
  let overlay: Overlay = overlayFor(progress);
  let note = taskIntroNote(progress.task);
  let noteWarn = false;
  let alarmUntil = 0;
  let raf = 0;

  const persist = () => {
    save.reward.progress = progress;
    saveData(save);
  };
  persist();

  // ---- 上の帯 ----
  const menuBtn = el("button", "btn", [term("MENU", "メニュー")], { type: "button" });
  menuBtn.addEventListener("click", () => nav.go("menu"));
  const numTask = el("span", "num big");
  const numBlocks = el("span", "num big");
  const numTrials = el("span", "num big");
  const numReward = el("span", "num big");
  const numScore = el("span", "num big");
  const readout = (en: string, ja: string, value: HTMLElement) =>
    el("div", "readout", [term(en, ja, "label"), el("div", "readout-val", [value])]);
  const top = el("header", "golf-top", [
    el("div", "golf-title", [el("div", "btn-wrap", [menuBtn, keycap("Esc")]), el("h1", "game-title", [term("REWARD LAB", "報酬設計室")])]),
    el("div", "readouts readouts-reward", [
      readout("TASK", "課題", numTask),
      readout("BLOCKS", "条件", numBlocks),
      readout("TRIALS", "試行", numTrials),
      readout("REWARD", "報酬", numReward),
      readout("SCORE", "得点", numScore),
    ]),
  ]);

  // ---- 盤 ----
  const boardCanvas = el("canvas", "board-canvas", [], { "aria-label": "箱庭" });
  const panel = el("div", "panel", [], { role: "dialog" });
  const boardWrap = el("div", "board rw-board", [boardCanvas, panel]);
  const board = new RewardBoard(boardCanvas);

  // ---- 報酬の推移 ----
  const chartCanvas = el("canvas", "chart-canvas", [], { "aria-label": "報酬の推移" });
  const chartWrap = el("div", "chart", [chartCanvas]);
  const chart = new RewardChart(chartCanvas);

  // ---- 下の帯：棚と学習 ----
  const shelfCount = el("span", "num shelf-count");
  const shelf = el("div", "rw-blocks");
  const learnBtn = el("button", "btn btn-primary btn-reward btn-shoot", [term("LEARN", "学習")], { type: "button" });
  learnBtn.addEventListener("click", doLearn);
  const noteText = el("span", "note-text");
  const controls = el("footer", "golf-controls rw-controls", [
    el("div", "rw-row", [
      el("div", "rw-shelf", [el("div", "rw-shelf-head", [term("REWARD BLOCKS", "報酬の条件", "label"), shelfCount]), shelf]),
      el("div", "rw-learn", [el("div", "btn-wrap", [learnBtn, keycap("Space")])]),
    ]),
    el("div", "lab-note", [el("span", "label note-label", ["LAB NOTE"]), noteText]),
  ]);

  const root = el("main", "screen golf reward", [top, boardWrap, chartWrap, controls]);

  function busy(): boolean {
    return shown !== null && shown.t0 !== null;
  }

  // ---- 状態から画面へ ----
  let shelfKey = "";
  function syncDom(): void {
    const task = taskOf(progress);
    numTask.textContent = `${progress.task + 1}/${TASKS.length}`;
    numBlocks.textContent = `${progress.blocks.length}/${MAX_BLOCKS}`;
    numTrials.textContent = `${progress.trials}/${MAX_TRIALS}`;
    numTrials.classList.toggle("is-warn", progress.trials >= MAX_TRIALS && !isTaskCleared(progress));
    numReward.textContent = shown && shown.t0 === null ? rewardText(shown.result.training.final.total) : "—";
    numScore.textContent = String(totalScore(progress.records));
    shelfCount.textContent = `${progress.blocks.length}/${MAX_BLOCKS}`;

    const editable = canEdit(progress) && !busy() && overlay === null;
    const key = `${progress.task}:${progress.blocks.join(",")}:${editable}`;
    if (key !== shelfKey) {
      shelfKey = key;
      shelf.replaceChildren(
        ...task.palette.map((id, i) => {
          const b = BLOCKS[id];
          const on = progress.blocks.includes(id);
          const full = !on && progress.blocks.length >= MAX_BLOCKS;
          const btn = el(
            "button",
            `rw-block${on ? " is-on" : ""}`,
            [
              el("span", "rw-check", [], { "aria-hidden": "true" }),
              el("span", "rw-block-body", [
                el("span", "rw-cond", [b.ja]),
                el("span", "rw-block-foot", [el("span", "rw-block-en", [b.en]), el("span", "num rw-val", [valueText(b.value)])]),
              ]),
            ],
            { type: "button", "aria-pressed": String(on), "aria-label": `${i + 1}：${b.ja} ${valueText(b.value)}` },
          );
          btn.disabled = !editable || full;
          btn.addEventListener("click", () => toggle(id));
          return el("div", "rw-block-wrap", [btn, keycap(String(i + 1))]);
        }),
      );
    }
    learnBtn.disabled = !canLearn(progress) || busy() || overlay !== null;
    noteText.textContent = note;
    noteText.classList.toggle("is-warn", noteWarn);
    renderPanel();
  }

  let panelKey = "";
  function renderPanel(): void {
    const key = JSON.stringify(overlay);
    if (key === panelKey) return;
    panelKey = key;
    panel.replaceChildren();
    panel.classList.toggle("is-open", overlay !== null);
    boardWrap.classList.toggle("has-panel", overlay !== null);
    if (!overlay) return;
    const toMenu = () => {
      const b = el("button", "btn", [term("MENU", "メニューへ")], { type: "button" });
      b.addEventListener("click", () => nav.go("menu"));
      return el("div", "btn-wrap", [b, keycap("Esc")]);
    };
    const primary = (en: string, ja: string) => {
      const b = el("button", "btn btn-primary btn-reward", [term(en, ja)], { type: "button" });
      b.addEventListener("click", proceed);
      return b;
    };
    let btn: HTMLButtonElement;
    const n = progress.task + 1;
    if (overlay.kind === "clear") {
      const rec = progress.records[progress.task];
      btn = primary("NEXT TASK", "次の課題へ");
      panel.append(
        el("h2", "panel-title is-good", [`TASK ${n} CLEAR`]),
        el("p", "panel-sub", ["ズルなしで達成"]),
        el("p", "panel-score num", [`BLOCKS ${rec.blocks} ／ TRIALS ${rec.trials} ／ ${rec.score} 点`]),
        el("div", "panel-actions", [el("div", "btn-wrap", [btn, keycap("Enter")])]),
      );
    } else if (overlay.kind === "failed") {
      btn = primary("RETRY TASK", "この課題をやり直す");
      panel.append(
        el("h2", "panel-title is-bad", [`TASK ${n} FAILED`]),
        el("p", "panel-sub", ["試行が上限に達した"]),
        el("div", "panel-actions", [el("div", "btn-wrap", [btn, keycap("Enter")]), toMenu()]),
      );
    } else {
      btn = primary("RETRY", "もう一度");
      const head = el("div", "res-row rw-res-row res-head", [
        term("TASK", "課題", "label"),
        term("BLOCKS", "条件", "label"),
        term("TRIALS", "試行", "label"),
        term("SCORE", "得点", "label"),
      ]);
      const rows = TASKS.map((t, i) => {
        const r = progress.records[i];
        return el("div", "res-row rw-res-row", [
          el("span", "res-hole", [term(`${t.no} ${t.en}`, t.ja)]),
          el("span", "num", [String(r?.blocks ?? "—")]),
          el("span", "num", [String(r?.trials ?? "—")]),
          el("span", "num", [String(r?.score ?? "—")]),
        ]);
      });
      const total = el("div", "res-row rw-res-row res-total", [
        term("TOTAL", "合計", "label"),
        el("span", "num", [String(progress.records.reduce((s, r) => s + r.blocks, 0))]),
        el("span", "num", [String(progress.records.reduce((s, r) => s + r.trials, 0))]),
        el("span", "num", [String(totalScore(progress.records))]),
      ]);
      const bestLine = el("p", "res-best", [term("BEST", "最高記録", "label"), el("span", "num", [bestText(save.reward)])]);
      if (overlay.newBest) bestLine.append(el("span", "new-best", [term("NEW BEST", "記録更新")]));
      panel.append(
        el("h2", "panel-title", [term("RESULT", "結果")]),
        el("div", "res-table", [head, ...rows, total]),
        bestLine,
        el("div", "panel-actions", [el("div", "btn-wrap", [btn, keycap("Enter")]), toMenu()]),
      );
    }
    btn.focus({ preventScroll: true });
  }

  function draw(now: number): void {
    const world = worldOf(Math.min(progress.task, TASKS.length - 1));
    const task = taskOf(progress);
    let returnsShown = 0;
    let samples: number[][] = [];
    let final: { path: number[]; shown: number } | null = null;
    let episode: string | null = null;
    let cheat: RepeatSpan | null = null;
    if (shown) {
      const tr = shown.result.training;
      const trainMs = LEARN.episodes * EPISODE_MS;
      const t = shown.t0 === null || prefersReducedMotion() ? Number.POSITIVE_INFINITY : Math.max(0, now - shown.t0);
      returnsShown = Math.min(LEARN.episodes, Math.floor(t / EPISODE_MS));
      samples = tr.samples.filter((_, k) => (k + 1) * SAMPLE_EVERY <= returnsShown).map((e) => e.path);
      if (t < trainMs) episode = `EPISODE ${Math.max(1, returnsShown)}/${LEARN.episodes}`;
      else {
        const steps = tr.final.path.length - 1;
        const s = Math.min(steps, (t - trainMs) / STEP_MS);
        final = { path: tr.final.path, shown: s };
        cheat = shown.span;
        if (s >= steps && shown.t0 !== null) finishLearn(now);
      }
    }
    chart.draw(shown ? shown.result.training.returns : [], returnsShown);
    board.draw({
      world,
      taskNo: task.no,
      taskEn: task.en,
      taskJa: task.ja,
      spots: rewardSpots(world, progress.blocks),
      samples,
      final,
      cheat,
      passed: final ? passedMarks(world, final.path, Math.floor(final.shown)) : 0,
      episode,
      alarm: now < alarmUntil,
    });
  }

  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    draw(now);
  }

  // ---- 操作 ----
  function toggle(id: BlockId): void {
    if (busy() || overlay) return;
    const next = toggleBlock(progress, id);
    if (next === progress) return;
    progress = next;
    persist();
    syncDom();
  }

  function doLearn(): void {
    if (busy() || overlay) return;
    const res = learn(progress);
    if (!res) return;
    progress = res.progress;
    const v = res.verdict;
    const span = isCheat(v) && v !== "shortcut" && v !== "farm" ? repeatSpan(res.training.final.path) : null;
    shown = { result: res, span, t0: performance.now() };
    // 学習の途中で離れても、次に開くとこの学習を終えた状態から
    let newBest = false;
    if (isRewardFinished(progress)) {
      const total = totalScore(progress.records);
      newBest = isBetter(total, save.reward.best);
      if (newBest) save.reward.best = total;
    }
    pendingBest = newBest;
    persist();
    noteWarn = false;
    syncDom();
  }

  let pendingBest = false;
  function finishLearn(now: number): void {
    if (!shown || shown.t0 === null) return;
    shown.t0 = null;
    const res = shown.result;
    const n = learnNote({
      verdict: res.verdict,
      outcome: res.outcome,
      total: res.training.final.total,
      blocks: progress.blocks.length,
      trials: progress.trials,
    });
    note = n.text;
    noteWarn = n.warn;
    if (res.outcome === "cheat" || res.outcome === "failed") alarmUntil = now + ALARM_MS;
    overlay = overlayFor(progress, pendingBest);
    syncDom();
  }

  function startTask(p: RewardProgress): void {
    progress = p;
    shown = null;
    overlay = null;
    note = taskIntroNote(progress.task);
    noteWarn = false;
    persist();
    syncDom();
  }

  function proceed(): void {
    if (!overlay) return;
    if (overlay.kind === "clear") startTask(nextTask(progress));
    else if (overlay.kind === "failed") startTask(retryTask(progress));
    else startTask(newRewardRun());
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      nav.go("menu");
      return;
    }
    if (e.key === "Enter") {
      // ボタンにフォーカスがある時の Enter は、そのボタンを押したことにする
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (!e.repeat) proceed();
      return;
    }
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) doLearn();
      return;
    }
    const k = Number(e.key);
    if (Number.isInteger(k) && k >= 1 && !e.repeat) {
      const id = taskOf(progress).palette[k - 1];
      if (id) toggle(id);
    }
  };
  // ボタンにフォーカスがある時、Space を離した時のクリックで、条件を外したり2回学習したりしないようにする
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " " || e.code === "Space") e.preventDefault();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  syncDom();
  raf = requestAnimationFrame(loop);

  return {
    root,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
