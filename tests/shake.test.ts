import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHAKE_BASE_FREQUENCY,
  SHAKE_PERSPECTIVE,
  shakeEnvelope,
  shakePeak,
  shakeTopFrequency,
  shakeTransform,
  type ShakeConfig,
} from "../src/player/shake";
import { stickerDef } from "../src/templates/sticker";
import { TEMPLATE_DEFAULT_MOTION } from "../src/templates/registry";
import { editSpec, objectMotion } from "../src/spec/types";

const cfg = (over: Partial<ShakeConfig> = {}): ShakeConfig => ({
  style: "shake",
  amount: 0.6,
  seed: 1,
  rampSec: 0.25,
  ...over,
});

const parts = (css: string) => {
  const m = css.match(
    /^translate\((-?[\d.]+)%, (-?[\d.]+)%\) rotate\((-?[\d.]+)deg\) scale\(([\d.]+)\)$/,
  );
  assert.ok(m, `unparsable transform: ${css}`);
  return { x: +m[1], y: +m[2], rotate: +m[3], scale: +m[4] };
};

const parts3d = (css: string) => {
  const m = css.match(
    /^translate\((-?[\d.]+)%, (-?[\d.]+)%\) rotateY\((-?[\d.]+)deg\) rotateX\((-?[\d.]+)deg\) scale\(([\d.]+)\)$/,
  );
  assert.ok(m, `unparsable 3D transform: ${css}`);
  return { x: +m[1], y: +m[2], rotateY: +m[3], rotateX: +m[4], scale: +m[5] };
};

test("shake is off by style and by amount", () => {
  assert.equal(shakeTransform(1, cfg({ style: "none" })), "none");
  assert.equal(shakeTransform(1, cfg({ amount: 0 })), "none");
});

test("the ramp starts the element exactly where it was laid out", () => {
  const at0 = parts(shakeTransform(0, cfg()));
  assert.deepEqual(at0, { x: 0, y: 0, rotate: 0, scale: 1 });
  // and reaches full gain by rampSec, so the tremble is not permanently damped
  assert.equal(shakeEnvelope(0.25, 0.25), 1);
  assert.ok(shakeEnvelope(0.125, 0.25) > 0.3 && shakeEnvelope(0.125, 0.25) < 0.7);
});

test("same second, same seed, same transform (preview equals every render worker)", () => {
  for (const t of [0.4, 1.7, 9.13]) {
    assert.equal(shakeTransform(t, cfg()), shakeTransform(t, cfg()));
  }
});

test("seed shifts phase, so two stickers never move in lockstep", () => {
  assert.notEqual(shakeTransform(1.2, cfg({ seed: 1 })), shakeTransform(1.2, cfg({ seed: 4 })));
});

test("displacement stays inside the style's declared peak", () => {
  for (const style of ["shake", "wobble", "float"] as const) {
    const amount = 1;
    const peak = shakePeak(style, amount);
    for (let f = 0; f < 600; f++) {
      const t = 1 + f / 60; // past the ramp, full gain
      const p = parts(shakeTransform(t, cfg({ style, amount })));
      assert.ok(Math.abs(p.x) <= peak.x + 1e-6, `${style} x ${p.x} > ${peak.x}`);
      assert.ok(Math.abs(p.y) <= peak.y + 1e-6, `${style} y ${p.y} > ${peak.y}`);
      assert.ok(Math.abs(p.rotate) <= peak.rotate + 1e-6, `${style} rot ${p.rotate}`);
      assert.ok(p.scale > 0.9 && p.scale < 1.1);
    }
  }
});

test("dominant tempos: a rock is faster than a hand is faster than a bob", () => {
  // wobble and float are single-tempo, so their base frequencies compare
  // directly. `shake` is broadband, and its DOMINANT octave sits between them:
  // a held object drifts at well under 1Hz, it does not oscillate. Its faster
  // octaves carry only a tenth of the amplitude (see SHAKE_OCTAVES).
  assert.ok(SHAKE_BASE_FREQUENCY.wobble > SHAKE_BASE_FREQUENCY.shake);
  assert.ok(SHAKE_BASE_FREQUENCY.shake > SHAKE_BASE_FREQUENCY.float);
  assert.ok(SHAKE_BASE_FREQUENCY.shake < 1, "a hand drifts below 1Hz");
});

