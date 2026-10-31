// Synthesised sound effects (no audio files to host). Starts only after a tap,
// as browsers require.

import { store } from './store.ts';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  const s = store.get().settings;
  if (!s.sound) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new C();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(c: AudioContext, dur: number, freq: number, gain: number, delay = 0) {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.9;
  const g = c.createGain();
  g.gain.value = gain * store.get().settings.volume;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + delay);
}

function tone(c: AudioContext, freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = c.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * store.get().settings.volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  unlock() { ac(); },
  card() { const c = ac(); if (c) noiseBurst(c, 0.07, 2600, 0.5); },
  deal(n = 1) { const c = ac(); if (c) for (let i = 0; i < Math.min(n, 8); i++) noiseBurst(c, 0.06, 2300, 0.4, i * 0.09); },
  penalty() { const c = ac(); if (c) { tone(c, 220, 0.18, 0.25, 0, 'triangle'); tone(c, 165, 0.25, 0.25, 0.1, 'triangle'); } },
  skip() { const c = ac(); if (c) { tone(c, 520, 0.08, 0.2, 0, 'square'); tone(c, 390, 0.12, 0.15, 0.08, 'square'); } },
  suit() { const c = ac(); if (c) { tone(c, 660, 0.12, 0.2); tone(c, 880, 0.18, 0.2, 0.09); } },
  turn() { const c = ac(); if (c) tone(c, 740, 0.12, 0.12); },
  knockout() { const c = ac(); if (c) { noiseBurst(c, 0.3, 140, 1.2); tone(c, 98, 0.5, 0.4, 0, 'sawtooth'); } },
  win() { const c = ac(); if (c) [523, 659, 784, 1046].forEach((f, i) => tone(c, f, 0.3, 0.2, i * 0.12, 'triangle')); },
};
