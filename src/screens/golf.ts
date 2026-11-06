import { applyShot, currentHole, isFinished, newRun, type GolfProgress, type ShotEvent } from "../lib/golf/game";
import { HOLES, TOTAL_PAR, type Hole } from "../lib/golf/holes";
import { barelyMoved, formatLoss, formatLr, holeIntroNote, lossRose, shotNote } from "../lib/golf/note";
import type { Method } from "../lib/golf/optimizer";
import { betterBest, formatDiff, scoreName, totalStrokes } from "../lib/golf/score";
import { lrToSlider, simulateShot, sliderToLr, STEPS_PER_SHOT, type ShotResult } from "../lib/golf/shot";
import type { Vec } from "../lib/golf/vec";
import type { Route } from "../lib/route";
import type { SaveData } from "../lib/save";
import { readSave, saveData } from "../store";
import { el, keycap, prefersReducedMotion, term, type Screen } from "../ui";
import { Board, type Trail } from "./golf-board";
import { LossChart, type LossPoint } from "./golf-chart";

const STEP_MS = 70;
const OB_HOLD_MS = 800;
const ALARM_MS = 600;
const SLIDER_TICKS = 60;

type Overlay = { kind: "clear"; holeNo: number; strokes: number; par: number } | { kind: "result"; newBest: boolean } | null;

interface Anim {
  shot: ShotResult;
  event: ShotEvent;
  next: GolfProgress;
  note: string;
  t0: number;
}

