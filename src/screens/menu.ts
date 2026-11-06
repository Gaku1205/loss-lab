import { isDefenseFinished } from "../lib/defense/game";
import { isFinished } from "../lib/golf/game";
import { envConfig, fetchTop, validateCode } from "../lib/board";
import type { Route } from "../lib/route";
import { golfBestText, hasNoRecord, type SaveData } from "../lib/save";
import { readSave, saveData } from "../store";
import { el, keycap, term, type Screen } from "../ui";
import { OFFLINE_TEXT, textField } from "./board-ui";
import { bestText as rewardBestText, isRewardMidway } from "./reward";
import { bestText as rogueBestText } from "./rogue";

interface GameRow {
  no: string;
  en: string;
  ja: string;
  topic: string;
  /** 差し色の CSS 変数名 */
  accent: string;
  /** 開く画面（準備中なら null） */
  route: Route | null;
  /** 開くキー（e.key） */
  key: string;
}

const GAMES: readonly GameRow[] = [
  { no: "01", en: "Gradient Golf", ja: "勾配ゴルフ", topic: "学習率と最適化手法", accent: "--cyan", route: "golf", key: "Enter" },
  { no: "02", en: "Boundary Defense", ja: "境界防衛線", topic: "過学習と汎化", accent: "--vermilion", route: "defense", key: "2" },
  { no: "03", en: "Model Rogue", ja: "モデル・ローグ", topic: "モデル設計", accent: "--amber", route: "rogue", key: "3" },
  { no: "04", en: "Reward Lab", ja: "報酬設計室", topic: "報酬設計", accent: "--leaf", route: "reward", key: "4" },
];

/** 行の小さな盤の図。前の記録の線は保存していないので、どの行もそのゲームの盤の図を出す（固定の図形だけ） */
const TRACES: Record<string, string> = {
  golf: '<svg viewBox="0 0 160 56"><g fill="none" stroke="#24314A"><ellipse cx="110" cy="28" rx="48" ry="24"/><ellipse cx="110" cy="28" rx="32" ry="16"/><ellipse cx="110" cy="28" rx="16" ry="8"/></g><path d="M16 12 C 50 14, 80 30, 108 28" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="110" cy="28" r="4" fill="none" stroke="#DCE3F0" stroke-width="1.5"/></svg>',
  defense:
    '<svg viewBox="0 0 160 56"><path d="M4 36 C 40 8, 70 8, 100 28 S 140 48, 156 20" fill="none" stroke="currentColor" stroke-width="1.5"/><g fill="none" stroke="#DCE3F0" stroke-width="1.5"><circle cx="30" cy="18" r="3"/><circle cx="76" cy="44" r="3"/><circle cx="128" cy="38" r="3"/></g><g fill="#DCE3F0"><circle cx="30" cy="46" r="3"/><circle cx="84" cy="14" r="3"/><circle cx="130" cy="12" r="3"/></g></svg>',
  rogue:
    '<svg viewBox="0 0 160 56"><line x1="4" y1="14" x2="156" y2="14" stroke="#24314A"/><polyline points="4,50 44,46 84,38 124,34 156,30" fill="none" stroke="#DCE3F0"/><polyline points="4,48 44,40 84,26 124,16 156,10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  reward:
    '<svg viewBox="0 0 160 56"><g fill="none" stroke="#24314A"><rect x="20" y="6" width="120" height="44"/><line x1="50" y1="6" x2="50" y2="50"/><line x1="80" y1="6" x2="80" y2="50"/><line x1="110" y1="6" x2="110" y2="50"/><line x1="20" y1="28" x2="140" y2="28"/></g><polyline points="35,17 65,17 65,39 95,39 95,17 125,17" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="32" y="14" width="6" height="6" fill="none" stroke="#DCE3F0"/></svg>',
};

