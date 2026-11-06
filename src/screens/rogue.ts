import { formatDiff } from "../lib/golf/score";
import { BOSSES, BUDGET, SLOW_GRAD, type Fit } from "../lib/rogue/boss";
import { CARDS, effectText, modelStats, newCards, type CardId, type CardType } from "../lib/rogue/cards";
import {
  boss,
  budgetLeft,
  clearLoop,
  currentFit,
  curvePoints,
  EPOCHS,
  HAND_SIZE,
  isDefeat,
  newRun,
  nextFloor,
  nextLoop,
  play,
  reachFloor,
  restartRun,
  type PlayEvent,
  type RogueRun,
} from "../lib/rogue/game";
import { floorIntroNote, GAP_WARN, playNote } from "../lib/rogue/note";
import type { Route } from "../lib/route";
import type { SaveData } from "../lib/save";
import { readSave, saveData } from "../store";
import { el, keycap, prefersReducedMotion, term, type Screen } from "../ui";
import { BOSS_H, BOSS_W, drawBoss } from "./rogue-boss";
import { RogueChart } from "./rogue-chart";

const EPOCH_MS = 60;
const ALARM_MS = 600;

const TYPE_TERM: Record<CardType, [string, string]> = {
  layer: ["LAYER", "層"],
  reg: ["REG", "正則化"],
  fix: ["FIX", "調整"],
};

const DEFEAT_TERM: Record<"overfit" | "vanish" | "budget", [string, string]> = {
  overfit: ["OVERFIT", "過学習"],
  vanish: ["VANISHING GRADIENT", "勾配消失"],
  budget: ["OUT OF BUDGET", "予算切れ"],
};

type Overlay =
  | { kind: "clear"; floor: number; val: number; target: number }
  | { kind: "lose"; why: "overfit" | "vanish" | "budget"; floor: number; train: number; val: number; grad: number }
  | { kind: "allclear"; loop: number; cards: CardId[] }
  | null;

