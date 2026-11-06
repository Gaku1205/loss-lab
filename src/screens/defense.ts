import { applyWave, betterDefenseBest, isDefenseFinished, isOverfit, newDefense, testPercent, trainPercent, type DefenseProgress } from "../lib/defense/game";
import { pick, place, remaining, removeAt, type Kind, type Neuron } from "../lib/defense/model";
import { waveIntroNote, waveNote } from "../lib/defense/note";
import { isTestWave, LIFE, pointAt, runWave, WAVES, wavePoints, type WaveRun } from "../lib/defense/wave";
import type { Cls, DataPoint } from "../lib/defense/data";
import { formatDiff } from "../lib/golf/score";
import type { Vec } from "../lib/golf/vec";
import type { Route } from "../lib/route";
import type { SaveData } from "../lib/save";
import { isLast, nextCard, prevCard } from "../lib/howto";
import { readHowtoSeen, readSave, saveData, saveHowtoSeen } from "../store";
import { el, keycap, prefersReducedMotion, term, type Screen } from "../ui";
import { DefenseBoard, type DotView } from "./defense-board";
import { buildHowto, DEFENSE_HOWTO } from "./howto";

const ALARM_MS = 600;
/** 置いたニューロンを押して外せる距離（画面の px） */
const PICK_PX = 14;

interface Tool {
  kind: Kind;
  cls: Cls;
  key: string;
}

const TOOLS: readonly Tool[] = [
  { kind: "wide", cls: "a", key: "1" },
  { kind: "wide", cls: "b", key: "2" },
  { kind: "narrow", cls: "a", key: "3" },
  { kind: "narrow", cls: "b", key: "4" },
];

const HOWTO_GAME = "defense";

type Overlay =
  | { kind: "howto"; index: number }
  | { kind: "clear"; wave: number; hits: number; total: number; life: number }
  | { kind: "fail"; wave: number; trainPct: number; testPct: number }
  | { kind: "result"; trainPct: number; testPct: number; newBest: boolean }
  | null;

interface Running {
  wave: number;
  pts: readonly DataPoint[];
  run: WaveRun;
  t0: number;
  /** 判定を済ませた着いた点の数（run.arrivals の前から） */
  applied: number;
}

