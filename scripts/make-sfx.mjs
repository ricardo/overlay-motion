// Generates public/sfx/*.wav: the premade 20-cue UI and motion sound pack.
// Synthesized from scratch so every file is license-free.
// No ffmpeg needed: plain PCM16 mono WAV written by hand.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const TAU = Math.PI * 2;

// Deterministic noise so re-running the script produces identical files.
let seed = 1234567;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed / 0x7fffffff) * 2 - 1;
};

const render = (seconds, tick) => {
  const n = Math.round(SR * seconds);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = tick(i / SR, i);
  return out;
};

/** One-pole lowpass; returns a stateful filter function. */
const lowpass = () => {
  let y = 0;
  return (x, cutoffHz) => {
    const a = 1 - Math.exp((-TAU * cutoffHz) / SR);
    y += a * (x - y);
    return y;
  };
};

const attack = (i, samples) => Math.min(1, i / samples);

const SOUNDS = {
  // Classic bubble pop: fast pitch drop with a tiny click transient.
  pop: () => {
    let phase = 0;
    return render(0.14, (t, i) => {
      const f = 170 + 380 * Math.exp(-t * 40);
      phase += (TAU * f) / SR;
      const body = Math.sin(phase) * Math.exp(-t * 30) * attack(i, 6);
      const click = rand() * Math.exp(-t * 900) * 0.35;
      return body + click;
    });
  },

  // Water-droplet bloop: pitch rises as the bubble closes.
  bubble: () => {
    let phase = 0;
    return render(0.2, (t, i) => {
      const f = 640 - 390 * Math.exp(-t * 22);
      phase += (TAU * f) / SR;
      return Math.sin(phase) * Math.exp(-t * 15) * attack(i, 40);
    });
  },

  // Soft UI tick: short 1.8kHz ping plus a hair of noise.
  tick: () => {
    return render(0.05, (t, i) => {
      const ping = Math.sin(TAU * 1800 * t) * Math.exp(-t * 150);
      const noise = rand() * Math.exp(-t * 500) * 0.5;
      return (ping + noise) * attack(i, 3);
    });
  },

  // Small bell: C6 with two decaying partials, slight detune for shimmer.
  ding: () => {
    return render(0.8, (t, i) => {
      const p1 = Math.sin(TAU * 1046.5 * t) * Math.exp(-t * 6);
      const p2 = Math.sin(TAU * 2089 * t) * Math.exp(-t * 9) * 0.4;
      const p3 = Math.sin(TAU * 3135 * t) * Math.exp(-t * 14) * 0.18;
      return (p1 + p2 + p3) * attack(i, 130);
    });
  },

  // Air whoosh: lowpassed noise, cutoff and volume swell then fall.
  whoosh: () => {
    const lp = lowpass();
    const T = 0.45;
    return render(T, (t) => {
      const shape = Math.sin((Math.PI * t) / T) ** 2;
      const cutoff = 300 + 2200 * shape;
      return lp(rand(), cutoff) * shape * 2.2;
    });
  },

  // Lower derivative of Metallic: same double snap with warmer metal partials.
  "typewriter-scissor-metallic-low": () => {
    const downFilter = lowpass();
    const upFilter = lowpass();
    return render(0.13, (t, i) => {
      const down = downFilter(rand(), 5200) * Math.exp(-t * 225) * 1.28;
      const frame = Math.sin(TAU * 1080 * t) * Math.exp(-t * 58) * 0.46;
      const metal = Math.sin(TAU * 1690 * t) * Math.exp(-t * 82) * 0.25;
      const body = Math.sin(TAU * 285 * t) * Math.exp(-t * 39) * 0.36;
      const dt = t - 0.052;
      const up = dt >= 0 ? upFilter(rand(), 5000) * Math.exp(-dt * 260) * 0.58 : 0;
      const returnTone = dt >= 0 ? Math.sin(TAU * 1320 * dt) * Math.exp(-dt * 105) * 0.17 : 0;
      return (down + frame + metal + body + up + returnTone) * attack(i, 2);
    });
  },

  // Bass derivative: denser low frame, reduced brightness, mechanical return intact.
  "typewriter-scissor-metallic-bass": () => {
    const downFilter = lowpass();
    const upFilter = lowpass();
    return render(0.15, (t, i) => {
      const down = downFilter(rand(), 4200) * Math.exp(-t * 205) * 1.3;
      const frame = Math.sin(TAU * 790 * t) * Math.exp(-t * 50) * 0.5;
      const metal = Math.sin(TAU * 1280 * t) * Math.exp(-t * 68) * 0.3;
      const body = Math.sin(TAU * 185 * t) * Math.exp(-t * 31) * 0.48;
      const dt = t - 0.058;
      const up = dt >= 0 ? upFilter(rand(), 4400) * Math.exp(-dt * 235) * 0.56 : 0;
      const returnTone = dt >= 0 ? Math.sin(TAU * 980 * dt) * Math.exp(-dt * 92) * 0.18 : 0;
      return (down + frame + metal + body + up + returnTone) * attack(i, 2);
    });
  },

  // Sub derivative: darkest metal voicing with notebook-deck bass resonance.
  "typewriter-scissor-metallic-sub": () => {
    const downFilter = lowpass();
    const upFilter = lowpass();
    return render(0.17, (t, i) => {
      const down = downFilter(rand(), 3500) * Math.exp(-t * 190) * 1.34;
      const frame = Math.sin(TAU * 620 * t) * Math.exp(-t * 44) * 0.48;
      const metal = Math.sin(TAU * 960 * t) * Math.exp(-t * 61) * 0.32;
      const deck = Math.sin(TAU * 112 * t) * Math.exp(-t * 23) * 0.58;
      const dt = t - 0.064;
      const up = dt >= 0 ? upFilter(rand(), 3900) * Math.exp(-dt * 215) * 0.54 : 0;
      const returnTone = dt >= 0 ? Math.sin(TAU * 760 * dt) * Math.exp(-dt * 82) * 0.2 : 0;
      return (down + frame + metal + deck + up + returnTone) * attack(i, 2);
    });
  },

  // Bright scissor mechanism: metal snap, frame resonance, and return click.
  "typewriter-scissor-metallic": () => {
    const downFilter = lowpass();
    const upFilter = lowpass();
    return render(0.11, (t, i) => {
      const down = downFilter(rand(), 6600) * Math.exp(-t * 250) * 1.25;
      const metalA = Math.sin(TAU * 1480 * t) * Math.exp(-t * 72) * 0.42;
      const metalB = Math.sin(TAU * 2260 * t) * Math.exp(-t * 104) * 0.24;
      const dt = t - 0.047;
      const up = dt >= 0 ? upFilter(rand(), 6100) * Math.exp(-dt * 285) * 0.62 : 0;
      const ring = dt >= 0 ? Math.sin(TAU * 1780 * dt) * Math.exp(-dt * 120) * 0.16 : 0;
      return (down + metalA + metalB + up + ring) * attack(i, 2);
    });
  },

  // Lower scissor key: darker mechanism with a compact aluminum-body resonance.
  "typewriter-scissor-low": () => {
    const downFilter = lowpass();
    const upFilter = lowpass();
    return render(0.12, (t, i) => {
      const down = downFilter(rand(), 3900) * Math.exp(-t * 215) * 1.28;
      const mechanism = Math.sin(TAU * 455 * t) * Math.exp(-t * 58) * 0.56;
      const metal = Math.sin(TAU * 1120 * t) * Math.exp(-t * 82) * 0.28;
      const chassis = Math.sin(TAU * 205 * t) * Math.exp(-t * 35) * 0.32;
      const dt = t - 0.052;
      const up = dt >= 0 ? upFilter(rand(), 4300) * Math.exp(-dt * 245) * 0.55 : 0;
      return (down + mechanism + metal + chassis + up) * attack(i, 2);
    });
  },

  // Deep scissor key: low notebook-deck body while retaining metallic actuation.
  "typewriter-scissor-deep": () => {
    const downFilter = lowpass();
    const upFilter = lowpass();
    return render(0.14, (t, i) => {
      const down = downFilter(rand(), 3200) * Math.exp(-t * 195) * 1.3;
      const key = Math.sin(TAU * 330 * t) * Math.exp(-t * 46) * 0.62;
      const deck = Math.sin(TAU * 142 * t) * Math.exp(-t * 27) * 0.52;
      const metal = Math.sin(TAU * 980 * t) * Math.exp(-t * 68) * 0.3;
      const dt = t - 0.058;
      const up = dt >= 0 ? upFilter(rand(), 3800) * Math.exp(-dt * 225) * 0.52 : 0;
      const returnTone = dt >= 0 ? Math.sin(TAU * 760 * dt) * Math.exp(-dt * 90) * 0.18 : 0;
      return (down + key + deck + metal + up + returnTone) * attack(i, 2);
    });
  },

  // Everyday notebook key: compact plastic impact followed by a quiet release.
  "typewriter-laptop": () => {
    const downFilter = lowpass();
    const upFilter = lowpass();
    return render(0.08, (t, i) => {
      const down = downFilter(rand(), 4300) * Math.exp(-t * 245) * 1.15;
      const shell = Math.sin(TAU * 640 * t) * Math.exp(-t * 92) * 0.42;
      const dt = t - 0.034;
      const up = dt >= 0 ? upFilter(rand(), 3600) * Math.exp(-dt * 280) * 0.55 : 0;
      return (down + shell + up) * attack(i, 2);
    });
  },

  // Slim chiclet key: dry, shallow tap with almost no low-frequency body.
  "typewriter-chiclet": () => {
    const lp = lowpass();
    return render(0.07, (t, i) => {
      const tap = lp(rand(), 5100) * Math.exp(-t * 285) * 1.05;
      const plastic = Math.sin(TAU * 980 * t) * Math.exp(-t * 135) * 0.34;
      const edge = Math.sin(TAU * 1760 * t) * Math.exp(-t * 185) * 0.16;
      return (tap + plastic + edge) * attack(i, 2);
    });
  },

  // Scissor-switch notebook key: defined actuation and a lighter return click.
  "typewriter-scissor": () => {
    const downFilter = lowpass();
    const upFilter = lowpass();
    return render(0.09, (t, i) => {
      const down = downFilter(rand(), 4700) * Math.exp(-t * 225) * 1.2;
      const mechanism = Math.sin(TAU * 760 * t) * Math.exp(-t * 82) * 0.4;
      const dt = t - 0.044;
      const upNoise = dt >= 0 ? upFilter(rand(), 5200) * Math.exp(-dt * 260) * 0.62 : 0;
      const upTone = dt >= 0 ? Math.sin(TAU * 1240 * dt) * Math.exp(-dt * 145) * 0.18 : 0;
      return (down + mechanism + upNoise + upTone) * attack(i, 2);
    });
  },

  // Keyboard tap: dull filtered burst with a low thock.
  typewriter: () => {
    const lp = lowpass();
    return render(0.08, (t, i) => {
      const burst = lp(rand(), 3000) * Math.exp(-t * 180) * 1.6;
      const thock = Math.sin(TAU * 900 * t) * Math.exp(-t * 120) * 0.4;
      return (burst + thock) * attack(i, 3);
    });
  },

  // Muted membrane key: low noise and a rounded, quiet body.
  "typewriter-soft": () => {
    const lp = lowpass();
    return render(0.07, (t, i) => {
      const felt = lp(rand(), 1500) * Math.exp(-t * 150) * 0.9;
      const body = Math.sin(TAU * 310 * t) * Math.exp(-t * 85) * 0.38;
      return (felt + body) * attack(i, 4);
    });
  },

  // Mechanical switch: bright actuation click plus lower keycap resonance.
  "typewriter-mechanical": () => {
    const lp = lowpass();
    return render(0.11, (t, i) => {
      const click = lp(rand(), 7200) * Math.exp(-t * 260) * 1.6;
      const spring = Math.sin(TAU * 2250 * t) * Math.exp(-t * 110) * 0.35;
      const keycap = Math.sin(TAU * 470 * t) * Math.exp(-t * 48) * 0.55;
      return (click + spring + keycap) * attack(i, 2);
    });
  },

  // Digital terminal tap: precise square-like chirp with almost no tail.
  "typewriter-digital": () => {
    return render(0.06, (t, i) => {
      const chirp = Math.sign(Math.sin(TAU * (1680 - t * 5400) * t));
      const tone = Math.sin(TAU * 1120 * t);
      const envelope = Math.exp(-t * 115);
      return (chirp * 0.32 + tone * 0.52) * envelope * attack(i, 3);
    });
  },

  // Heavy typebar strike: hard transient, metal clack, and desk resonance.
  "typewriter-heavy": () => {
    const lp = lowpass();
    return render(0.13, (t, i) => {
      const strike = lp(rand(), 4800) * Math.exp(-t * 190) * 1.8;
      const metal = Math.sin(TAU * 1320 * t) * Math.exp(-t * 72) * 0.42;
      const desk = Math.sin(TAU * 175 * t) * Math.exp(-t * 28) * 0.72;
      return (strike + metal + desk) * attack(i, 2);
    });
  },

  // Deep keycap thock: muted top end with a dense wooden resonance.
  "typewriter-thock": () => {
    const lp = lowpass();
    return render(0.15, (t, i) => {
      const strike = lp(rand(), 2600) * Math.exp(-t * 175) * 1.4;
      const keycap = Math.sin(TAU * 340 * t) * Math.exp(-t * 42) * 0.74;
      const board = Math.sin(TAU * 128 * t) * Math.exp(-t * 23) * 0.66;
      return (strike + keycap + board) * attack(i, 3);
    });
  },

  // Steel mechanism: hard body plus two inharmonic metallic resonances.
  "typewriter-steel": () => {
    const lp = lowpass();
    return render(0.18, (t, i) => {
      const strike = lp(rand(), 6100) * Math.exp(-t * 205) * 1.65;
      const metalA = Math.sin(TAU * 1465 * t) * Math.exp(-t * 38) * 0.5;
      const metalB = Math.sin(TAU * 2137 * t) * Math.exp(-t * 51) * 0.28;
      const body = Math.sin(TAU * 205 * t) * Math.exp(-t * 25) * 0.58;
      return (strike + metalA + metalB + body) * attack(i, 2);
    });
  },

  // Slam: broad transient and strong low body for maximum typographic impact.
  "typewriter-slam": () => {
    const lp = lowpass();
    let phase = 0;
    return render(0.2, (t, i) => {
      const pitch = 115 + 95 * Math.exp(-t * 25);
      phase += (TAU * pitch) / SR;
      const transient = lp(rand(), 5300) * Math.exp(-t * 145) * 2;
      const low = Math.sin(phase) * Math.exp(-t * 18) * 0.9;
      const clack = Math.sin(TAU * 980 * t) * Math.exp(-t * 54) * 0.4;
      return (transient + low + clack) * attack(i, 2);
    });
  },

  // Neutral push-button press: short actuation with a balanced plastic body.
  "typewriter-button": () => {
    const lp = lowpass();
    return render(0.09, (t, i) => {
      const press = lp(rand(), 3900) * Math.exp(-t * 205) * 1.25;
      const body = Math.sin(TAU * 610 * t) * Math.exp(-t * 70) * 0.5;
      const release = Math.sin(TAU * 1080 * t) * Math.exp(-t * 125) * 0.2;
      return (press + body + release) * attack(i, 3);
    });
  },

  // Mid-weight switch actuation: tactile bump without heavy low resonance.
  "typewriter-switch": () => {
    const lp = lowpass();
    return render(0.1, (t, i) => {
      const tactile = lp(rand(), 4700) * Math.exp(-t * 220) * 1.3;
      const switchTone = Math.sin(TAU * 790 * t) * Math.exp(-t * 78) * 0.46;
      const base = Math.sin(TAU * 285 * t) * Math.exp(-t * 48) * 0.34;
      return (tactile + switchTone + base) * attack(i, 2);
    });
  },

  // Rounded keycap press with a tiny delayed release click.
  "typewriter-keycap": () => {
    const lp = lowpass();
    return render(0.12, (t, i) => {
      const down = lp(rand(), 3300) * Math.exp(-t * 175) * 1.25;
      const cap = Math.sin(TAU * 455 * t) * Math.exp(-t * 55) * 0.52;
      const dt = t - 0.052;
      const up = dt >= 0 ? Math.sin(TAU * 1250 * dt) * Math.exp(-dt * 125) * 0.3 : 0;
      return (down + cap + up) * attack(i, 3);
    });
  },

  // Tactile mouse/button click with a compact low body.
  click: () => {
    const lp = lowpass();
    return render(0.08, (t, i) => {
      const snap = lp(rand(), 5200) * Math.exp(-t * 260) * 1.4;
      const body = Math.sin(TAU * 420 * t) * Math.exp(-t * 90) * 0.55;
      return (snap + body) * attack(i, 2);
    });
  },

  // Crisp click: tiny high-frequency snap for compact UI actions.
  "click-crisp": () => {
    const lp = lowpass();
    return render(0.06, (t, i) => {
      const snap = lp(rand(), 7600) * Math.exp(-t * 310) * 1.6;
      const ping = Math.sin(TAU * 2450 * t) * Math.exp(-t * 155) * 0.34;
      return (snap + ping) * attack(i, 2);
    });
  },

  // Round click: warmer button body with restrained top end.
  "click-round": () => {
    const lp = lowpass();
    return render(0.1, (t, i) => {
      const touch = lp(rand(), 2500) * Math.exp(-t * 185) * 1.15;
      const body = Math.sin(TAU * 390 * t) * Math.exp(-t * 58) * 0.62;
      return (touch + body) * attack(i, 3);
    });
  },

  // Glass click: bright tap with two clean, quickly decaying partials.
  "click-glass": () => {
    const lp = lowpass();
    return render(0.16, (t, i) => {
      const tap = lp(rand(), 6200) * Math.exp(-t * 260) * 0.9;
      const glassA = Math.sin(TAU * 1840 * t) * Math.exp(-t * 38) * 0.52;
      const glassB = Math.sin(TAU * 2765 * t) * Math.exp(-t * 52) * 0.25;
      return (tap + glassA + glassB) * attack(i, 7);
    });
  },

  // Two-stage switch: a quiet mechanical click followed by a bright on tone.
  toggle: () => {
    const lp = lowpass();
    return render(0.16, (t, i) => {
      const first = (lp(rand(), 3600) + Math.sin(TAU * 380 * t)) * Math.exp(-t * 130);
      const dt = Math.max(0, t - 0.055);
      const on = t >= 0.055 ? Math.sin(TAU * 980 * dt) * Math.exp(-dt * 34) : 0;
      return (first * 0.45 + on * 0.8) * attack(i, 3);
    });
  },

  // Ascending major triad for positive confirmations.
  success: () => {
    const notes = [523.25, 659.25, 783.99];
    return render(0.8, (t, i) => {
      let value = 0;
      for (let n = 0; n < notes.length; n++) {
        const dt = t - n * 0.095;
        if (dt >= 0) {
          value += Math.sin(TAU * notes[n] * dt) * Math.exp(-dt * 6.8) * 0.72;
          value += Math.sin(TAU * notes[n] * 2 * dt) * Math.exp(-dt * 12) * 0.16;
        }
      }
      return value * attack(i, 60);
    });
  },

  // Descending double tone for errors without an aggressive alarm character.
  error: () => {
    return render(0.5, (t, i) => {
      const first = Math.sin(TAU * 310 * t) * Math.exp(-t * 8);
      const dt = Math.max(0, t - 0.13);
      const second = t >= 0.13 ? Math.sin(TAU * 220 * dt) * Math.exp(-dt * 7) : 0;
      const grit = Math.sin(TAU * 620 * t) * Math.exp(-t * 14) * 0.13;
      return (first * 0.65 + second * 0.72 + grit) * attack(i, 50);
    });
  },

  // Friendly two-note inbox/message chime.
  notification: () => {
    return render(0.7, (t, i) => {
      const first = Math.sin(TAU * 880 * t) * Math.exp(-t * 9);
      const dt = Math.max(0, t - 0.12);
      const second = t >= 0.12 ? Math.sin(TAU * 1174.66 * dt) * Math.exp(-dt * 6) : 0;
      const air = Math.sin(TAU * 2349.32 * dt) * Math.exp(-dt * 12) * 0.18;
      return (first * 0.5 + second * 0.7 + air) * attack(i, 90);
    });
  },

  // Staggered high chimes for premium/glossy reveals.
  sparkle: () => {
    const starts = [0, 0.075, 0.145, 0.22];
    const notes = [1396.91, 1760, 2093, 2637.02];
    return render(0.9, (t, i) => {
      let value = 0;
      for (let n = 0; n < notes.length; n++) {
        const dt = t - starts[n];
        if (dt >= 0) {
          value += Math.sin(TAU * notes[n] * dt) * Math.exp(-dt * (8 + n)) * 0.46;
          value += Math.sin(TAU * notes[n] * 2.01 * dt) * Math.exp(-dt * 15) * 0.1;
        }
      }
      return value * attack(i, 100);
    });
  },

  // Short tonal upsweep for fast-moving labels and titles.
  swoop: () => {
    let phase = 0;
    const lp = lowpass();
    const T = 0.38;
    return render(T, (t, i) => {
      const p = t / T;
      const f = 260 + 1500 * p * p;
      phase += (TAU * f) / SR;
      const envelope = Math.sin(Math.PI * p) ** 1.3;
      return (Math.sin(phase) * 0.48 + lp(rand(), 1800 + p * 3200) * 0.7) * envelope * attack(i, 20);
    });
  },

  // Longer filtered-noise build ending cleanly at the reveal point.
  riser: () => {
    const lp = lowpass();
    let phase = 0;
    const T = 1.2;
    return render(T, (t, i) => {
      const p = t / T;
      phase += (TAU * (120 + 760 * p * p)) / SR;
      const end = Math.min(1, (T - t) * 24);
      const noise = lp(rand(), 350 + 5200 * p * p) * (0.25 + p * 1.5);
      return (noise + Math.sin(phase) * p * 0.35) * end * attack(i, 180);
    });
  },

  // Sub-heavy cinematic hit with a short noisy transient and decaying tail.
  impact: () => {
    const lp = lowpass();
    let phase = 0;
    return render(0.8, (t, i) => {
      const f = 48 + 72 * Math.exp(-t * 22);
      phase += (TAU * f) / SR;
      const sub = Math.sin(phase) * Math.exp(-t * 4.8);
      const hit = lp(rand(), 1300) * Math.exp(-t * 19) * 1.8;
      return (sub + hit) * attack(i, 8);
    });
  },

  // Gated digital interference for micro glitch cuts.
  glitch: () => {
    let held = 0;
    return render(0.34, (t, i) => {
      if (i % 37 === 0) held = rand();
      const gate = Math.floor(t * 52) % 3 === 0 ? 1 : 0.22;
      const tone = Math.sign(Math.sin(TAU * (620 + Math.floor(t * 12) * 55) * t));
      const envelope = Math.min(1, (0.34 - t) * 18);
      return (held * 0.62 + tone * 0.22) * gate * envelope * attack(i, 4);
    });
  },

  // Mechanical camera shutter: close and release transients.
  shutter: () => {
    const lp = lowpass();
    return render(0.26, (t, i) => {
      const clickAt = (start, decay) => {
        const dt = t - start;
        return dt >= 0 ? lp(rand(), 5600) * Math.exp(-dt * decay) : 0;
      };
      const close = clickAt(0, 95);
      const release = clickAt(0.105, 72);
      const body = Math.sin(TAU * 180 * t) * Math.exp(-t * 18) * 0.26;
      return (close * 1.3 + release + body) * attack(i, 2);
    });
  },

  // Soft directional swipe built from a compact filtered-noise pass.
  swipe: () => {
    const lp = lowpass();
    const T = 0.3;
    return render(T, (t) => {
      const p = t / T;
      const envelope = Math.sin(Math.PI * p) ** 1.7;
      return lp(rand(), 900 + 3700 * p) * envelope * 2;
    });
  },

  // Rounded low pitch drop for punchlines and contrast beats.
  drop: () => {
    let phase = 0;
    return render(0.4, (t, i) => {
      const f = 520 * Math.exp(-t * 8.5) + 74;
      phase += (TAU * f) / SR;
      const body = Math.sin(phase) * Math.exp(-t * 6.2);
      const harmonic = Math.sin(phase * 2) * Math.exp(-t * 11) * 0.24;
      return (body + harmonic) * attack(i, 35);
    });
  },

  // Futuristic display boot: power transient, scan chirp, and ready ping.
  display: () => {
    const lp = lowpass();
    let phase = 0;
    return render(0.56, (t, i) => {
      const scanProgress = Math.min(1, t / 0.28);
      phase += (TAU * (360 + 1540 * scanProgress)) / SR;
      const scan = Math.sin(phase) * Math.sin(Math.PI * scanProgress) * (t < 0.28 ? 0.45 : 0);
      const boot = lp(rand(), 2300) * Math.exp(-t * 36) * 0.7;
      const dt = Math.max(0, t - 0.27);
      const ready = t >= 0.27 ? Math.sin(TAU * 1318.51 * dt) * Math.exp(-dt * 9) * 0.7 : 0;
      return (scan + boot + ready) * attack(i, 12);
    });
  },
};

const writeWav = (path, samples) => {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.5 / peak : 0;
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = samples[i] * gain * 32767;

  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  writeFileSync(path, buf);
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "sfx");
mkdirSync(outDir, { recursive: true });

for (const [name, make] of Object.entries(SOUNDS)) {
  const out = join(outDir, `${name}.wav`);
  const samples = make();
  writeWav(out, samples);
  console.log(`Wrote ${out} (${(samples.length / SR).toFixed(2)}s)`);
}
