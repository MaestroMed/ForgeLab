/**
 * FORGE LAB sound design — Web Audio synthesized sfx.
 * No external files. Subtle, tasteful, can be muted globally.
 *
 * The enabled/volume state lives in the AmbientAudio zustand store so the
 * Settings "Audio → Effets sonores" controls drive these effects. A localStorage
 * fallback keeps things working during unit tests or before the store hydrates.
 */

import { useAmbientAudioStore } from '@/store';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Programmatic override (Settings UI still persists to the zustand store). */
export function setSfxEnabled(on: boolean) {
  try {
    useAmbientAudioStore.getState().setSfxEnabled(on);
  } catch {
    /* store not ready */
  }
  try {
    localStorage.setItem('forge-sfx-enabled', on ? '1' : '0');
  } catch {}
}

export function isSfxEnabled(): boolean {
  try {
    return useAmbientAudioStore.getState().sfxEnabled;
  } catch {
    /* fall through to localStorage */
  }
  try {
    const v = localStorage.getItem('forge-sfx-enabled');
    if (v !== null) return v === '1';
  } catch {}
  return true;
}

export function setSfxVolume(v: number) {
  const clamped = Math.max(0, Math.min(1, v));
  try {
    useAmbientAudioStore.getState().setSfxVolume(Math.round(clamped * 100));
  } catch {
    /* store not ready */
  }
}

function getMasterVolume(): number {
  try {
    return useAmbientAudioStore.getState().sfxVolume / 100;
  } catch {
    return 0.35;
  }
}

interface Note {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function play(freqs: Note[], overallGain = 1) {
  if (!isSfxEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const master = ctx.createGain();
  master.gain.value = getMasterVolume() * overallGain;
  master.connect(ctx.destination);

  const now = ctx.currentTime;
  for (const note of freqs) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = note.type ?? 'sine';
    osc.frequency.value = note.freq;
    gainNode.gain.setValueAtTime(0, now + note.start);
    gainNode.gain.linearRampToValueAtTime(note.gain ?? 0.5, now + note.start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);
    osc.connect(gainNode);
    gainNode.connect(master);
    osc.start(now + note.start);
    osc.stop(now + note.start + note.duration + 0.05);
  }
}

/** Click / hover — tiny tick. */
export function sfxTick() {
  play([{ freq: 2400, start: 0, duration: 0.02, type: 'sine', gain: 0.15 }], 0.5);
}

/** Approve / positive action — ascending major third. */
export function sfxApprove() {
  play(
    [
      { freq: 523.25, start: 0, duration: 0.08, type: 'triangle', gain: 0.35 }, // C5
      { freq: 659.25, start: 0.05, duration: 0.12, type: 'triangle', gain: 0.35 }, // E5
    ],
    0.7,
  );
}

/** Reject / dismiss — descending, muted. */
export function sfxReject() {
  play(
    [
      { freq: 330, start: 0, duration: 0.1, type: 'sawtooth', gain: 0.2 },
      { freq: 220, start: 0.06, duration: 0.14, type: 'sawtooth', gain: 0.2 },
    ],
    0.5,
  );
}

/** Export launch — rocket whoosh (rising FM-like). */
export function sfxRocket() {
  if (!isSfxEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const master = ctx.createGain();
  master.gain.value = getMasterVolume() * 0.7;
  master.connect(ctx.destination);

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(1400, now + 0.7);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.4, now + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(3000, now + 0.7);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(master);
  osc.start(now);
  osc.stop(now + 1);
}

/** Viral discovery — triumphant chord. */
export function sfxViral() {
  play(
    [
      { freq: 523.25, start: 0, duration: 0.4, type: 'triangle', gain: 0.35 }, // C
      { freq: 659.25, start: 0.05, duration: 0.4, type: 'triangle', gain: 0.35 }, // E
      { freq: 783.99, start: 0.1, duration: 0.45, type: 'triangle', gain: 0.35 }, // G
      { freq: 1046.5, start: 0.15, duration: 0.5, type: 'triangle', gain: 0.35 }, // C (octave)
    ],
    0.8,
  );
}

/** Error — soft thud. */
export function sfxError() {
  play(
    [
      { freq: 180, start: 0, duration: 0.1, type: 'sine', gain: 0.4 },
      { freq: 140, start: 0.08, duration: 0.15, type: 'sine', gain: 0.3 },
    ],
    0.6,
  );
}

/** Notification — soft two-tone bell. */
export function sfxNotify() {
  play(
    [
      { freq: 880, start: 0, duration: 0.12, type: 'sine', gain: 0.35 },
      { freq: 1174.7, start: 0.08, duration: 0.15, type: 'sine', gain: 0.35 },
    ],
    0.6,
  );
}