export function createDefense(nav: { go(r: Route): void }): Screen {
  const save: SaveData = readSave();
  let progress: DefenseProgress = save.defense.progress ?? newDefense();
  let tool = 0;
  let running: Running | null = null;
  /** 最後に流した波の、着いた点の判定（波が終わっても次の置く時間まで残す） */
  let landed: Map<number, DotView> = new Map();
  let life = LIFE;
  let misses = 0;
  let arrived = 0;
  let lastTestPct: number | null = null;
  let hover: Vec | null = null;
  let alarmUntil = 0;
  let note = "";
  let noteWarn = false;
  let overlay: Overlay = null;
  let raf = 0;
  let howtoSeen = readHowtoSeen(HOWTO_GAME);

  if (isDefenseFinished(progress)) {
    const tr = trainPercent(progress.neurons);
    const te = testPercent(progress.neurons);
    lastTestPct = te;
    overlay = { kind: "result", trainPct: tr, testPct: te, newBest: false };
    note = waveNote({ event: "finish", wave: WAVES.length - 1, misses: 0, trainPct: tr, testPct: te }).text;
  } else {
    note = waveIntroNote(progress.wave);
    // 初めて開いた時だけ遊び方の板を自動で出す（結果の板から始まる時は出さない）
    if (!howtoSeen) overlay = { kind: "howto", index: 0 };
  }

  const persist = () => {
    save.defense.progress = progress;
    saveData(save);
  };

  // ---- 上の帯（数字） ----
  const menuBtn = el("button", "btn", [term("MENU", "メニュー")], { type: "button" });
  menuBtn.addEventListener("click", () => nav.go("menu"));
  const helpBtn = el("button", "btn btn-help num", ["?"], { type: "button", "aria-label": "遊び方" });
  helpBtn.addEventListener("click", () => openHowto());
  const numWave = el("span", "num big");
  const numWaveKind = el("span", "readout-sub");
  const numPoints = el("span", "num big");
  const numMisses = el("span", "num big");
  const numTrain = el("span", "num big");
  const numTest = el("span", "num big");
  const readout = (en: string, ja: string, value: HTMLElement, extra?: HTMLElement) =>
    el("div", "readout", [term(en, ja, "label"), el("div", "readout-val", extra ? [value, extra] : [value])]);
  const top = el("header", "golf-top", [
    el("div", "golf-title", [
      el("div", "title-btns", [el("div", "btn-wrap", [menuBtn, keycap("Esc")]), el("div", "btn-wrap", [helpBtn, keycap("H")])]),
      el("h1", "game-title", [term("BOUNDARY DEFENSE", "境界防衛線")]),
    ]),
    el("div", "readouts readouts-defense", [
      readout("WAVE", "ウェーブ", numWave, numWaveKind),
      readout("POINTS", "点", numPoints),
      readout("MISSES", "誤り", numMisses),
      readout("TRAIN ACC", "練習の正解率", numTrain),
      readout("TEST ACC", "テストの正解率", numTest),
    ]),
  ]);

  // ---- 盤 ----
  const boardCanvas = el("canvas", "board-canvas", [], { "aria-label": "境界防衛線の盤" });
  const panel = el("div", "panel", [], { role: "dialog" });
  const boardWrap = el("div", "board def-board", [boardCanvas, panel]);
  const board = new DefenseBoard(boardCanvas);

  // ---- 棚 ----
  const lifeCells = Array.from({ length: LIFE }, () => el("span", "life-cell"));
  const lifeNum = el("span", "num life-num");
  const toolBtns = TOOLS.map((t, i) => {
    const count = el("span", "num tool-count");
    const btn = el(
      "button",
      "tool",
      [el("span", `mark mark-${t.cls}`), term(t.kind === "wide" ? "WIDE" : "NARROW", t.kind === "wide" ? "広い" : "狭い"), count],
      { type: "button", "aria-label": `${t.kind === "wide" ? "WIDE" : "NARROW"} ${t.cls === "a" ? "○" : "●"}` },
    );
    btn.addEventListener("click", () => selectTool(i));
    return { btn, count, wrap: el("div", "tool-wrap", [btn, keycap(t.key)]) };
  });
  const clearBtn = el("button", "btn", [term("CLEAR", "全部外す")], { type: "button" });
  clearBtn.addEventListener("click", clearAll);
  const legend = el("ul", "legend", [
    el("li", "", [el("span", "swatch swatch-a"), "○ の陣地"]),
    el("li", "", [el("span", "swatch swatch-b"), "● の陣地"]),
    el("li", "", [el("span", "swatch swatch-gap"), "すき間（すり抜ける）"]),
  ]);
  const shelf = el("aside", "shelf", [
    el("section", "shelf-sec", [term("LIFE", "ライフ", "label"), el("div", "life-row", [el("div", "life-cells", lifeCells), lifeNum])]),
    el("section", "shelf-sec", [
      term("NEURONS", "ニューロン", "label"),
      el("div", "tools", toolBtns.map((t) => t.wrap)),
      el("p", "shelf-hint", ["盤を押すと置く。置いたニューロンを押すと外す。"]),
      el("div", "btn-wrap", [clearBtn, keycap("C")]),
    ]),
    el("section", "shelf-sec", [legend]),
  ]);

  // ---- 下の帯（操作） ----
  const startBtn = el("button", "btn btn-primary btn-shoot btn-def", [term("START WAVE", "ウェーブ開始")], { type: "button" });
  startBtn.addEventListener("click", startWave);
  const noteText = el("span", "note-text");
  const controls = el("footer", "golf-controls def-controls", [
    el("div", "lab-note", [el("span", "label note-label", ["LAB NOTE"]), noteText]),
    el("div", "btn-wrap def-start", [startBtn, keycap("Space")]),
  ]);

  const root = el("main", "screen golf defense", [top, el("div", "def-mid", [boardWrap, shelf]), controls]);

  // ---- 状態から画面へ ----
  function shownWave(): number {
    if (running) return running.wave;
    return Math.min(progress.wave, WAVES.length - 1);
  }

  function building(): boolean {
    return running === null && overlay === null && !isDefenseFinished(progress);
  }

  function syncDom(): void {
    const w = shownWave();
    numWave.textContent = `${w + 1}/${WAVES.length}`;
    numWaveKind.replaceChildren(isTestWave(w) ? term("TEST", "テスト") : term("TRAIN", "練習"));
    numPoints.textContent = `${arrived}/${wavePoints(w).length}`;
    numMisses.textContent = String(misses);
    numMisses.classList.toggle("is-warn", misses > 0);
    numTrain.textContent = `${trainPercent(progress.neurons)}%`;
    numTest.textContent = lastTestPct === null ? "—" : `${lastTestPct}%`;
    lifeCells.forEach((c, i) => c.classList.toggle("is-on", i < life));
    lifeNum.textContent = `${life}/${LIFE}`;
    const canBuild = building();
    toolBtns.forEach((t, i) => {
      const n = remaining(progress.neurons, TOOLS[i].kind);
      t.count.textContent = `×${n}`;
      t.btn.classList.toggle("is-on", i === tool);
      t.btn.setAttribute("aria-pressed", String(i === tool));
      t.btn.disabled = !canBuild;
    });
    clearBtn.disabled = !canBuild || progress.neurons.length === 0;
    startBtn.disabled = !canBuild;
    helpBtn.disabled = !canOpenHowto();
    boardCanvas.classList.toggle("is-building", canBuild);
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
    if (overlay.kind === "howto") {
      panel.append(
        ...buildHowto(DEFENSE_HOWTO, { index: overlay.index, count: DEFENSE_HOWTO.length }, { onNext: howtoNext, onBack: howtoBack, onClose: closeHowto }),
      );
      return;
    }
    const toMenu = () => {
      const b = el("button", "btn", [term("MENU", "メニューへ")], { type: "button" });
      b.addEventListener("click", () => nav.go("menu"));
      return el("div", "btn-wrap", [b, keycap("Esc")]);
    };
    const accRows = (tr: number, te: number) => [
      el("div", "acc-row", [term("TRAIN ACC", "練習の正解率", "label"), el("span", "num", [`${tr}%`])]),
      el("div", "acc-row", [term("TEST ACC", "テストの正解率", "label"), el("span", "num", [`${te}%`])]),
    ];
    if (overlay.kind === "clear") {
      const next = el("button", "btn btn-primary btn-def", [term("NEXT WAVE", "次の波へ")], { type: "button" });
      next.addEventListener("click", closePanel);
      panel.append(
        el("h2", "panel-title is-good", [`WAVE ${overlay.wave + 1} CLEAR`]),
        el("p", "panel-sub", ["守り切った"]),
        el("p", "panel-score num", [`${overlay.hits} / ${overlay.total} 正解 ／ LIFE ${overlay.life}`]),
        el("div", "panel-actions", [el("div", "btn-wrap", [next, keycap("Enter")])]),
      );
      next.focus({ preventScroll: true });
      return;
    }
    if (overlay.kind === "fail") {
      const retry = el("button", "btn btn-primary btn-def", [term("RETRY WAVE", "この波をやり直す")], { type: "button" });
      retry.addEventListener("click", closePanel);
      panel.append(el("h2", "panel-title is-bad", [`WAVE ${overlay.wave + 1} FAILED`]), el("p", "panel-sub", ["ライフが尽きた"]));
      if (isTestWave(overlay.wave)) {
        const t = el("div", "acc-table", accRows(overlay.trainPct, overlay.testPct));
        panel.append(t);
        if (isOverfit(overlay.trainPct, overlay.testPct)) panel.append(el("p", "overfit", [term("OVERFIT", "過学習")]));
      }
      panel.append(el("div", "panel-actions", [el("div", "btn-wrap", [retry, keycap("Enter")]), toMenu()]));
      retry.focus({ preventScroll: true });
      return;
    }
    const gap = el("div", "acc-row", [term("GAP", "差", "label"), el("span", "num", [formatDiff(overlay.trainPct - overlay.testPct)])]);
    const bestLine = el("p", "res-best", [
      term("BEST", "最高記録", "label"),
      el("span", "num", [save.defense.best === null ? "—" : `${save.defense.best}%`]),
    ]);
    if (overlay.newBest) bestLine.append(el("span", "new-best", [term("NEW BEST", "記録更新")]));
    const retry = el("button", "btn btn-primary btn-def", [term("RETRY", "もう一度")], { type: "button" });
    retry.addEventListener("click", restart);
    panel.append(
      el("h2", "panel-title", [term("RESULT", "結果")]),
      el("div", "acc-table", [...accRows(overlay.trainPct, overlay.testPct), gap]),
      bestLine,
      el("div", "panel-actions", [el("div", "btn-wrap", [retry, keycap("Enter")]), toMenu()]),
    );
    retry.focus({ preventScroll: true });
  }

  function ghost(): Neuron | null {
    if (!hover || !building()) return null;
    const t = TOOLS[tool];
    if (remaining(progress.neurons, t.kind) <= 0) return null;
    if (pick(progress.neurons, hover, PICK_PX / board.scale) >= 0) return null;
    return { x: hover.x, y: hover.y, kind: t.kind, cls: t.cls };
  }

  function draw(now: number): void {
    if (running) advance(now);
    const dots: DotView[] = [];
    let preview: DotView[] = [];
    if (running) {
      const r = running;
      const t = prefersReducedMotion() ? Number.POSITIVE_INFINITY : now - r.t0;
      r.pts.forEach((pt, i) => {
        const done = landed.get(i);
        if (done) return;
        const p = pointAt(i, pt, t);
        if (p) dots.push({ p, cls: pt.cls, judge: null });
      });
    } else if (building() && !isTestWave(progress.wave)) {
      preview = wavePoints(progress.wave).map((pt) => ({ p: pt, cls: pt.cls, judge: null }));
    }
    dots.push(...landed.values());
    board.draw({ neurons: progress.neurons, ghost: ghost(), preview, dots, alarm: now < alarmUntil });
  }

  /** 時刻 now までに着いた点を判定する */
  function advance(now: number): void {
    const r = running;
    if (!r) return;
    const t = prefersReducedMotion() ? Number.POSITIVE_INFINITY : now - r.t0;
    let changed = false;
    while (r.applied < r.run.arrivals.length && r.run.arrivals[r.applied].t <= t) {
      const a = r.run.arrivals[r.applied];
      const pt = r.pts[a.index];
      landed.set(a.index, { p: { x: pt.x, y: pt.y }, cls: pt.cls, judge: a.judge });
      life = a.life;
      arrived++;
      if (a.judge !== "hit") misses++;
      r.applied++;
      changed = true;
    }
    if (r.applied >= r.run.arrivals.length) finishWave(now);
    else if (changed) syncDom();
  }

  function finishWave(now: number): void {
    const r = running;
    if (!r) return;
    running = null;
    const after = applyWave(progress, r.run);
    const tr = trainPercent(progress.neurons);
    const te = testPercent(progress.neurons);
    if (isTestWave(r.wave)) lastTestPct = te;
    const n = waveNote({ event: after.event, wave: r.wave, misses: r.run.misses, trainPct: tr, testPct: te });
    note = n.text;
    noteWarn = n.warn;
    if (after.event === "fail") {
      alarmUntil = now + ALARM_MS;
      overlay = { kind: "fail", wave: r.wave, trainPct: tr, testPct: te };
    } else if (after.event === "clear") {
      overlay = { kind: "clear", wave: r.wave, hits: r.run.hits, total: r.pts.length, life: r.run.arrivals[r.run.arrivals.length - 1]?.life ?? LIFE };
    } else {
      const before = save.defense.best;
      save.defense.best = betterDefenseBest(before, te);
      overlay = { kind: "result", trainPct: tr, testPct: te, newBest: before === null || te > before };
    }
    progress = after.progress;
    persist();
    syncDom();
  }

  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    draw(now);
  }

  // ---- 操作 ----
  function resetWaveView(): void {
    landed = new Map();
    life = LIFE;
    misses = 0;
    arrived = 0;
  }

  function startWave(): void {
    if (!building()) return;
    const w = progress.wave;
    const pts = wavePoints(w);
    resetWaveView();
    running = { wave: w, pts, run: runWave(progress.neurons, pts), t0: performance.now(), applied: 0 };
    noteWarn = false;
    syncDom();
  }

  function closePanel(): void {
    if (overlay?.kind !== "clear" && overlay?.kind !== "fail") return;
    overlay = null;
    resetWaveView();
    note = waveIntroNote(progress.wave);
    noteWarn = false;
    syncDom();
  }

  /** 遊び方の板を開けるのは、波が流れていなくて他の板が出ていない間だけ */
  function canOpenHowto(): boolean {
    return running === null && overlay === null;
  }

  function openHowto(): void {
    if (!canOpenHowto()) return;
    overlay = { kind: "howto", index: 0 };
    syncDom();
  }

  /** 閉じたら既読にする（開き直しでは状態を変えない） */
  function closeHowto(): void {
    if (overlay?.kind !== "howto") return;
    overlay = null;
    if (!howtoSeen) {
      howtoSeen = true;
      saveHowtoSeen(HOWTO_GAME);
    }
    syncDom();
  }

  function howtoStep(dir: 1 | -1): void {
    if (overlay?.kind !== "howto") return;
    const p = { index: overlay.index, count: DEFENSE_HOWTO.length };
    overlay = { kind: "howto", index: (dir === 1 ? nextCard(p) : prevCard(p)).index };
    syncDom();
  }
  const howtoNext = () => howtoStep(1);
  const howtoBack = () => howtoStep(-1);

  function restart(): void {
    if (overlay?.kind !== "result") return;
    progress = newDefense();
    overlay = null;
    lastTestPct = null;
    resetWaveView();
    note = waveIntroNote(0);
    noteWarn = false;
    persist();
    syncDom();
  }

  function selectTool(i: number): void {
    if (!building()) return;
    tool = i;
    syncDom();
  }

  function clearAll(): void {
    if (!building() || progress.neurons.length === 0) return;
    progress = { ...progress, neurons: [] };
    persist();
    syncDom();
  }

  function setNeurons(list: Neuron[]): void {
    progress = { ...progress, neurons: list };
    persist();
    syncDom();
  }

  function boardPoint(e: PointerEvent): Vec {
    const r = boardCanvas.getBoundingClientRect();
    return board.toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  boardCanvas.addEventListener("pointerdown", (e) => {
    if (!building() || e.button !== 0) return;
    const p = boardPoint(e);
    const hit = pick(progress.neurons, p, PICK_PX / board.scale);
    if (hit >= 0) {
      setNeurons(removeAt(progress.neurons, hit));
      return;
    }
    const t = TOOLS[tool];
    const next = place(progress.neurons, { x: round3(p.x), y: round3(p.y), kind: t.kind, cls: t.cls });
    if (next) setNeurons(next);
  });
  boardCanvas.addEventListener("pointermove", (e) => {
    hover = e.pointerType === "mouse" ? boardPoint(e) : null;
  });
  boardCanvas.addEventListener("pointerleave", () => {
    hover = null;
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // 遊び方の板が出ている間は、板の操作だけ受け付ける
    if (overlay?.kind === "howto") {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeHowto();
          break;
        case "Enter":
          e.preventDefault();
          if (isLast({ index: overlay.index, count: DEFENSE_HOWTO.length })) closeHowto();
          else howtoNext();
          break;
        case "ArrowRight":
          e.preventDefault();
          howtoNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          howtoBack();
          break;
        case " ":
        case "Spacebar":
        case "ArrowUp":
        case "ArrowDown":
          e.preventDefault();
          break;
      }
      return;
    }
    switch (e.key) {
      case "h":
      case "H":
        if (!e.repeat) openHowto();
        break;
      case " ":
      case "Spacebar":
        e.preventDefault();
        if (!e.repeat) startWave();
        break;
      case "Escape":
        e.preventDefault();
        nav.go("menu");
        break;
      case "Enter":
        e.preventDefault();
        if (overlay?.kind === "result") restart();
        else closePanel();
        break;
      case "1":
      case "2":
      case "3":
      case "4":
        selectTool(Number(e.key) - 1);
        break;
      case "c":
      case "C":
        clearAll();
        break;
    }
  };
  // ボタンにフォーカスがある時、Space を離した時のクリックで2回押さないようにする
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Spacebar") e.preventDefault();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  syncDom();
  persist();
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

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
