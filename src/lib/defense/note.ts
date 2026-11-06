import { isOverfit, type WaveEvent } from "./game";
import { WAVES } from "./wave";

/** 波を始める前（置く時間）の LAB NOTE */
export function waveIntroNote(w: number): string {
  switch (w) {
    case 0:
      return "練習データの第1波。ニューロンを置いて、○ と ● を分ける境界線を引く。";
    case 1:
      return "第2波。練習データが16点に増える。境界線を見直す。";
    case 2:
      return "第3波。練習データは全部で24点。ノイズの点も混ざっている。";
    default:
      return "最終波は初見のテストデータ40点。練習に合わせすぎた陣地は崩れる。";
  }
}

export interface WaveNoteInput {
  event: WaveEvent;
  /** 終えた波（0 始まり） */
  wave: number;
  misses: number;
  trainPct: number;
  testPct: number;
}

/** 波を終えた時の LAB NOTE。warn は朱で出すか */
export function waveNote(i: WaveNoteInput): { text: string; warn: boolean } {
  const n = i.wave + 1;
  const last = i.wave === WAVES.length - 1;
  if (i.event === "fail") {
    if (!last) return { text: `ライフが尽きた。境界線を見直して、第${n}波をもう一度。`, warn: true };
    if (isOverfit(i.trainPct, i.testPct)) {
      return { text: `練習の正解率 ${i.trainPct}% に対してテストは ${i.testPct}%。練習データに合わせすぎた（過学習）。`, warn: true };
    }
    return { text: `テストの正解率 ${i.testPct}%。境界線が真の境目からずれている。`, warn: true };
  }
  if (i.event === "finish") {
    return { text: `練習 ${i.trainPct}% ／ テスト ${i.testPct}%。初見のデータでも境界線が保った（汎化）。`, warn: false };
  }
  return { text: `第${n}波を守り切った。誤り ${i.misses} 点。`, warn: false };
}