test("no style aliases at the slowest supported render fps", () => {
  // Above Nyquist a sine is undersampled and the sticker strobes instead of
  // moving. This is the regression that made the old 8.5Hz `shake` unusable:
  // its harmonic sat at ~19.5Hz, past the 15Hz limit of a 30fps render.
  const nyquist30 = 30 / 2;
  for (const style of ["shake", "wobble", "float", "sway-3d"] as const) {
    assert.ok(
      shakeTopFrequency(style) < nyquist30,
      `${style} top octave ${shakeTopFrequency(style)}Hz aliases at 30fps`,
    );
  }
});

test("shake reads as a hand, not a buzz: it rarely reverses direction", () => {
  // The tell of a vibration is that it changes direction nearly every frame. A
  // hand drifts, corrects, drifts again. Measured on x over 8 seconds of 30fps
  // frames: the old 8.5Hz stack reversed 16.9 times a second and jumped up to
  // 14.6% of the box between frames; this one reverses 2.5 times.
  const fps = 30;
  const seconds = 8;
  const xs: number[] = [];
  for (let f = fps; f <= fps * (seconds + 1); f++) {
    xs.push(parts(shakeTransform(f / fps, cfg({ amount: 1 }))).x);
  }
  let reversals = 0;
  for (let i = 2; i < xs.length; i++) {
    const before = xs[i - 1] - xs[i - 2];
    const after = xs[i] - xs[i - 1];
    if (before * after < 0) reversals++;
  }
  const perSecond = reversals / seconds;
  assert.ok(perSecond < 8, `${perSecond.toFixed(1)} direction reversals per second`);
});

test("sway-3d turns through depth and asks for the perspective that makes it read", () => {
  const at0 = parts3d(shakeTransform(0, cfg({ style: "sway-3d" })));
  assert.deepEqual(at0, { x: 0, y: 0, rotateY: 0, rotateX: 0, scale: 1 });

  // rotateY is the effect; an in-plane roll would fight the depth cue, so the
  // 3D output shape has no `rotate()` at all.
  let peakSeen = 0;
  for (let f = 0; f < 60 * 12; f++) {
    const p = parts3d(shakeTransform(2 + f / 60, cfg({ style: "sway-3d", amount: 1 })));
    peakSeen = Math.max(peakSeen, Math.abs(p.rotateY));
  }
  const peak = shakePeak("sway-3d", 1);
  assert.ok(peakSeen > peak.rotateY * 0.9, `only reached ${peakSeen.toFixed(1)}deg of ${peak.rotateY}`);
  assert.ok(peakSeen <= peak.rotateY + 1e-6);
  assert.equal(peak.rotate, 0, "sway-3d must not add an in-plane roll");

  // The projection is the difference between a turn and a horizontal squash,
  // and a 3D context on a flat style is a compositor layer bought for nothing.
  assert.equal(SHAKE_PERSPECTIVE["sway-3d"], 1400);
  for (const flat of ["shake", "wobble", "float"] as const) {
    assert.equal(SHAKE_PERSPECTIVE[flat], null, `${flat} must stay flat`);
  }
});

test("the ramp-out lands the element back where layout put it", () => {
  const windowSec = 6;
  const rampOutSec = 0.4;
  const settled = parts(
    shakeTransform(windowSec, cfg({ style: "shake", amount: 1, windowSec, rampOutSec })),
  );
  assert.deepEqual(settled, { x: 0, y: 0, rotate: 0, scale: 1 });

  // Still moving before the ramp starts, so the settle is a landing, not a
  // motion that was quietly damped for its whole window.
  const mid = parts(
    shakeTransform(windowSec / 2, cfg({ style: "shake", amount: 1, windowSec, rampOutSec })),
  );
  assert.ok(Math.abs(mid.x) > 0.5, `mid-window x was ${mid.x}`);

  // Ramps longer than the window damp the peak instead of throwing.
  const cramped = shakeEnvelope(0.5, 3, 1, 3);
  assert.ok(cramped > 0 && cramped < 1, `cramped envelope ${cramped}`);
});