export function createMenu(nav: { go(r: Route): void }): Screen {
  const save = readSave();
  const prog = save.golf.progress;
  const dprog = save.defense.progress;
  const midway: Record<string, boolean> = {
    golf: prog !== null && !isFinished(prog) && (prog.hole > 0 || prog.strokes > 0),
    defense: dprog !== null && !isDefenseFinished(dprog) && (dprog.wave > 0 || dprog.neurons.length > 0),
    reward: isRewardMidway(save.reward.progress),
  };
  const bestText: Record<string, string> = {
    golf: golfBestText(save),
    defense: save.defense.best !== null ? `${save.defense.best}%` : "—",
    rogue: rogueBestText(save.rogue),
    reward: rewardBestText(save.reward),
  };

  const progress: Record<string, { n: number; done: number; total: number; word: string }> = {
    golf: { word: "HOLE", total: 10, done: prog ? Math.min(prog.hole, 10) : 0, n: prog ? Math.min(prog.hole + 1, 10) : 0 },
    defense: { word: "WAVE", total: 4, done: dprog ? Math.min(dprog.wave, 4) : 0, n: dprog ? Math.min(dprog.wave + 1, 4) : 0 },
    rogue: { word: "FLOOR", total: 4, done: save.rogue.floor ?? 0, n: save.rogue.floor ?? 0 },
    reward: {
      word: "TASK",
      total: 3,
      done: save.reward.progress ? Math.min(save.reward.progress.task, 3) : 0,
      n: save.reward.progress ? Math.min(save.reward.progress.task + 1, 3) : 0,
    },
  };

  const stat = (en: string, value: string, on = false) =>
    el("span", `bar-stat${on ? " is-on" : ""}`, [el("span", "label", [en]), el("span", "num bar-val", [value])]);
  const head = el("header", "menu-bar", [
    el("div", "menu-brand", [
      el("h1", "site-title", ["Loss Lab"]),
      el("p", "menu-lead", ["損失を下げる4つの実験。勾配降下・過学習・モデル設計・報酬設計を、遊びながら確かめる。"]),
    ]),
    el("div", "bar-stats", [stat("MENU", "●", true), stat("CLASS", "—"), stat("SOUND", "OFF")]),
  ]);

  const rows = GAMES.map((g) => {
    const name = el("div", "xp-name", [el("span", "xp-en", [g.en]), el("span", "xp-ja", [g.ja])]);
    const route = g.route;
    let state: HTMLElement;
    if (route) {
      if (route === "golf" && hasNoRecord(save)) name.append(el("span", "start-here", ["最初はここから"]));
      const accentCls = route === "defense" ? " btn-def" : route === "rogue" ? " btn-rogue" : route === "reward" ? " btn-reward" : "";
      const btn = el("button", `btn btn-primary btn-play${accentCls}`, [midway[route] ? term("CONTINUE", "続きから") : term("OPEN", "開く")], {
        type: "button",
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        nav.go(route);
      });
      state = el("div", "xp-state", [btn, keycap(g.key)]);
    } else {
      state = el("div", "xp-state");
    }
    let progEl: HTMLElement;
    if (route) {
      const pr = progress[route];
      const ticks = Array.from({ length: pr.total }, (_, i) => el("i", i < pr.done ? "tick is-done" : "tick"));
      progEl = el("div", "xp-prog", [el("span", "num xp-prog-text", [`${pr.word} ${pr.n} / ${pr.total}`]), el("div", "ticks", ticks)]);
    } else {
      progEl = el("div", "xp-prog", [el("span", "num xp-prog-text", ["—"])]);
    }
    const trace = el("div", "xp-trace", [], { "aria-hidden": "true" });
    trace.innerHTML = TRACES[g.route ?? "golf"];
    const row = el(
      "div",
      `xp-row${route ? " is-ready" : " is-soon"}`,
      [
        name,
        trace,
        progEl,
        el("div", "xp-best", [term("BEST", "最高記録", "label"), el("span", "num xp-best-val", [route ? bestText[route] : "—"])]),
        state,
      ],
      route ? {} : { "aria-disabled": "true" },
    );
    row.style.setProperty("--accent", `var(${g.accent})`);
    if (route) row.addEventListener("click", () => nav.go(route));
    return row;
  });

  const table = el("section", "xp-table", rows, { "aria-label": "実験" });

  let destroyed = false;
  const boards = GAMES.map((g) => {
    const lines = ["1", "2", "3"].map((n) => el("li", "rank-line", [el("span", "num rank-no", [n]), el("span", "num", ["—"])]));
    const box = el("div", "rank-box", [el("div", "rank-game", [g.en]), el("ol", "rank-list", lines), el("p", "rank-empty", ["まだ記録なし"])]);
    box.style.setProperty("--accent", `var(${g.accent})`);
    if (g.route === "golf") mountGolfBoard(box, save, () => destroyed);
    return box;
  });
  const ranks = el("section", "ranks", [el("h2", "section-title", [term("TOP 3", "上位3人")]), el("div", "rank-grid", boards)]);

  const foot = el("p", "menu-foot", ["記録はこのブラウザに保存します。ログインはありません。"]);
  const root = el("main", "screen menu", [head, table, el("div", "menu-under", [ranks, foot])]);

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // ボタンにフォーカスがある時の Enter は、そのボタンを押したことにする
    if (e.key === "Enter" && e.target instanceof HTMLButtonElement) return;
    const g = GAMES.find((x) => x.route && x.key === e.key);
    if (g?.route) {
      e.preventDefault();
      nav.go(g.route);
    }
  };
  window.addEventListener("keydown", onKey);
  return {
    root,
    destroy: () => {
      destroyed = true;
      window.removeEventListener("keydown", onKey);
    },
  };
}