export function createGolf(nav: { go(r: Route): void }): Screen {
  const save: SaveData = readSave();
  let progress: GolfProgress = save.golf.progress ?? newRun();
  // 表示しているホール（クリアの板を出している間は、終えたホールのまま）
  let viewIdx = Math.min(progress.hole, HOLES.length - 1);
  let ball: Vec = isFinished(progress) ? { ...HOLES[viewIdx].cup } : { ...progress.pos };
  let strokes = progress.strokes;
  let trails: Trail[] = [];
  let points: LossPoint[] = [];
  let marks: number[] = [];
  let anim: Anim | null = null;
  let obMark: Vec | null = null;
  let alarmUntil = 0;
  let holdUntil = 0;
  // OB・失敗の後、少しの間だけ打てなくする
  let holding = false;
  // OB の後に玉を戻す所
  let returnTo: Vec | null = null;
  let overlay: Overlay = isFinished(progress) ? { kind: "result", newBest: false } : null;
  let note = isFinished(progress) ? "" : holeIntroNote(viewIdx + 1);
  let noteWarn = false;
  let raf = 0;

  const persist = () => {
    save.golf.progress = progress;
    saveData(save);
  };

  // ---- 上の帯（数字） ----
  const menuBtn = el("button", "btn", [term("MENU", "メニュー")], { type: "button" });
  menuBtn.addEventListener("click", () => nav.go("menu"));
  const numHole = el("span", "num big");
  const numHoleName = el("span", "readout-sub");
  const numStrokes = el("span", "num big");
  const numPar = el("span", "num big");
  const numLimit = el("span", "num big");
  const numLoss = el("span", "num big");
  const readout = (en: string, ja: string, value: HTMLElement, extra?: HTMLElement) =>
    el("div", "readout", [term(en, ja, "label"), el("div", "readout-val", extra ? [value, extra] : [value])]);
  const top = el("header", "golf-top", [
    el("div", "golf-title", [el("div", "btn-wrap", [menuBtn, keycap("Esc")]), el("h1", "game-title", [term("GRADIENT GOLF", "勾配ゴルフ")])]),
    el("div", "readouts", [
      readout("HOLE", "ホール", numHole, numHoleName),
      readout("STROKES", "打数", numStrokes),
      readout("PAR", "パー", numPar),
      readout("LIMIT", "上限", numLimit),
      readout("LOSS", "損失", numLoss),
    ]),
  ]);

  // ---- 盤と損失の折れ線 ----
  const boardCanvas = el("canvas", "board-canvas", [], { "aria-label": "コースの盤" });
  const panel = el("div", "panel", [], { role: "dialog" });
  const boardWrap = el("div", "board", [boardCanvas, panel]);
  const chartCanvas = el("canvas", "chart-canvas", [], { "aria-label": "損失の折れ線" });
  const board = new Board(boardCanvas);
  const chart = new LossChart(chartCanvas);

  // ---- 下の帯（操作） ----
  const slider = el("input", "lr-slider", [], {
    type: "range",
    min: "0",
    max: String(SLIDER_TICKS),
    step: "1",
    "aria-label": "学習率",
  });
  const lrVal = el("span", "num lr-val");
  const gdBtn = el("button", "seg", ["GD"], { type: "button" });
  const momBtn = el("button", "seg", ["Momentum"], { type: "button" });
  const shootBtn = el("button", "btn btn-primary btn-shoot", [term("SHOOT", "打つ")], { type: "button" });
  const noteText = el("span", "note-text");
  const controls = el("footer", "golf-controls", [
    el("div", "ctrl-row", [
      el("div", "ctrl ctrl-lr", [
        term("LEARNING RATE", "学習率 η", "label"),
        el("div", "ctrl-body", [slider, lrVal, keycap("←"), keycap("→")]),
      ]),
      el("div", "ctrl ctrl-opt", [
        term("OPTIMIZER", "最適化手法", "label"),
        el("div", "ctrl-body", [
          el("div", "segs", [el("div", "seg-wrap", [gdBtn, keycap("1")]), el("div", "seg-wrap", [momBtn, keycap("2"), el("span", "beta num", ["β=0.9"])])]),
        ]),
      ]),
      el("div", "ctrl ctrl-shoot", [el("div", "btn-wrap", [shootBtn, keycap("Space")])]),
    ]),
    el("div", "lab-note", [el("span", "label note-label", ["LAB NOTE"]), noteText]),
  ]);

  const root = el("main", "screen golf", [top, boardWrap, el("div", "chart", [chartCanvas]), controls]);

  // ---- 状態から画面へ ----
  function viewHole(): Hole {
    return HOLES[viewIdx];
  }

  function resetSeries(from: Vec): void {
    trails = [];
    points = [{ v: viewHole().loss(from), ob: false }];
    marks = [];
  }

  function busy(): boolean {
    return anim !== null || performance.now() < holdUntil || overlay !== null;
  }

  function syncDom(): void {
    const h = viewHole();
    numHole.textContent = `${h.no}/${HOLES.length}`;
    numHoleName.replaceChildren(term(h.name, h.nameJa));
    numStrokes.textContent = String(strokes);
    numPar.textContent = String(h.par);
    numLimit.textContent = String(h.limit);
    numLoss.textContent = formatLoss(h.loss(ball));
    slider.value = String(Math.round(lrToSlider(progress.lr) * SLIDER_TICKS));
    lrVal.textContent = formatLr(progress.lr);
    gdBtn.classList.toggle("is-on", progress.method === "gd");
    momBtn.classList.toggle("is-on", progress.method === "momentum");
    gdBtn.setAttribute("aria-pressed", String(progress.method === "gd"));
    momBtn.setAttribute("aria-pressed", String(progress.method === "momentum"));
    const locked = busy();
    shootBtn.disabled = locked;
    slider.disabled = anim !== null;
    gdBtn.disabled = anim !== null;
    momBtn.disabled = anim !== null;
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
    boardWrap.classList.toggle("has-result", overlay?.kind === "result");
    if (!overlay) return;
    if (overlay.kind === "clear") {
      const d = overlay.strokes - overlay.par;
      const name = scoreName(overlay.strokes, overlay.par);
      const next = el("button", "btn btn-primary", [term("NEXT HOLE", "次のホールへ")], { type: "button" });
      next.addEventListener("click", nextHole);
      panel.append(
        el("h2", "panel-title is-good", [`HOLE ${overlay.holeNo} CLEAR`]),
        el("p", "panel-sub", ["カップイン"]),
        el("p", "panel-score num", [`${overlay.strokes} 打 ／ PAR ${overlay.par} ／ ${formatDiff(d)}`]),
        el("p", "panel-name", [term(name.en, name.ja)]),
        el("div", "panel-actions", [el("div", "btn-wrap", [next, keycap("Enter")])]),
      );
      next.focus({ preventScroll: true });
      return;
    }
    const cards = progress.cards;
    const head = el("div", "res-row res-head", [
      el("span", "label", ["HOLE"]),
      el("span", "label", ["PAR"]),
      term("STROKES", "打数", "label"),
      el("span", "label", ["±"]),
    ]);
    const rows = HOLES.map((h, i) => {
      const s = cards[i] ?? 0;
      return el("div", "res-row", [
        el("span", "res-hole", [term(`${h.no} ${h.name}`, h.nameJa)]),
        el("span", "num", [String(h.par)]),
        el("span", "num", [String(s)]),
        el("span", "num", [formatDiff(s - h.par)]),
      ]);
    });
    const total = totalStrokes(cards);
    const totalRow = el("div", "res-row res-total", [
      term("TOTAL", "合計", "label"),
      el("span", "num", [String(TOTAL_PAR)]),
      el("span", "num", [String(total)]),
      el("span", "num", [formatDiff(total - TOTAL_PAR)]),
    ]);
    const bestLine = el("p", "res-best", [
      term("BEST", "最高記録", "label"),
      el("span", "num", [save.golf.best === null ? "—" : `${save.golf.best} 打`]),
    ]);
    if (overlay.newBest) bestLine.append(el("span", "new-best", [term("NEW BEST", "記録更新")]));
    const retry = el("button", "btn btn-primary", [term("RETRY", "もう一度")], { type: "button" });
    retry.addEventListener("click", restart);
    const toMenu = el("button", "btn", [term("MENU", "メニューへ")], { type: "button" });
    toMenu.addEventListener("click", () => nav.go("menu"));
    panel.append(
      el("h2", "panel-title", [term("RESULT", "結果")]),
      el("div", "res-table", [head, ...rows, totalRow]),
      bestLine,
      el("div", "panel-actions", [el("div", "btn-wrap", [retry, keycap("Enter")]), el("div", "btn-wrap", [toMenu, keycap("Esc")])]),
    );
    retry.focus({ preventScroll: true });
  }

  function draw(now: number): void {
    let live: { trail: Trail; shown: number } | null = null;
    if (anim) {
      const total = anim.shot.path.length - 1;
      // rAF の時刻は打った時刻より少し前のことがあるので 0 未満にしない
      const shown = prefersReducedMotion() ? total : Math.min(total, Math.max(0, (now - anim.t0) / STEP_MS));
      live = { trail: { path: anim.shot.path, ob: anim.shot.outcome === "ob" }, shown };
      if (shown >= total) finishAnim(now);
    }
    board.draw({ hole: viewHole(), ball, trails, live: anim ? live : null, obMark, alarm: now < alarmUntil });
    chart.draw({
      points: anim ? livePoints(live) : points,
      marks,
      capacity: viewHole().limit * STEPS_PER_SHOT + 1,
      top: viewHole().loss(viewHole().start) * 2,
    });
    if (holding && now >= holdUntil) {
      holding = false;
      obMark = null;
      if (returnTo) ball = returnTo;
      returnTo = null;
      syncDom();
    }
  }

  function livePoints(live: { trail: Trail; shown: number } | null): LossPoint[] {
    if (!anim || !live) return points;
    const n = Math.floor(live.shown);
    const extra = anim.shot.losses.slice(1, n + 1).map((v, i) => ({ v, ob: anim!.shot.outcome === "ob" && i + 1 === anim!.shot.losses.length - 1 }));
    return [...points, ...extra];
  }

  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    draw(now);
  }

  // ---- 操作 ----
  function shoot(): void {
    if (busy()) return;
    const hole = currentHole(progress);
    if (!hole) return;
    const shot = simulateShot(hole, progress.pos, progress.lr, progress.method, progress.strokes);
    const after = applyShot(progress, shot);
    const before = shot.losses[0];
    const endLoss = shot.losses[shot.losses.length - 1];
    const text = shotNote({
      event: after.event,
      lr: progress.lr,
      method: progress.method,
      before,
      after: endLoss,
      rose: lossRose(shot.losses),
      slow: barelyMoved(shot.path, hole.cup),
      limit: hole.limit,
    });
    // 結果は打った時に保存する（動いている途中で離れても、打ち終えた状態から続けられる）
    if (after.event === "finish") save.golf.best = betterBest(save.golf.best, totalStrokes(after.progress.cards));
    progress = after.progress;
    persist();
    anim = { shot, event: after.event, next: after.progress, note: text, t0: performance.now() };
    strokes = after.strokes;
    syncDom();
  }

  let bestBefore: number | null = save.golf.best;

  function finishAnim(now: number): void {
    if (!anim) return;
    const a = anim;
    anim = null;
    const path = a.shot.path;
    marks.push(points.length - 1);
    points = [...points, ...a.shot.losses.slice(1).map((v, i) => ({ v, ob: a.shot.outcome === "ob" && i + 1 === a.shot.losses.length - 1 }))];
    note = a.note;
    noteWarn = false;
    switch (a.event) {
      case "stop":
        trails.push({ path, ob: false });
        ball = { ...path[path.length - 1] };
        break;
      case "ob":
        trails.push({ path, ob: true });
        obMark = { ...path[path.length - 1] };
        holdUntil = now + OB_HOLD_MS;
        holding = true;
        noteWarn = true;
        ball = { ...path[path.length - 1] };
        returnTo = { ...a.next.pos };
        break;
      case "fail": {
        alarmUntil = now + ALARM_MS;
        holdUntil = now + ALARM_MS;
        holding = true;
        noteWarn = true;
        strokes = 0;
        ball = { ...a.next.pos };
        resetSeries(ball);
        break;
      }
      case "cup": {
        trails.push({ path, ob: false });
        ball = { ...path[path.length - 1] };
        const h = viewHole();
        overlay = { kind: "clear", holeNo: h.no, strokes: a.next.cards[a.next.cards.length - 1], par: h.par };
        break;
      }
      case "finish": {
        trails.push({ path, ob: false });
        ball = { ...path[path.length - 1] };
        const total = totalStrokes(a.next.cards);
        overlay = { kind: "result", newBest: bestBefore === null || total < bestBefore };
        bestBefore = save.golf.best;
        break;
      }
    }
    syncDom();
  }

  function nextHole(): void {
    if (overlay?.kind !== "clear") return;
    overlay = null;
    viewIdx = Math.min(progress.hole, HOLES.length - 1);
    ball = { ...progress.pos };
    strokes = progress.strokes;
    resetSeries(ball);
    note = holeIntroNote(viewIdx + 1);
    noteWarn = false;
    persist();
    syncDom();
  }

  function restart(): void {
    progress = newRun(progress.lr, progress.method);
    overlay = null;
    viewIdx = 0;
    ball = { ...progress.pos };
    strokes = 0;
    resetSeries(ball);
    note = holeIntroNote(1);
    noteWarn = false;
    persist();
    syncDom();
  }

  function setLr(lr: number): void {
    if (anim) return;
    progress = { ...progress, lr };
    persist();
    syncDom();
  }

  function setMethod(m: Method): void {
    if (anim) return;
    progress = { ...progress, method: m };
    persist();
    syncDom();
  }

  function nudgeLr(dir: number): void {
    const t = Math.round(lrToSlider(progress.lr) * SLIDER_TICKS) + dir;
    setLr(sliderToLr(Math.min(SLIDER_TICKS, Math.max(0, t)) / SLIDER_TICKS));
  }

  slider.addEventListener("input", () => setLr(sliderToLr(Number(slider.value) / SLIDER_TICKS)));
  gdBtn.addEventListener("click", () => setMethod("gd"));
  momBtn.addEventListener("click", () => setMethod("momentum"));
  shootBtn.addEventListener("click", shoot);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case " ":
      case "Spacebar":
        e.preventDefault();
        if (!e.repeat) shoot();
        break;
      case "Escape":
        e.preventDefault();
        nav.go("menu");
        break;
      case "Enter":
        e.preventDefault();
        if (overlay?.kind === "clear") nextHole();
        else if (overlay?.kind === "result") restart();
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        nudgeLr(-1);
        break;
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        nudgeLr(1);
        break;
      case "1":
        setMethod("gd");
        break;
      case "2":
        setMethod("momentum");
        break;
    }
  };
  // ボタンにフォーカスがある時、Space を離した時のクリックで2回打たないようにする
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Spacebar") e.preventDefault();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  resetSeries(ball);
  syncDom();
  persist();
  raf = requestAnimationFrame(loop);

  return {
    root,
    destroy() {
      cancelAnimationFrame(raf);
      if (anim) finishAnim(performance.now());
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