interface Anim {
  from: number;
  to: number;
  t0: number;
  event: PlayEvent;
  card: CardId;
  fit: Fit;
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function bestText(b: SaveData["rogue"]): string {
  return b.floor === null ? "—" : `${b.floor}階 ／ ${b.loops}周`;
}

export function createRogue(nav: { go(r: Route): void }): Screen {
  const save: SaveData = readSave();
  let run: RogueRun = newRun(save.rogue.loops, newSeed());
  /** 画面に出している精度（伸び終わるまでは前の値） */
  let shownFit: Fit = currentFit(run);
  let anim: Anim | null = null;
  let lostLast = false;
  let overlay: Overlay = null;
  let note = floorIntroNote(0);
  let noteWarn = false;
  let alarmUntil = 0;
  let raf = 0;

  const persistBest = () => saveData(save);
  save.rogue = reachFloor(save.rogue, 0);
  persistBest();

  // ---- 上の帯 ----
  const menuBtn = el("button", "btn", [term("MENU", "メニュー")], { type: "button" });
  menuBtn.addEventListener("click", () => nav.go("menu"));
  const numFloor = el("span", "num big");
  const numLoop = el("span", "num big");
  const numBudget = el("span", "num big");
  const numTrain = el("span", "num big");
  const numVal = el("span", "num big is-amber");
  const readout = (en: string, ja: string, value: HTMLElement) =>
    el("div", "readout", [term(en, ja, "label"), el("div", "readout-val", [value])]);
  const top = el("header", "golf-top", [
    el("div", "golf-title", [el("div", "btn-wrap", [menuBtn, keycap("Esc")]), el("h1", "game-title", [term("MODEL ROGUE", "モデル・ローグ")])]),
    el("div", "readouts readouts-rogue", [
      readout("FLOOR", "階", numFloor),
      readout("LOOP", "周回", numLoop),
      readout("BUDGET", "残りの手", numBudget),
      readout("TRAIN ACC", "学習精度", numTrain),
      readout("VAL ACC", "検証精度", numVal),
    ]),
  ]);

  // ---- 学習曲線 ----
  const chartCanvas = el("canvas", "chart-canvas", [], { "aria-label": "学習曲線" });
  const chartWrap = el("div", "chart rogue-chart", [chartCanvas]);
  const chart = new RogueChart(chartCanvas);

  // ---- 中の段：ボス ----
  const bossCanvas = el("canvas", "boss-canvas", [], { width: String(BOSS_W), height: String(BOSS_H), "aria-hidden": "true" });
  bossCanvas.style.aspectRatio = `${BOSS_W} / ${BOSS_H}`;
  const bossFloor = el("span", "label boss-floor");
  const bossName = el("h2", "boss-name");
  const bossNeed = el("span", "num");
  const bossRisk = el("span", "num");
  const statRow = (en: string, ja: string, v: HTMLElement) => el("div", "stat-row", [term(en, ja, "label"), v]);
  const bossSec = el("section", "rg-sec rg-boss", [
    el("div", "rg-head", [term("BOSS", "ボス", "label"), bossFloor]),
    el("div", "boss-body", [
      bossCanvas,
      el("div", "boss-info", [bossName, el("div", "stat-table", [statRow("NEED", "必要な表現力", bossNeed), statRow("RISK", "過学習のしやすさ", bossRisk)])]),
    ]),
  ]);

  // ---- 中の段：ゲージ ----
  const gaugeNum = el("span", "num gauge-num");
  const gaugeFill = el("div", "gauge-fill");
  const targetLabel = el("span", "target-label");
  const targetMark = el("div", "gauge-target", [targetLabel]);
  const gauge = el("div", "gauge", [gaugeFill, targetMark], { role: "meter", "aria-valuemin": "0", "aria-valuemax": "100" });
  const trainFill = el("div", "gauge-fill train-fill");
  const trainNum = el("span", "num");
  const gapNum = el("span", "num");
  const gaugeSec = el("section", "rg-sec rg-gauge", [
    term("VAL ACC", "検証精度（HP）", "label"),
    gaugeNum,
    gauge,
    el("div", "train-row", [term("TRAIN", "学習", "label"), el("div", "train-bar", [trainFill]), trainNum]),
    statRow("GAP", "差", gapNum),
  ]);

  // ---- 中の段：モデル ----
  const modelList = el("ol", "model-list");
  const statCap = el("span", "num");
  const statReg = el("span", "num");
  const statGrad = el("span", "num");
  const modelSec = el("section", "rg-sec rg-model", [
    term("MODEL", "モデル", "label"),
    modelList,
    el("div", "stat-table", [statRow("CAP", "表現力", statCap), statRow("REG", "正則化", statReg), statRow("GRAD", "勾配の流れ", statGrad)]),
  ]);

  const panel = el("div", "panel", [], { role: "dialog" });
  const mid = el("div", "board rogue-mid", [el("div", "rg-grid", [bossSec, gaugeSec, modelSec]), panel]);

  // ---- 下の帯：手札 ----
  const cards = Array.from({ length: HAND_SIZE }, (_, i) => {
    const type = el("span", "card-type");
    const name = el("span", "card-name");
    const effect = el("span", "num card-effect");
    const btn = el("button", "card", [type, name, effect], { type: "button" });
    btn.addEventListener("click", () => playSlot(i));
    return { btn, type, name, effect, wrap: el("div", "card-wrap", [btn, keycap(String(i + 1))]) };
  });
  const noteText = el("span", "note-text");
  const controls = el("footer", "golf-controls rogue-controls", [
    el("div", "hand", [term("HAND", "手札", "label"), el("div", "cards", cards.map((c) => c.wrap))]),
    el("div", "lab-note", [el("span", "label note-label", ["LAB NOTE"]), noteText]),
  ]);

  const root = el("main", "screen golf rogue", [top, chartWrap, mid, controls]);

  // ---- 状態から画面へ ----
  let bossKey = "";
  function syncDom(): void {
    const b = boss(run);
    numFloor.textContent = `${run.floor + 1}/${BOSSES.length}`;
    numLoop.textContent = String(run.loop + 1);
    const left = budgetLeft(run);
    numBudget.textContent = `${left}/${BUDGET}`;
    numBudget.classList.toggle("is-warn", left <= 0);
    numTrain.textContent = `${shownFit.train}%`;
    numVal.textContent = `${shownFit.val}%`;

    bossFloor.textContent = `FLOOR ${run.floor + 1}`;
    bossName.replaceChildren(term(b.en, b.ja));
    bossNeed.textContent = String(b.need);
    bossRisk.textContent = `×${b.risk}`;

    gaugeNum.textContent = `${shownFit.val}%`;
    gaugeFill.style.width = `${shownFit.val}%`;
    gauge.setAttribute("aria-valuenow", String(shownFit.val));
    targetMark.style.left = `${b.target}%`;
    targetLabel.replaceChildren(term("TARGET", "目標", "label"), el("span", "num", [` ${b.target}%`]));
    trainFill.style.width = `${shownFit.train}%`;
    trainNum.textContent = `${shownFit.train}%`;
    const gap = shownFit.train - shownFit.val;
    gapNum.textContent = formatDiff(gap);
    gapNum.classList.toggle("is-warn", gap >= GAP_WARN);

    const s = modelStats(run.model);
    modelList.replaceChildren(
      el("li", "", [el("span", "model-no", ["0"]), term("INPUT", "入力")]),
      ...run.model.map((id, i) =>
        el("li", i === run.model.length - 1 ? "is-last" : "", [el("span", "model-no", [String(i + 1)]), el("span", "", [CARDS[id].en])]),
      ),
    );
    modelList.scrollTop = modelList.scrollHeight;
    statCap.textContent = String(s.cap);
    statReg.textContent = String(s.reg);
    statGrad.textContent = s.grad.toFixed(2);
    statGrad.classList.toggle("is-warn", s.grad < SLOW_GRAD);

    const busy = anim !== null || overlay !== null;
    cards.forEach((c, i) => {
      const id = run.hand[i];
      const spec = CARDS[id];
      const [en, ja] = TYPE_TERM[spec.type];
      c.type.replaceChildren(term(en, ja));
      c.name.replaceChildren(term(spec.en, spec.ja));
      c.effect.textContent = effectText(id);
      c.btn.disabled = busy;
      c.btn.setAttribute("aria-label", `${i + 1}：${spec.en} ${spec.ja}`);
    });
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
    mid.classList.toggle("has-panel", overlay !== null);
    if (!overlay) return;
    const toMenu = () => {
      const b = el("button", "btn", [term("MENU", "メニューへ")], { type: "button" });
      b.addEventListener("click", () => nav.go("menu"));
      return el("div", "btn-wrap", [b, keycap("Esc")]);
    };
    const primary = (en: string, ja: string) => {
      const b = el("button", "btn btn-primary btn-rogue", [term(en, ja)], { type: "button" });
      b.addEventListener("click", proceed);
      return b;
    };
    const bestLine = () => el("p", "res-best", [term("BEST", "最高記録", "label"), el("span", "num", [bestText(save.rogue)])]);
    let btn: HTMLButtonElement;
    if (overlay.kind === "clear") {
      btn = primary("NEXT FLOOR", "次の階へ");
      panel.append(
        el("h2", "panel-title is-good", [`FLOOR ${overlay.floor + 1} CLEAR`]),
        el("p", "panel-sub", ["撃破"]),
        el("p", "panel-score num", [`VAL ACC ${overlay.val}% ／ TARGET ${overlay.target}%`]),
        el("div", "panel-actions", [el("div", "btn-wrap", [btn, keycap("Enter")])]),
      );
    } else if (overlay.kind === "lose") {
      const [en, ja] = DEFEAT_TERM[overlay.why];
      btn = primary("RESTART", "最初から");
      const row = (en2: string, ja2: string, v: string) => el("div", "acc-row", [term(en2, ja2, "label"), el("span", "num", [v])]);
      panel.append(
        el("h2", "panel-title is-bad", [term(en, ja)]),
        el("p", "panel-sub", [`${overlay.floor + 1}階で倒れた。最初から。`]),
        el("div", "acc-table", [
          row("TRAIN ACC", "学習精度", `${overlay.train}%`),
          row("VAL ACC", "検証精度", `${overlay.val}%`),
          row("GRAD", "勾配の流れ", overlay.grad.toFixed(2)),
        ]),
        bestLine(),
        el("div", "panel-actions", [el("div", "btn-wrap", [btn, keycap("Enter")]), toMenu()]),
      );
    } else {
      btn = primary("NEXT LOOP", "次の周回へ");
      const list =
        overlay.cards.length > 0
          ? el(
              "ul",
              "unlock-list",
              overlay.cards.map((id) => el("li", "", [term(CARDS[id].en, CARDS[id].ja)])),
            )
          : el("p", "panel-sub", ["新しいカードはもう無い"]);
      panel.append(
        el("h2", "panel-title is-good", [term("ALL CLEAR", "全階突破")]),
        el("p", "panel-score num", [`LOOP ${overlay.loop + 1} → ${overlay.loop + 2}`]),
        el("div", "unlock", [term("NEW CARDS", "解禁", "label"), list]),
        bestLine(),
        el("div", "panel-actions", [el("div", "btn-wrap", [btn, keycap("Enter")]), toMenu()]),
      );
    }
    btn.focus({ preventScroll: true });
  }

  function draw(now: number): void {
    const pts = curvePoints(run.curve);
    let shown = pts.length;
    if (anim) {
      const t = prefersReducedMotion() ? Number.POSITIVE_INFINITY : now - anim.t0;
      shown = Math.min(anim.to, anim.from + Math.floor(t / EPOCH_MS));
      if (shown >= anim.to) finishPlay(now);
    }
    const b = boss(run);
    chart.draw({ points: pts, shown, target: b.target, floorPct: b.chance, lostLast });
    const bw = Math.round(bossCanvas.getBoundingClientRect().width);
    const key = `${run.floor}:${bw}`;
    if (bw > 0 && key !== bossKey) {
      bossKey = key;
      drawBoss(bossCanvas, run.floor, bw);
    }
    mid.classList.toggle("is-alarm", now < alarmUntil);
  }

  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    draw(now);
  }

