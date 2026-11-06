import { applyShot, currentHole, isFinished, newRun, type GolfProgress, type ShotEvent } from "../lib/golf/game";
import { HOLES, TOTAL_PAR, type Hole } from "../lib/golf/holes";
import { barelyMoved, formatLoss, formatLr, holeIntroNote, lossRose, shotNote } from "../lib/golf/note";
import type { Method } from "../lib/golf/optimizer";
import { betterBest, formatDiff, scoreName, totalStrokes } from "../lib/golf/score";
import { lrToSlider, simulateShot, sliderToLr, STEPS_PER_SHOT, type ShotResult } from "../lib/golf/shot";
import type { Vec } from "../lib/golf/vec";
import { envConfig, submitScore, validateCode, validateNickname } from "../lib/board";
import type { Route } from "../lib/route";
import type { SaveData } from "../lib/save";
import { isLast, nextCard, prevCard } from "../lib/howto";
import { readHowtoSeen, readSave, readSoundOn, saveData, saveHowtoSeen, saveSoundOn } from "../store";
import { el, keycap, prefersReducedMotion, term, type Screen } from "../ui";
import { OFFLINE_TEXT, textField } from "./board-ui";
import { Board, type Trail } from "./golf-board";
import { LossChart, type LossPoint } from "./golf-chart";
import { GolfSound } from "./golf-sound";
import { buildHowto, GOLF_HOWTO } from "./howto";

const STEP_MS = 70;
const OB_HOLD_MS = 800;
const ALARM_MS = 600;
const SLIDER_TICKS = 60;
const HOWTO_GAME = "golf";

