import assert from "node:assert/strict";
import { test } from "node:test";
import { activeCaptionAt } from "../src/templates/caption-classic/timing";

const lines = [
  {
    text: "Keep my face visible",
    start: 0.5,
    end: 2.5,
    words: [
      { text: "Keep", start: 0.5, end: 0.9 },
      { text: "my", start: 1.0, end: 1.2 },
      { text: "face", start: 1.2, end: 1.8 },
      { text: "visible", start: 2.0, end: 2.5 },
    ],
  },
];

test("word timestamps select the actually spoken word", () => {
  assert.equal(activeCaptionAt({ lines, nowSec: 1.35, durationSec: 4 })?.activeWord, 2);
});

test("phrase windows preserve silent gaps", () => {
  assert.equal(activeCaptionAt({ lines, nowSec: 0.2, durationSec: 4 }), null);
  assert.equal(activeCaptionAt({ lines, nowSec: 2.7, durationSec: 4 }), null);
});

test("a gap between word cues holds the last started word", () => {
  assert.equal(activeCaptionAt({ lines, nowSec: 1.9, durationSec: 4 })?.activeWord, 2);
});

test("word highlighting can clear during gaps", () => {
  assert.equal(
    activeCaptionAt({
      lines,
      nowSec: 1.9,
      durationSec: 4,
      highlightDuringGaps: false,
    })?.activeWord,
    null,
  );
});

test("semantic word marks survive timing resolution", () => {
  const marked = [
    {
      text: "Style this word",
      start: 0,
      end: 1,
      words: [
        { text: "Style", start: 0, end: 0.3 },
        { text: "this", start: 0.3, end: 0.5 },
        { text: "word", start: 0.5, end: 1, marks: ["buzzword" as const] },
      ],
    },
  ];
  assert.deepEqual(
    activeCaptionAt({ lines: marked, nowSec: 0.7, durationSec: 1 })?.words[2].marks,
    ["buzzword"],
  );
});

test("legacy text-only lines retain deterministic even timing", () => {
  const active = activeCaptionAt({
    lines: [{ text: "one two" }, { text: "three four" }],
    nowSec: 2.5,
    durationSec: 4,
  });
  assert.deepEqual(active, {
    lineIndex: 1,
    words: [{ text: "three" }, { text: "four" }],
    activeWord: 0,
  });
});
