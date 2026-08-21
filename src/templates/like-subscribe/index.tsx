import { useMemo } from "react";
import { BellIcon, CheckIcon, CursorIcon, ThumbsUpIcon } from "@phosphor-icons/react";
import { Easing, interpolate, spring } from "remotion";
import { z } from "zod/v3";
import { useInOut } from "../../player/motion";
import { useRem } from "../../player/scale";
import { MouseClickSfx, PropSfx } from "../../sound/Sfx";
import { templateSfx, type TemplateSfx } from "../../sound/config";
import { surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import type { TemplateDef } from "../types";

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

/**
 * Composite cue name: a real click is a press AND its release, two recordings
 * a fraction of a second apart, so it cannot be one entry in the pack. The
 * name keeps it swappable like any other cue.
 */
const MOUSE_CLICK = "mouse-click";
const CLICK_VOLUME = 0.82;

/** The click pair by default; a single cue when the caller named one. */
const Click = ({ sfx, at }: { sfx: TemplateSfx; at: number }) =>
  sfx === MOUSE_CLICK ? (
    <MouseClickSfx at={at} volume={CLICK_VOLUME} />
  ) : (
    <PropSfx sfx={sfx} at={at} volume={CLICK_VOLUME} />
  );

const schema = z.object({
  likeLabel: z.string().default("Like"),
  likedLabel: z.string().default("Liked"),
  subscribeLabel: z.string().default("Subscribe"),
  subscribedLabel: z.string().default("Subscribed"),
  accentColor: hexColor.optional(),
  lightColor: hexColor.optional(),
  textColor: hexColor.optional(),
  cursorColor: hexColor.optional(),
  cursorOutlineColor: hexColor.optional(),
  showBell: z.boolean().default(false),
  /** Scales the complete interaction for square corner placement. */
  variant: z.enum(["standard", "compact"]).default("standard"),
  clickSfx: templateSfx
    .default(MOUSE_CLICK)
    .describe(
      'Cursor clicks. `"mouse-click"` plays the recorded press and release pair; any other cue name or audio path plays a single sound instead, and `false` clicks in silence.',
    ),
  sfx: templateSfx
    .default("notification")
    .describe("Sound as the subscribe (or bell) state confirms. `false` is silence."),
});

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const clickScale = (frame: number, at: number) =>
  interpolate(frame, [at - 4, at, at + 7, at + 15], [1, 0.92, 1.1, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

const Tada = ({
  frame,
  at,
  color,
  unit,
}: {
  frame: number;
  at: number;
  color: string;
  unit: (value: number) => number;
}) => {
  const opacity = interpolate(frame, [at, at + 7, at + 22], [0, 1, 0], clamp);
  const distance = interpolate(frame, [at, at + 7, at + 22], [46, 78, 96], clamp);
  const stretch = interpolate(frame, [at, at + 7, at + 22], [0.2, 1, 0.42], clamp);
  const distances = [0.92, 1.02, 1.06, 0.98, 0.93, 1.03, 1.08, 0.99];

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {distances.map((multiplier, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: unit(-2),
            top: unit(-8),
            width: unit(4),
            height: unit(18),
            borderRadius: unit(8),
            backgroundColor: color,
            opacity,
            transformOrigin: "50% 50%",
            transform: `rotate(${index * 45}deg) translateY(${-unit(distance * multiplier)}px) scaleY(${stretch})`,
          }}
        />
      ))}
    </div>
  );
};

const ClickRing = ({
  frame,
  at,
  color,
  unit,
}: {
  frame: number;
  at: number;
  color: string;
  unit: (value: number) => number;
}) => {
  const progress = interpolate(frame, [at - 1, at + 12], [0, 1], clamp);
  const opacity = interpolate(frame, [at - 1, at + 3, at + 12], [0, 0.72, 0], clamp);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: unit(54),
        height: unit(54),
        border: `${unit(3)}px solid ${color}`,
        borderRadius: "50%",
        opacity,
        transform: `translate(-50%, -50%) scale(${0.24 + progress * 1.2})`,
        pointerEvents: "none",
      }}
    />
  );
};