type Overlay =
  | { kind: "clear"; holeNo: number; strokes: number; par: number }
  | { kind: "result"; newBest: boolean }
  | { kind: "howto"; index: number }
  | null;

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
  // 初めて開いた時だけ遊び方の板を自動で出す（結果の板から始まる時は出さない）
  let howtoSeen = readHowtoSeen(HOWTO_GAME);
  let overlay: Overlay = isFinished(progress) ? { kind: "result", newBest: false } : howtoSeen ? null : { kind: "howto", index: 0 };
  let note = isFinished(progress) ? "" : holeIntroNote(viewIdx + 1);
  let noteWarn = false;
  let raf = 0;
  const sound = new GolfSound(readSoundOn());
  // 打つ前だけの立体表示。保存しない（打つ・ホールが変わると上からに戻る）
  let view3d = false;

  const persist = () => {
    save.golf.progress = progress;
    saveData(save);
  };

  // ---- 上の帯（数字） ----
  const menuBtn = el("button", "btn", [term("MENU", "メニュー")], { type: "button" });
  menuBtn.addEventListener("click", () => nav.go("menu"));
  const helpBtn = el("button", "btn btn-help num", ["?"], { type: "button", "aria-label": "遊び方" });
  helpBtn.addEventListener("click", () => openHowto());
  const numHole = el("span", "num");
  const numHoleName = el("span", "hole-name");
  const numStrokes = el("span", "num big-a");
  const numPar = el("span", "num");
  const numLimit = el("span", "num");
  const numLoss = el("span", "num big-a");
  const numCup = el("span", "num big-a");
  const readout = (en: string, ja: string, value: HTMLElement) =>
    el("div", "readout", [term(en, ja, "label"), el("div", "readout-val", [value])]);
  const chartCanvas = el("canvas", "chart-canvas", [], { "aria-label": "打つごとの損失の折れ線" });
  const top = el("header", "golf-top golf-top-a", [
    el("div", "golf-title", [
      el("div", "title-btns", [el("div", "btn-wrap", [menuBtn, keycap("Esc")]), el("div", "btn-wrap", [helpBtn, keycap("H")])]),
      el("div", "golf-name", [
        el("h1", "game-title", [term("GRADIENT GOLF", "勾配ゴルフ")]),
        el("p", "hole-line", [
          term("HOLE", "ホール"),
          numHole,
          numHoleName,
          term("PAR", "パー"),
          numPar,
          term("LIMIT", "上限"),
          numLimit,
        ]),
      ]),
    ]),
    el("div", "readouts readouts-golf", [readout("STROKES", "打数", numStrokes), readout("LOSS", "損失", numLoss), readout("TO CUP", "カップまで", numCup)]),
    el("div", "spark", [chartCanvas]),
  ]);

  // ---- 盤と損失の折れ線 ----
  const boardCanvas = el("canvas", "board-canvas", [], { "aria-label": "コースの盤" });
  const panel = el("div", "panel", [], { role: "dialog" });
  const boardWrap = el("div", "board", [boardCanvas, panel]);
  const board = new Board(boardCanvas);
  const chart = new LossChart(chartCanvas, true);

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
  const soundBtn = el("button", "seg num", [], { type: "button", "aria-label": "効果音" });
  const viewBtn = el("button", "seg num", [], { type: "button", "aria-label": "視点" });
  const shootBtn = el("button", "btn btn-primary btn-shoot", [term("SHOOT", "打つ")], { type: "button" });
  const noteText = el("span", "note-text");
  const labNote = el("div", "lab-note golf-note", [el("span", "label note-label", ["LAB NOTE"]), noteText]);
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
      el("div", "ctrl ctrl-view", [
        term("VIEW", "視点", "label"),
        el("div", "ctrl-body", [el("div", "seg-wrap", [viewBtn, keycap("V")])]),
      ]),
      el("div", "ctrl ctrl-sound", [
        term("SOUND", "効果音", "label"),
        el("div", "ctrl-body", [el("div", "seg-wrap", [soundBtn, keycap("M")])]),
      ]),
      el("div", "ctrl ctrl-shoot", [el("div", "btn-wrap", [shootBtn, keycap("Space")])]),
    ]),
  ]);

  const root = el("main", "screen golf", [top, boardWrap, labNote, controls]);

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
    numCup.textContent = Math.hypot(ball.x - h.cup.x, ball.y - h.cup.y).toFixed(2);
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
    soundBtn.textContent = sound.enabled ? "ON" : "OFF";
    soundBtn.classList.toggle("is-on", sound.enabled);
    soundBtn.setAttribute("aria-pressed", String(sound.enabled));
    const locked = busy();
    // 打てない間（玉が動く・板が出ている）は立体にしない
    if (locked) view3d = false;
    viewBtn.textContent = view3d ? "3D" : "TOP";
    viewBtn.classList.toggle("is-on", view3d);
    viewBtn.setAttribute("aria-pressed", String(view3d));
    viewBtn.disabled = locked;
    shootBtn.disabled = locked;
    const howtoOpen = overlay?.kind === "howto";
    helpBtn.disabled = locked;
    slider.disabled = anim !== null || howtoOpen;
    gdBtn.disabled = anim !== null || howtoOpen;
    momBtn.disabled = anim !== null || howtoOpen;
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
    if (overlay.kind === "howto") {
      panel.append(
        ...buildHowto(GOLF_HOWTO, { index: overlay.index, count: GOLF_HOWTO.length }, { onNext: howtoNext, onBack: howtoBack, onClose: closeHowto }),
      );
      return;
    }
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
    const submit = buildSubmit(total);
    const retry = el("button", "btn btn-primary", [term("RETRY", "もう一度")], { type: "button" });
    retry.addEventListener("click", restart);
    const explain = el("button", "btn", [term("EXPLAIN", "解説を見る")], { type: "button" });
    explain.addEventListener("click", () => nav.go("explain"));
    const toMenu = el("button", "btn", [term("MENU", "メニューへ")], { type: "button" });
    toMenu.addEventListener("click", () => nav.go("menu"));
    panel.append(
      el("h2", "panel-title", [term("RESULT", "結果")]),
      el("div", "res-table", [head, ...rows, totalRow]),
      bestLine,
      submit,
      el("div", "panel-actions", [
        el("div", "btn-wrap", [retry, keycap("Enter")]),
        el("div", "btn-wrap", [explain, keycap("E")]),
        el("div", "btn-wrap", [toMenu, keycap("Esc")]),
      ]),
    );
    retry.focus({ preventScroll: true });
  }

  /** 結果の板の、順位表に記録を送る欄 */
  function buildSubmit(total: number): HTMLElement {
    const cfg = envConfig();
    if (!cfg) return el("p", "board-note", [OFFLINE_TEXT]);
    const code = textField("PASSPHRASE", "合言葉", save.board.code ?? "");
    const nick = textField("NICKNAME", "ニックネーム", save.board.nickname ?? "");
    const btn = el("button", "btn btn-primary", [term("SUBMIT", "記録を送る")], { type: "button" });
    // Enter・Space を画面全体のキー操作に渡さない（渡すと板が閉じる／クリックが起きない）
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") e.stopPropagation();
    });
    btn.addEventListener("keyup", (e) => e.stopPropagation());
    const status = el("span", "board-status");
    let busySending = false;
    let sent = false;
    const sync = () => {
      btn.disabled = busySending || sent || validateCode(code.input.value) === null || validateNickname(nick.input.value) === null;
    };
    const setStatus = (text: string, cls = "") => {
      status.textContent = text;
      status.className = `board-status ${cls}`.trim();
    };
    code.input.addEventListener("input", sync);
    nick.input.addEventListener("input", sync);
    btn.addEventListener("click", () => {
      const c = validateCode(code.input.value);
      const n = validateNickname(nick.input.value);
      if (c === null || n === null || busySending || sent) return;
      busySending = true;
      setStatus("送信中…");
      sync();
      void submitScore(cfg, { code: c, nickname: n, score: total }).then((ok) => {
        busySending = false;
        sent = ok;
        if (ok) {
          save.board = { code: c, nickname: n };
          saveData(save);
          setStatus("送った", "is-good");
        } else {
          setStatus("送れなかった。もう一度押す", "is-warn");
        }
        sync();
      });
    });
    sync();
    return el("div", "board-submit", [code.wrap, nick.wrap, el("div", "board-send", [btn, status])]);
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
    // OB・失敗の後の待ちの間も、上から見た図で出す
    const flat = anim !== null || now < holdUntil || overlay !== null;
    board.draw({ hole: viewHole(), ball, trails, live: anim ? live : null, obMark, alarm: now < alarmUntil, view3d: view3d && !flat });
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
    // 打つと、上から見た図に戻る
    view3d = false;
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
    sound.play("shot");
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
        sound.play("ob");
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
        sound.play("cup");
        overlay = { kind: "clear", holeNo: h.no, strokes: a.next.cards[a.next.cards.length - 1], par: h.par };
        break;
      }
      case "finish": {
        trails.push({ path, ob: false });
        ball = { ...path[path.length - 1] };
        const total = totalStrokes(a.next.cards);
        sound.play("finish");
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

  /** 遊び方の板を開く（玉が止まっていて、他の板が出ていない間だけ） */
  function openHowto(): void {
    if (busy()) return;
    view3d = false;
    overlay = { kind: "howto", index: 0 };
    syncDom();
  }

  /** 遊び方の板を閉じる。閉じたら既読にする（開き直しでは状態を変えない） */
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
    const p = { index: overlay.index, count: GOLF_HOWTO.length };
    overlay = { kind: "howto", index: (dir === 1 ? nextCard(p) : prevCard(p)).index };
    syncDom();
  }
  const howtoNext = () => howtoStep(1);
  const howtoBack = () => howtoStep(-1);

  function setLr(lr: number): void {
    if (anim || overlay?.kind === "howto") return;
    progress = { ...progress, lr };
    persist();
    syncDom();
  }

  function setMethod(m: Method): void {
    if (anim || overlay?.kind === "howto") return;
    progress = { ...progress, method: m };
    persist();
    syncDom();
  }

  function toggleSound(): void {
    sound.setEnabled(!sound.enabled);
    saveSoundOn(sound.enabled);
    syncDom();
  }

  function toggleView(): void {
    if (busy()) return;
    view3d = !view3d;
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
  soundBtn.addEventListener("click", toggleSound);
  viewBtn.addEventListener("click", toggleView);
  // ブラウザの制約で、最初の操作のあとに AudioContext を開始する（オンの時だけ）
  const onFirstGesture = () => sound.unlock();

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    sound.unlock();
    // 遊び方の板が出ている間は、板の操作だけ受け付ける（効果音の切り替えは効く）
    if (overlay?.kind === "howto") {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeHowto();
          return;
        case "Enter":
          e.preventDefault();
          if (isLast({ index: overlay.index, count: GOLF_HOWTO.length })) closeHowto();
          else howtoNext();
          return;
        case "ArrowRight":
          e.preventDefault();
          howtoNext();
          return;
        case "ArrowLeft":
          e.preventDefault();
          howtoBack();
          return;
        case "ArrowUp":
        case "ArrowDown":
        case " ":
        case "Spacebar":
          e.preventDefault();
          return;
      }
    }
    switch (e.key) {
      case "h":
      case "H":
        if (!e.repeat) openHowto();
        break;
      case "m":
      case "M":
        if (!e.repeat) toggleSound();
        break;
      case "v":
      case "V":
        if (!e.repeat) toggleView();
        break;
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
      case "e":
      case "E":
        if (overlay?.kind === "result") nav.go("explain");
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
  window.addEventListener("pointerdown", onFirstGesture);

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
      window.removeEventListener("pointerdown", onFirstGesture);
      sound.destroy();
    },
  };
}