test("a skew sweeps once, ending facing the way it is named", () => {
  const windowSec = 8;
  const at = (t: number, style: "skew-right" | "skew-left" | "skew-up" | "skew-down") =>
    parts3d(shakeTransform(t, cfg({ style, amount: 1, windowSec })));

  // CSS rotateY(+) pushes the right edge away and brings the left one forward,
  // which aims the card's FACE right. Naming follows the face, so skew-right
  // ends positive, having started at the opposite extreme.
  const right = { start: at(0, "skew-right"), mid: at(4, "skew-right"), end: at(8, "skew-right") };
  assert.ok(right.end.rotateY > 0, `must end facing right, got ${right.end.rotateY}`);
  assert.ok(right.start.rotateY < 0, `must start facing left, got ${right.start.rotateY}`);
  assert.ok(Math.abs(right.mid.rotateY) < 1e-6, "passes through flat at the midpoint");
  // Travels along the axis it turns about, so the move reads as one gesture.
  assert.ok(right.start.x < 0 && right.end.x > 0, "sweep must carry the card rightward");
  assert.equal(right.end.rotateX, 0, "the vertical-axis pair must not also tumble");

  const left = { start: at(0, "skew-left"), end: at(8, "skew-left") };
  assert.equal(left.end.rotateY, -right.end.rotateY, "skew-left is the exact mirror");
  // Chaining the pair is seamless: skew-right ends exactly where skew-left starts.
  assert.equal(right.end.rotateY, left.start.rotateY);

  // rotateX(+) brings the bottom edge forward and pushes the top away, aiming
  // the face up: the reference pose with a narrow top and a wide base.
  const up = { start: at(0, "skew-up"), end: at(8, "skew-up") };
  assert.ok(up.end.rotateX > 0, `must end facing up, got ${up.end.rotateX}`);
  assert.equal(up.end.rotateY, 0, "the horizontal-axis pair must not also turn sideways");
  assert.ok(up.end.y > 0 && up.start.y < 0, "sweep must carry the card downward as it tips up");
  assert.equal(at(8, "skew-down").rotateX, -up.end.rotateX, "skew-down is the exact mirror");
});

test("a skew is one-shot: it never doubles back inside its window", () => {
  const windowSec = 8;
  const fps = 30;
  let reversals = 0;
  let previous: number | null = null;
  let lastDelta = 0;
  for (let f = 0; f <= windowSec * fps; f++) {
    const { rotateY } = parts3d(
      shakeTransform(f / fps, cfg({ style: "skew-right", amount: 1, windowSec })),
    );
    if (previous !== null) {
      const delta = rotateY - previous;
      if (lastDelta !== 0 && delta !== 0 && lastDelta * delta < 0) reversals++;
      if (delta !== 0) lastDelta = delta;
    }
    previous = rotateY;
  }
  assert.equal(reversals, 0, "a sweep turns one way only");

  // Past the window it holds its final pose instead of wrapping around.
  const held = parts3d(shakeTransform(windowSec * 3, cfg({ style: "skew-right", amount: 1, windowSec })));
  const end = parts3d(shakeTransform(windowSec, cfg({ style: "skew-right", amount: 1, windowSec })));
  assert.deepEqual(held, end);
});