const LikeSubscribe = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { frame, fps, exit } = useInOut();
  const accent = p.accentColor ?? brand.colors.primary;
  const light = p.lightColor ?? brand.colors.surface;
  const ink = p.textColor ?? brand.colors.onSurface;
  const cursor = p.cursorColor ?? brand.colors.onSurface;
  const cursorOutline = p.cursorOutlineColor ?? brand.colors.background;
  const compactScale = p.variant === "compact" ? 0.85 : 1;
  const glass = brand.style?.surface === "glass";
  const neutralButton = glass
    ? surfaceStyle(brand, rem)
    : { backgroundColor: light };
  // The bell's "on" fill has to carry an onPrimary icon. Blending the surface
  // token into the gradient washed it out on light glass (Arctic), so the fill
  // stays accent end to end and only shades within itself.
  const accentButton = glass
    ? {
        ...surfaceStyle(brand, rem),
        background: `linear-gradient(145deg, ${withAlpha(accent, 0.96)}, ${withAlpha(accent, 0.78)})`,
        borderWidth: rem(1.5),
        borderStyle: "solid",
        borderColor: withAlpha(accent, 0.72),
    }
    : { backgroundColor: accent };

  // Scale every interaction timestamp with its demo duration so shorter specs
  // still include every click and the cursor exit.
  const timelineScale = p.showBell ? 7 / 9 : 6 / 8;
  const at = (seconds: number) => Math.round(fps * seconds * timelineScale);
  const likeAt = at(2);
  const subscribeAt = at(4.4);
  const bellAt = at(6.4);
  const entrance = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 105, mass: 0.8 },
  });
  const liked = frame >= likeAt + 3;
  const subscribed = frame >= subscribeAt + 3;
  const notified = p.showBell && frame >= bellAt + 3;
  const likeIconIn = spring({
    frame: frame - likeAt,
    fps,
    config: { damping: 11, stiffness: 180 },
  });
  const subscribedIn = spring({
    frame: frame - subscribeAt,
    fps,
    config: { damping: 12, stiffness: 155 },
  });
  const notifiedIn = spring({
    frame: frame - bellAt,
    fps,
    config: { damping: 11, stiffness: 180 },
  });
  const bellSwing = interpolate(
    frame,
    [bellAt - 1, bellAt + 3, bellAt + 6, bellAt + 9, bellAt + 12, bellAt + 17],
    [0, -18, 16, -10, 6, 0],
    clamp
  );

  // CursorIcon's click hotspot sits about 10px from its top-left. Target button
  // centers with the hotspot, rather than centering the whole cursor glyph.
  const cursorHotspot = 10;
  const likeCursorX = (p.showBell ? 167 : 216) - cursorHotspot;
  const subscribeCursorX = (p.showBell ? 415 : 464) - cursorHotspot;
  const bellCursorX = 608 - cursorHotspot;
  const buttonCursorY = 150 - cursorHotspot;

  const cursorTimes = p.showBell
    ? [
        0,
        at(0.7),
        at(1.7),
        likeAt,
        at(3.05),
        at(4.05),
        subscribeAt,
        at(5.35),
        at(6.05),
        bellAt,
        at(7.45),
        at(8.35),
      ]
    : [
        0,
        at(0.7),
        at(1.7),
        likeAt,
        at(3.05),
        at(4.05),
        subscribeAt,
        at(6.25),
        at(7.2),
      ];
  const cursorX = interpolate(
    frame,
    cursorTimes,
    p.showBell
      ? [88, 88, likeCursorX, likeCursorX, likeCursorX, subscribeCursorX, subscribeCursorX, subscribeCursorX, bellCursorX, bellCursorX, bellCursorX, 680]
      : [88, 88, likeCursorX, likeCursorX, likeCursorX, subscribeCursorX, subscribeCursorX, subscribeCursorX, 660],
    { ...clamp, easing: Easing.inOut(Easing.cubic) }
  );
  const cursorY = interpolate(
    frame,
    cursorTimes,
    p.showBell
      ? [282, 282, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, 270]
      : [282, 282, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, buttonCursorY, 270],
    { ...clamp, easing: Easing.inOut(Easing.cubic) }
  );
  const cursorOutAt = at(p.showBell ? 8.35 : 7.2);
  const cursorHoldUntil = at(p.showBell ? 7.55 : 6.4);
  const cursorOpacity = interpolate(
    frame,
    [at(0.45), at(0.8), cursorHoldUntil, cursorOutAt],
    [0, 1, 1, 0],
    clamp
  );
  const cursorPress = Math.min(
    clickScale(frame, likeAt),
    clickScale(frame, subscribeAt),
    p.showBell ? clickScale(frame, bellAt) : 1
  );
  const cursorRotation = interpolate(
    frame,
    p.showBell ? [0, likeAt, subscribeAt, bellAt, cursorOutAt] : [0, likeAt, subscribeAt, cursorOutAt],
    p.showBell ? [18, 20, 22, 22, 30] : [18, 20, 22, 30],
    clamp
  );

  const buttonShadow = `0 ${rem(16)}px ${rem(42)}px rgba(0,0,0,.22), 0 ${rem(3)}px ${rem(9)}px rgba(0,0,0,.14)`;

  return (
    <div
      style={{
        position: "relative",
        width: rem(720),
        height: rem(300),
        flexShrink: 0,
        opacity: exit * entrance,
        transform: `translateY(${(1 - entrance) * rem(34)}px) scale(${compactScale * (0.92 + entrance * 0.08)})`,
      }}
    >
      <Click sfx={p.clickSfx} at={likeAt} />
      <Click sfx={p.clickSfx} at={subscribeAt} />
      {p.showBell ? (
        <>
          <Click sfx={p.clickSfx} at={bellAt} />
          <PropSfx sfx={p.sfx} at={bellAt + 3} volume={0.62} />
        </>
      ) : (
        <PropSfx sfx={p.sfx} at={subscribeAt + 3} volume={0.38} />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: rem(18),
        }}
      >
        <div
          style={{
            position: "relative",
            zIndex: 0,
            width: rem(190),
            height: rem(80),
            borderRadius: rem(999),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: rem(12),
            color: ink,
            ...neutralButton,
            boxShadow: buttonShadow,
            transform: `scale(${clickScale(frame, likeAt)})`,
          }}
        >
          <Tada frame={frame} at={likeAt} color={accent} unit={rem} />
          <ClickRing frame={frame} at={likeAt} color={withAlpha(accent, 0.82)} unit={rem} />
          <ThumbsUpIcon
            size={rem(32)}
            weight={liked ? "fill" : "bold"}
            color={liked ? accent : undefined}
            style={{
              flexShrink: 0,
              transform: liked
                ? `rotate(${(1 - likeIconIn) * -16}deg) scale(${0.58 + likeIconIn * 0.42})`
                : undefined,
            }}
          />
          <span
            style={{
              fontFamily: brand.fonts.heading,
              fontSize: rem(24),
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "-0.025em",
            }}
          >
            {liked ? p.likedLabel : p.likeLabel}
          </span>
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 0,
            width: rem(270),
            height: rem(80),
            borderRadius: rem(999),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: ink,
            ...neutralButton,
            boxShadow: buttonShadow,
            transform: `scale(${clickScale(frame, subscribeAt)})`,
          }}
        >
          <Tada frame={frame} at={subscribeAt} color={accent} unit={rem} />
          <ClickRing frame={frame} at={subscribeAt} color={withAlpha(accent, 0.82)} unit={rem} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: brand.fonts.heading,
              fontSize: rem(24),
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              opacity: subscribed ? 0 : 1,
              transform: `translateY(${subscribed ? rem(-10) : 0}px) scale(${subscribed ? 0.86 : 1})`,
            }}
          >
            {p.subscribeLabel}
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: rem(10),
              fontFamily: brand.fonts.heading,
              fontSize: rem(24),
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              opacity: subscribed ? subscribedIn : 0,
              transform: `translateY(${(1 - subscribedIn) * rem(10)}px) scale(${0.86 + subscribedIn * 0.14})`,
            }}
          >
            <CheckIcon size={rem(31)} weight="bold" color={accent} />
            {p.subscribedLabel}
          </div>
        </div>

        {p.showBell ? (
          <div
            style={{
              position: "relative",
              zIndex: 0,
              width: rem(80),
              height: rem(80),
              borderRadius: rem(999),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: notified ? brand.colors.onPrimary : ink,
              ...(notified ? accentButton : neutralButton),
              boxShadow: notified
                ? `${buttonShadow}, 0 ${rem(8)}px ${rem(26)}px ${withAlpha(accent, 0.2)}`
                : buttonShadow,
              transform: `scale(${clickScale(frame, bellAt)})`,
            }}
          >
            <Tada frame={frame} at={bellAt} color={accent} unit={rem} />
            <ClickRing frame={frame} at={bellAt} color={withAlpha(accent, 0.82)} unit={rem} />
            <BellIcon
              size={rem(35)}
              weight={notified ? "fill" : "bold"}
              style={{
                transformOrigin: "50% 12%",
                transform: `rotate(${bellSwing}deg) scale(${0.86 + notifiedIn * 0.14})`,
              }}
            />
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          left: rem(cursorX),
          top: rem(cursorY),
          width: rem(56),
          height: rem(56),
          opacity: cursorOpacity,
          color: cursor,
          transformOrigin: `${rem(cursorHotspot)}px ${rem(cursorHotspot)}px`,
          transform: `rotate(${cursorRotation}deg) scale(${cursorPress})`,
          filter: `drop-shadow(0 ${rem(3)}px 0 rgba(0,0,0,.95)) drop-shadow(0 ${rem(7)}px ${rem(12)}px rgba(0,0,0,.42))`,
          zIndex: 8,
          pointerEvents: "none",
        }}
      >
        <CursorIcon
          size={rem(56)}
          weight="fill"
          style={{
            display: "block",
            overflow: "visible",
            stroke: cursorOutline,
            strokeWidth: 13,
            strokeLinejoin: "round",
            paintOrder: "stroke fill",
          }}
        />
      </div>
    </div>
  );
};

