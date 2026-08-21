import { Fragment, useMemo } from "react";
import { z } from "zod/v3";
import { useVideoConfig } from "remotion";
import { useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { pop, useInOut } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  messages: z
    .array(
      z.object({
        text: z.string(),
        side: z.enum(["left", "right"]).default("left"),
        /** Extra pause before this message; typing dots run through it. Shifts everything after. */
        delaySec: z.number().min(0).default(0),
      })
    )
    .min(1)
    .max(8),
  secondsPerMessage: z.number().default(1.1),
  sfx: templateSfx
    .default("pop")
    .describe("Sound as each bubble lands. `false` is silence."),
  typingSfx: templateSfx
    .default("chat-typing")
    .describe(
      "Blip under the typing dots before a bubble lands. Ships the bundled `chat-typing` library blip; `false` types in silence.",
    ),
});

const DOT_CYCLE_SEC = 1.4;
const DOT_STAGGER_SEC = 0.3;

const TypingDots = ({
  frame,
  fps,
  remFn,
  color,
}: {
  frame: number;
  fps: number;
  remFn: (n: number) => number;
  color: string;
}) => {
  const t = frame / fps;
  return (
    <div style={{ display: "flex", gap: remFn(8), padding: `${remFn(6)}px 0` }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: remFn(14),
            height: remFn(14),
            borderRadius: "50%",
            backgroundColor: color,
            opacity:
              0.4 +
              0.6 *
                Math.abs(Math.sin((Math.PI * (t - i * DOT_STAGGER_SEC)) / DOT_CYCLE_SEC)),
          }}
        />
      ))}
    </div>
  );
};

const ChatBubbles = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();
  const per = Math.round(p.secondsPerMessage * fps);
  const typingLead = Math.round(fps * 0.55);
  const delays = p.messages.map((m) => Math.round(m.delaySec * fps));
  // Cumulative: a message's delay pushes it and everything after it.
  const showAts = delays.map((_, i) =>
    i * per + delays.slice(0, i + 1).reduce((a, b) => a + b, 0)
  );
  const gap = rem(20);
  // bubble padding 18x2 + dot 14 + dots padding 6x2
  const typingRowH = rem(62);

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap,
        opacity: exit,
      }}
    >
      {p.messages.map((m, i) => {
        // A delayed message's typing dots start where it would have landed
        // without its own delay, so the wait reads as "still typing" instead
        // of dead air.
        const showAt = showAts[i];
        const lead = typingLead + delays[i];
        const typing = frame >= showAt - lead && frame < showAt;
        const bubbleIn = pop(frame, fps, showAt, { damping: 15, stiffness: 170 });
        // Smooth (no overshoot) spring that opens the typing row's space, so
        // earlier bubbles slide up instead of jumping when the row mounts.
        const typingIn = pop(frame, fps, showAt - lead, { damping: 200 });
        const mine = m.side === "right";
        // Typing dots blip comes from the CC0 SFX library
        // (docs/sfx-library.md); the landing bubble keeps the core pop cue.
        // Custom cue name so specs can still remap or mute the blip.
        const cues = (
          <Fragment>
            {showAt - lead >= 0 && (
              <PropSfx sfx={p.typingSfx} at={showAt - lead} volume={0.35} />
            )}
            <PropSfx sfx={p.sfx} at={showAt} volume={0.52} />
          </Fragment>
        );
        if (frame < showAt - lead) return <Fragment key={i}>{cues}</Fragment>;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: mine ? "flex-end" : "flex-start",
              alignItems: "flex-end",
              ...(typing
                ? {
                    // Row height and the column gap grow with the spring; the
                    // bubble scales in sync below, so nothing overflows.
                    height: typingIn * typingRowH,
                    marginTop: (typingIn - 1) * gap,
                  }
                : {}),
            }}
          >
            {cues}
            <div
              style={{
                maxWidth: "82%",
                backgroundColor: mine ? brand.colors.primary : brand.colors.surface,
                color: mine ? brand.colors.onPrimary : brand.colors.onSurface,
                fontSize: rem(34),
                fontWeight: 500,
                lineHeight: 1.35,
                padding: `${rem(18)}px ${rem(26)}px`,
                // Longhand-only corners: mixing the borderRadius shorthand
                // with per-corner longhands breaks React's style diffing when
                // the DOM node is reused across template switches.
                // Tail corner: near-square so it actually reads against the
                // big radius; rem(6) was invisible at video scale.
                borderTopLeftRadius: rem(Math.max(brand.radius, 18)),
                borderTopRightRadius: rem(Math.max(brand.radius, 18)),
                borderBottomRightRadius: mine ? rem(2) : rem(Math.max(brand.radius, 18)),
                borderBottomLeftRadius: mine ? rem(Math.max(brand.radius, 18)) : rem(2),
                boxShadow: `0 ${rem(8)}px ${rem(28)}px ${withAlpha("#000000", 0.18)}`,
                transform: typing
                  ? `scale(${typingIn}) translateY(${rem(16)}px)`
                  : `scale(${0.7 + 0.3 * bubbleIn}) translateY(${(1 - bubbleIn) * rem(16)}px)`,
                transformOrigin: mine ? "bottom right" : "bottom left",
              }}
            >
              {typing ? (
                <TypingDots
                  frame={frame}
                  fps={fps}
                  remFn={rem}
                  color={mine ? brand.colors.onPrimary : brand.colors.muted}
                />
              ) : (
                m.text
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const chatBubblesDef: TemplateDef = {
  slug: "chat-bubbles",
  title: "Chat Bubbles",
  tier: "free",
  category: "Social",
  description:
    "Conversation that types itself: typing dots, then the bubble pops. Perfect for testimonial and storytime formats.",
  sourceContract: "overlay",
  regions: ["center", "right-panel", "fullscreen"],
  schema,
  demoProps: {
    secondsPerMessage: 1.15,
    messages: [
      { text: "Did you ship the launch video?", side: "left" },
      { text: "Video, captions and the chart. All of it.", side: "right", delaySec: 1 },
      { text: "That was 20 minutes ago??", side: "left", delaySec: 1 },
      { text: "The agent did it. I approved it.", side: "right", delaySec: 2 },
    ],
  },
  demoDurationSec: 10,
  component: ChatBubbles,
};