/** 勾配ゴルフの順位の枠：合言葉の入力、または合言葉の表の上位3人 */
function mountGolfBoard(box: HTMLElement, save: SaveData, isGone: () => boolean): void {
  const game = el("div", "rank-game", ["Gradient Golf"]);
  const body = el("div", "rank-body");
  box.replaceChildren(game, body);
  let token = 0;

  const note = (text: string) => el("p", "rank-empty", [text]);
  const lines = (rows: { name: string; score: number }[]) =>
    el(
      "ol",
      "rank-list",
      [0, 1, 2].map((i) => {
        const r = rows[i];
        return el("li", "rank-line", [
          el("span", "num rank-no", [String(i + 1)]),
          el("span", "rank-name", [r ? r.name : "—"]),
          el("span", `num rank-score${i === 0 && r ? " is-first" : ""}`, [r ? `${r.score} 打` : ""]),
        ]);
      }),
    );

  function showForm(): void {
    token++;
    const f = textField("PASSPHRASE", "合言葉", save.board.code ?? "");
    const btn = el("button", "btn btn-primary rank-go", [term("SHOW", "表示")], { type: "button" });
    const sync = () => {
      btn.disabled = validateCode(f.input.value) === null;
    };
    const go = () => {
      const c = validateCode(f.input.value);
      if (c === null) return;
      save.board.code = c;
      saveData(save);
      showBoard();
    };
    f.input.addEventListener("input", sync);
    f.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
    btn.addEventListener("click", go);
    sync();
    body.replaceChildren(lines([]), f.wrap, btn);
  }

  function showBoard(): void {
    const code = save.board.code;
    if (code === null) return showForm();
    const mine = token + 1;
    token = mine;
    const change = el("button", "rank-change", [term("CHANGE", "変更")], { type: "button" });
    change.addEventListener("click", showForm);
    const head = el("div", "rank-code", [el("span", "num rank-code-text", [code]), change]);
    const cfg = envConfig();
    const offline = () => {
      const best = save.golf.best;
      const notes = best === null ? ["まだ記録なし", OFFLINE_TEXT] : [OFFLINE_TEXT];
      body.replaceChildren(head, lines(best === null ? [] : [{ name: "この端末", score: best }]), ...notes.map(note));
    };
    if (!cfg) return offline();
    body.replaceChildren(head, lines([]), note("読み込み中…"));
    void fetchTop(cfg, code).then((rows) => {
      if (isGone() || token !== mine) return;
      if (rows === null) return offline();
      body.replaceChildren(head, lines(rows.map((r) => ({ name: r.nickname, score: r.score }))), ...(rows.length === 0 ? [note("まだ記録なし")] : []));
    });
  }

  if (save.board.code === null) showForm();
  else showBoard();
}
