// Generates public/demo/audiogram-song.wav: an original 12s instrumental song
// (melody, chord progression, bass and drums) for the Audiogram preview.
// No ffmpeg needed: plain PCM16 WAV written by hand.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const SECONDS = 12;
const BPM = 120;
const N = SR * SECONDS;
const beatSec = 60 / BPM;
const eighthSec = beatSec / 2;
const barSec = beatSec * 4;

const left = new Float64Array(N);
const right = new Float64Array(N);

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const progression = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [60, 64, 67], // C
  [55, 59, 62], // G
];
const melody = [
  69, 72, 76, 72, 71, 69, 67, 64,
  69, 72, 77, 76, 72, 69, 67, null,
  67, 72, 76, 79, 76, 72, 71, 67,
  67, 71, 74, 79, 76, 74, 71, null,
  69, 72, 76, 81, 79, 76, 72, 69,
  69, 72, 77, 76, 72, 69, 67, 64,
];

// Deterministic noise keeps generated asset byte-for-byte reproducible.
let noiseSeed = 0x51f15e;
const noise = () => {
  noiseSeed = (1664525 * noiseSeed + 1013904223) >>> 0;
  return noiseSeed / 0xffffffff * 2 - 1;
};

for (let i = 0; i < N; i++) {
  const t = i / SR;
  const barIndex = Math.floor(t / barSec);
  const chord = progression[barIndex % progression.length];
  const barT = t % barSec;
  const beatT = t % beatSec;
  const beatIndex = Math.floor(barT / beatSec);
  const eighthT = t % eighthSec;
  const eighthIndex = Math.floor(t / eighthSec);

  // Warm stereo pad carrying the Am-F-C-G progression.
  let pad = 0;
  for (const note of chord) {
    const f = midiToHz(note);
    pad += (Math.sin(2 * Math.PI * f * t) + 0.24 * Math.sin(2 * Math.PI * f * 2 * t)) / chord.length;
  }
  const swell = 0.72 + 0.28 * Math.sin(2 * Math.PI * barT / barSec - Math.PI / 2);
  pad *= 0.15 * swell;

  // Root-note bass pulses each beat.
  const bassHz = midiToHz(chord[0] - 12);
  const bass = (
    Math.sin(2 * Math.PI * bassHz * t) +
    0.2 * Math.sin(2 * Math.PI * bassHz * 2 * t)
  ) * Math.exp(-beatT * 4.5) * 0.24;

  // Lead melody: short plucked synth notes above the progression.
  const melodyNote = melody[eighthIndex % melody.length];
  const melodyEnvelope = (1 - Math.exp(-eighthT * 70)) * Math.exp(-eighthT * 7);
  const lead = melodyNote === null
    ? 0
    : (
        Math.sin(2 * Math.PI * midiToHz(melodyNote) * t) +
        0.28 * Math.sin(2 * Math.PI * midiToHz(melodyNote) * 2 * t)
      ) * melodyEnvelope * 0.2;

  // Four-on-the-floor kick, backbeat snare and eighth-note hi-hat.
  const kick = Math.sin(
    2 * Math.PI * (52 + 72 * Math.exp(-beatT * 30)) * beatT
  ) * Math.exp(-beatT * 18) * 0.58;
  const snare = (beatIndex === 1 || beatIndex === 3)
    ? noise() * Math.exp(-beatT * 17) * 0.16
    : 0;
  const hat = noise() * Math.exp(-eighthT * 85) * 0.055;

  const rhythm = bass + kick + snare + hat;
  const pan = 0.5 + 0.5 * Math.sin(eighthIndex * 1.7);
  left[i] = pad * 0.96 + rhythm + lead * (0.72 + 0.2 * (1 - pan));
  right[i] = pad * 1.04 + rhythm + lead * (0.72 + 0.2 * pan);
}

let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const master = peak > 0 ? 0.88 / peak : 1;

const pcm = new Int16Array(N * 2);
for (let i = 0; i < N; i++) {
  pcm[i * 2] = Math.max(-1, Math.min(1, left[i] * master)) * 32767;
  pcm[i * 2 + 1] = Math.max(-1, Math.min(1, right[i] * master)) * 32767;
}

const dataSize = pcm.length * 2;
const buf = Buffer.alloc(44 + dataSize);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(2, 22); // stereo
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 2 * 2, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(dataSize, 40);
Buffer.from(pcm.buffer).copy(buf, 44);

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "demo", "audiogram-song.wav");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`Wrote ${out} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