test("one-shot styles ignore the knobs that only an oscillation can use", () => {
  const windowSec = 5;
  const base = cfg({ style: "skew-right", amount: 1, windowSec });
  // frequency and seed shape a wave; a single pass has neither to shape.
  assert.equal(
    shakeTransform(2, base),
    shakeTransform(2, { ...base, frequency: 12, seed: 99 }),
  );
  // The ramps must NOT apply: an envelope that ends at zero would drag the
  // sweep's far end back to flat and turn it into a there-and-back.
  assert.equal(
    shakeTransform(windowSec, base),
    shakeTransform(windowSec, { ...base, rampSec: 2, rampOutSec: 2 }),
  );
  assert.ok(Math.abs(parts3d(shakeTransform(windowSec, base)).rotateY) > 1);
});

test("motion and camera both stack at overlay scope", () => {
  const spec = editSpec.parse({
    version: 1,
    durationSec: 12,
    source: { type: "none" },
    overlays: [
      {
        template: "quote-card",
        camera: [
          { preset: "pull-out", amount: 0.25, time: { start: 0, duration: 4 } },
          { preset: "pan-right", amount: 0.1, time: { start: "5s", duration: "4s" } },
        ],
        motion: [
          { style: "sway-3d", amount: 0.5 },
          { style: "shake", amount: 0.15, time: { start: "2s", duration: "6s" } },
        ],
        props: { quote: "Ship it." },
      },
    ],
  });
  const overlay = spec.overlays[0];
  assert.ok(Array.isArray(overlay.camera) && overlay.camera.length === 2);
  assert.ok(Array.isArray(overlay.motion) && overlay.motion.length === 2);
  assert.equal(overlay.motion[0].style, "sway-3d");
  assert.equal(overlay.motion[1].time?.start, "2s");
  // Window and ramps arrive resolved, so a track never reaches the renderer half-set.
  assert.equal(overlay.motion[0].rampOutSec, 0.4);
  assert.equal(overlay.motion[0].time, undefined, "unset time means the whole overlay window");
});

test("sticker declares its drift instead of implementing one", () => {
  // The effect is `overlay.motion`, owned by the renderer. A template that
  // re-added a private `shake` prop would be shipping a second implementation
  // that stacks into a double shake, so the schema must not carry one.
  const props = stickerDef.schema.parse({ src: "/pickle.png" });
  assert.equal(props.fit, "contain");
  assert.ok(!("shake" in props), "sticker must not own a shake prop");
  assert.equal(objectMotion.parse(stickerDef.defaultMotion).style, "shake");
  assert.equal(TEMPLATE_DEFAULT_MOTION.sticker.style, "shake");
});

test("motion stacks with a camera, an enter and an exit on any template", () => {
  // The point of the whole layer: a quote card can pull out and drift at once.
  const spec = editSpec.parse({
    version: 1,
    durationSec: 10,
    source: { type: "none" },
    overlays: [
      {
        template: "quote-card",
        region: { x: 60, y: 10, w: 30, h: 40 },
        time: { start: "1s", duration: "5s" },
        enter: "spring",
        exit: "vanish",
        camera: { preset: "pull-out", amount: 0.4, time: { start: "3s" } },
        motion: { style: "shake", amount: 0.3 },
        props: { quote: "Ship it." },
      },
    ],
  });
  const overlay = spec.overlays[0];
  assert.equal(overlay.exit, "vanish");
  assert.equal(overlay.camera?.preset, "pull-out");
  assert.equal(overlay.motion?.style, "shake");
  assert.equal(overlay.motion?.amount, 0.3);
  // Unset knobs still arrive resolved, so the renderer never sees a partial.
  assert.equal(overlay.motion?.seed, 1);
  assert.equal(overlay.motion?.rampSec, 0.25);
});

test("a spec can switch a template's shipped motion off", () => {
  const spec = editSpec.parse({
    version: 1,
    durationSec: 4,
    source: { type: "none" },
    overlays: [
      { template: "sticker", motion: { style: "none" }, props: { src: "/pickle.png" } },
    ],
  });
  assert.equal(spec.overlays[0].motion?.style, "none");
  assert.equal(shakeTransform(1, { ...spec.overlays[0].motion!, amount: 1 }), "none");
});
