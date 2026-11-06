import { BOSSES, BUDGET, SLOW_GRAD, type Fit } from "./boss";
import { CARDS, type CardId } from "./cards";
import type { PlayEvent } from "./game";

/** 差がこれ以上で「過学習の手前」と知らせる */
export const GAP_WARN = 8;

/** 階を始めた時の LAB NOTE（文言は docs/design.md） */
export function floorIntroNote(floor: number): string {
  switch (floor) {
    case 0:
      return "1階 MOONS。入力だけのモデルでは足りない。層を足して、検証精度を目標まで上げる。";
    case 1:
      return "2階 SPIRAL。もっと複雑な形。層を重ねる。Sigmoid を重ねすぎると勾配が消える。";
    case 2:
      return "3階 DIGITS。データが少なくノイズが多い。表現力が余ると過学習する。正則化を混ぜる。";
    default:
      return "最上階 PHOTOS。いちばん複雑で、過学習もしやすい。深さと正則化の釣り合いを取る。";
  }
}

export interface PlayNoteInput {
  event: PlayEvent;
  card: CardId;
  fit: Fit;
  grad: number;
  floor: number;
  /** 今の周回（それまでにクリアした回数。画面の周回はこれ ＋ 1） */
  loop: number;
}

/** カードを出した後の LAB NOTE。warn は朱で出すか */
export function playNote(i: PlayNoteInput): { text: string; warn: boolean } {
  const { train, val } = i.fit;
  const b = BOSSES[Math.min(i.floor, BOSSES.length - 1)];
  switch (i.event) {
    case "vanish":
      return { text: `勾配の流れ ${i.grad.toFixed(2)}。入力側の層まで勾配が届かない（勾配消失）。最初から。`, warn: true };
    case "overfit":
      return { text: `学習 ${train}% に対して検証 ${val}%。訓練データを覚えただけ（過学習）。最初から。`, warn: true };
    case "budget":
      return { text: `この階で出せる ${BUDGET} 枚を使い切った。表現力が足りない（学習不足）。最初から。`, warn: true };
    case "clear":
      return { text: `検証精度 ${val}% で ${b.en} を撃破。モデルはそのまま次の階へ。`, warn: false };
    case "allclear":
      return { text: `全階を撃破。周回 ${i.loop + 2} へ。新しいカードが手札に混ざる。`, warn: false };
    default: {
      const head = `${CARDS[i.card].en}：学習 ${train}% ／ 検証 ${val}%。`;
      if (train - val >= GAP_WARN) return { text: `${head}差が開いてきた。過学習の手前。`, warn: false };
      if (i.grad < SLOW_GRAD) return { text: `${head}勾配が細くなって、学習が鈍っている。`, warn: false };
      return { text: `${head}目標まであと ${b.target - val} ポイント。`, warn: false };
    }
  }
}
