/** 勾配ゴルフの効果音（Web Audio API の短い合成音。音声ファイルは使わない） */

export type SoundName = "shot" | "cup" | "ob" | "finish";

interface Tone {
  /** 周波数（Hz）。2つ以上なら順に鳴らす */
  freqs: number[];
  /** 1音の長さ（秒） */
  dur: number;
  /** 音程を滑らせる時の終わりの周波数（freqs が1つの時） */
  glideTo?: number;
}

const TONES: Record<SoundName, Tone> = {
  shot: { freqs: [220], dur: 0.08 },
  cup: { freqs: [523, 784], dur: 0.12 },
  ob: { freqs: [330], dur: 0.3, glideTo: 165 },
  finish: { freqs: [523, 659, 784, 1047], dur: 0.12 },
};

const VOLUME = 0.12;
const EDGE = 0.01;

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class GolfSound {
  private ctx: AudioContext | null = null;
  private on: boolean;

  constructor(on: boolean) {
    this.on = on;
  }

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(on: boolean): void {
    this.on = on;
    // ユーザーの操作の中で呼ばれる。ここで初めて AudioContext を作って開始する
    if (on) this.unlock();
  }

  /** 最初のユーザー操作のあとに AudioContext を開始する（オンの時だけ） */
  unlock(): void {
    if (!this.on) return;
    try {
      if (!this.ctx) {
        const Ctor = audioCtor();
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  play(name: SoundName): void {
    if (!this.on) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    try {
      const tone = TONES[name];
      let t = ctx.currentTime;
      for (const f of tone.freqs) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(f, t);
        if (tone.glideTo !== undefined) osc.frequency.linearRampToValueAtTime(tone.glideTo, t + tone.dur);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(VOLUME, t + EDGE);
        gain.gain.setValueAtTime(VOLUME, t + tone.dur - EDGE);
        gain.gain.linearRampToValueAtTime(0, t + tone.dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + tone.dur);
        t += tone.dur;
      }
    } catch {
      // 鳴らせなくても遊び続ける
    }
  }

  destroy(): void {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