  // ---- 操作 ----
  function playSlot(i: number): void {
    if (anim || overlay) return;
    const before = curvePoints(run.curve).length;
    const card = run.hand[i];
    const out = play(run, i);
    if (!out || card === undefined) return;
    run = out.run;
    lostLast = isDefeat(out.event);
    anim = { from: before, to: before + EPOCHS, t0: performance.now(), event: out.event, card, fit: out.fit };
    noteWarn = false;
    syncDom();
  }

  function finishPlay(now: number): void {
    const a = anim;
    if (!a) return;
    anim = null;
    shownFit = a.fit;
    const grad = modelStats(run.model).grad;
    const n = playNote({ event: a.event, card: a.card, fit: a.fit, grad, floor: run.floor, loop: run.loop });
    note = n.text;
    noteWarn = n.warn;
    const b = boss(run);
    if (a.event === "clear") {
      overlay = { kind: "clear", floor: run.floor, val: a.fit.val, target: b.target };
    } else if (a.event === "allclear") {
      save.rogue = clearLoop(save.rogue);
      persistBest();
      overlay = { kind: "allclear", loop: run.loop, cards: newCards(run.loop + 1) };
    } else if (a.event === "overfit" || a.event === "vanish" || a.event === "budget") {
      alarmUntil = now + ALARM_MS;
      overlay = { kind: "lose", why: a.event, floor: run.floor, train: a.fit.train, val: a.fit.val, grad };
    }
    syncDom();
  }

  function startFloor(r: RogueRun): void {
    run = r;
    shownFit = currentFit(run);
    lostLast = false;
    overlay = null;
    note = floorIntroNote(run.floor);
    noteWarn = false;
    save.rogue = reachFloor(save.rogue, run.floor);
    persistBest();
    syncDom();
  }

  function proceed(): void {
    if (!overlay) return;
    if (overlay.kind === "clear") startFloor(nextFloor(run));
    else if (overlay.kind === "lose") startFloor(restartRun(run, newSeed()));
    else startFloor(nextLoop(run, newSeed()));
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        nav.go("menu");
        break;
      case "Enter":
        e.preventDefault();
        if (!e.repeat) proceed();
        break;
      case "1":
      case "2":
      case "3":
      case "4":
        if (!e.repeat) playSlot(Number(e.key) - 1);
        break;
    }
  };
  window.addEventListener("keydown", onKeyDown);

  syncDom();
  raf = requestAnimationFrame(loop);

  return {
    root,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