export const likeSubscribeDef: TemplateDef = {
  slug: "like-subscribe",
  title: "Like + Subscribe",
  tier: "free",
  category: "Social",
  description:
    "A cursor clicks Like, fills the Phosphor thumb with a radial tada, then clicks Subscribe and lands on Subscribed with a matching confirmation burst.",
  sourceContract: "overlay",
  regions: ["center", "lower-third", "fullscreen"],
  schema,
  demoProps: {
    likeLabel: "Like",
    likedLabel: "Liked",
    subscribeLabel: "Subscribe",
    subscribedLabel: "Subscribed",
  },
  demoDurationSec: 6,
  component: LikeSubscribe,
};

export const likeSubscribeBellDef: TemplateDef = {
  slug: "like-subscribe-bell",
  title: "Like + Subscribe + Bell",
  tier: "free",
  category: "Social",
  description:
    "A cursor clicks Like, Subscribe, and the notification bell. Like changes to Liked, Subscribe lands on Subscribed, each press has button-down and button-up audio, and the bell rings with its own confirmation chime.",
  sourceContract: "overlay",
  regions: ["center", "lower-third", "fullscreen"],
  schema,
  demoProps: {
    likeLabel: "Like",
    likedLabel: "Liked",
    subscribeLabel: "Subscribe",
    subscribedLabel: "Subscribed",
    showBell: true,
  },
  demoDurationSec: 7,
  component: LikeSubscribe,
};
