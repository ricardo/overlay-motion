import { useMemo } from "react";
import { AirplaneIcon } from "@phosphor-icons/react";
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod/v3";
import worldAtlas from "world-atlas/countries-110m.json";
import { useRem } from "../../player/scale";
import { useBrand, withAlpha } from "../../theme/themes";
import type { TemplateDef } from "../types";

const pointSchema = z.object({
  label: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const routeSchema = z.object({
  fromLat: z.number().min(-90).max(90),
  fromLon: z.number().min(-180).max(180),
  toLat: z.number().min(-90).max(90),
  toLon: z.number().min(-180).max(180),
  fromLabel: z.string().optional(),
  toLabel: z.string().optional(),
});

const schema = z.object({
  title: z.string().default("Global routes"),
  eyebrow: z.string().default("World view"),
  points: z.array(pointSchema).max(24).default([]),
  routes: z.array(routeSchema).max(12).default([]),
  rotationSpeed: z.number().min(-20).max(20).default(2.4),
  centerLat: z.number().min(-85).max(85).default(37),
  centerLon: z.number().min(-180).max(180).default(-58),
  globeScale: z.number().min(0.4).max(1).default(1),
  traveler: z.enum(["dot", "plane", "none"]).default("dot"),
  showOverlay: z.boolean().default(true),
  showLegend: z.boolean().default(true),
  showLegendStats: z.boolean().default(true),
  showGlow: z.boolean().default(true),
  showOcean: z.boolean().default(true),
  showLand: z.boolean().default(true),
  showRouteLines: z.boolean().default(true),
  showPoints: z.boolean().default(true),
  showPulses: z.boolean().default(true),
  showLabels: z.boolean().default(true),
  showGrid: z.boolean().default(true),
});

type Point = z.infer<typeof pointSchema>;
type Route = z.infer<typeof routeSchema>;
type LonLat = [number, number];

type GeoShape = {
  type: string;
  coordinates?: unknown;
  geometries?: GeoShape[];
};

const atlasFeature = feature(
  worldAtlas as unknown as Parameters<typeof feature>[0],
  (worldAtlas as unknown as { objects: { countries: Parameters<typeof feature>[1] } }).objects.countries
) as unknown as { type: "FeatureCollection"; features: Array<{ type: "Feature"; geometry: GeoShape }> };

const countries = atlasFeature.features;
const sphere = { type: "Sphere" } as const;
const graticule = geoGraticule10();

const pointKey = (point: Point) => `${point.label}-${point.lat}-${point.lon}`;
const routeKey = (route: Route) =>
  `${route.fromLat}-${route.fromLon}-${route.toLat}-${route.toLon}`;

const coordinatesFor = (route: Route, samples = 96): LonLat[] => {
  const interpolateRoute = geoInterpolate(
    [route.fromLon, route.fromLat],
    [route.toLon, route.toLat]
  );
  return Array.from({ length: samples + 1 }, (_, index) =>
    interpolateRoute(index / samples) as LonLat
  );
};

const labelFor = (point: Point, index: number, width: number) => {
  const rightSide = point.lon > -58;
  const yOffset = index % 2 === 0 ? -18 : 28;
  return {
    anchor: rightSide ? "start" : "end",
    x: rightSide ? 18 : -18,
    y: yOffset,
    maxWidth: width * 0.24,
  } as const;
};

/**
 * Orthographic globe driven only by data and brand tokens. Motion uses
 * Remotion frames, so previews and server renders stay deterministic.
 */
const WorldGlobe = (raw: Record<string, unknown>) => {
  const props = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // `useVideoConfig()` reports composition dimensions even when this template
  // sits in a smaller custom region. Caller-controlled scale keeps the globe
  // inside that region instead of relying on clipping as accidental sizing.
  const baseStageWidth = Math.min(width * 0.92, height * 0.64);
  const baseStageHeight = Math.min(height * 0.68, baseStageWidth);
  const stageWidth = baseStageWidth * props.globeScale;
  const stageHeight = baseStageHeight * props.globeScale;
  const radius = Math.min(stageWidth, stageHeight) * 0.46;
  const rotation = props.centerLon - (frame / fps) * props.rotationSpeed;
  const projection = geoOrthographic()
    .clipAngle(90)
    .precision(0.25)
    .translate([stageWidth / 2, stageHeight / 2])
    .scale(radius)
    .rotate([-rotation, -props.centerLat, 0]);
  const path = geoPath(projection);
  const center = projection.invert?.([stageWidth / 2, stageHeight / 2]) as LonLat;
  const isVisible = (coordinates: LonLat) => geoDistance(coordinates, center) < Math.PI / 2;

  const reveal = interpolate(frame, [fps * 0.15, fps * 1.45], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleIn = interpolate(frame, [0, fps * 0.65], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = (Math.sin((frame / fps) * Math.PI * 2) + 1) / 2;
  // One journey per composition: origin on frame 0, destination on final frame.
  // This automatically follows custom clip durations; library demo is 8 seconds.
  const routePhase = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const primaryRoute = props.routes[0];
  const footerLabel = primaryRoute
    ? `${primaryRoute.fromLabel ?? "Origin"}  ·  ${primaryRoute.toLabel ?? "Destination"}`
    : `${props.points.length} ${props.points.length === 1 ? "location" : "locations"}`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {props.showGlow && (
        <div
          style={{
            position: "absolute",
            width: radius * 1.9,
            height: radius * 1.9,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${withAlpha(brand.colors.primary, 0.2)} 0%, ${withAlpha(brand.colors.primary, 0)} 70%)`,
            filter: `blur(${rem(32)}px)`,
            transform: `scale(${0.88 + reveal * 0.12})`,
          }}
        />
      )}

      {props.showOverlay && (
        <div
          style={{
            position: "absolute",
            top: rem(92),
            left: rem(74),
            right: rem(74),
            zIndex: 2,
            opacity: titleIn,
            transform: `translateY(${rem(22) * (1 - titleIn)}px)`,
          }}
        >
          {props.eyebrow && (
            <div
              style={{
                color: brand.colors.primary,
                fontSize: rem(22),
                fontWeight: 800,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginBottom: rem(12),
              }}
            >
              {props.eyebrow}
            </div>
          )}
          {props.title && (
            <div
              style={{
                color: brand.colors.onSurface,
                fontFamily: brand.fonts.heading,
                fontSize: rem(58),
                fontWeight: 800,
                letterSpacing: "-0.035em",
              }}
            >
              {props.title}
            </div>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${stageWidth} ${stageHeight}`}
        style={{
          width: stageWidth,
          height: stageHeight,
          display: "block",
          position: "relative",
          zIndex: 1,
          overflow: "visible",
          transform: `scale(${0.9 + reveal * 0.1})`,
        }}
        aria-label={`${props.title}. ${props.points.length} points and ${props.routes.length} routes.`}
      >
        {props.showOcean && (
          <path
            d={path(sphere) ?? undefined}
            fill={withAlpha(brand.colors.surface, 0.88)}
            stroke={withAlpha(brand.colors.primary, 0.44)}
            strokeWidth={rem(3)}
          />
        )}
        {props.showGrid && (
          <path
            d={path(graticule) ?? undefined}
            fill="none"
            stroke={withAlpha(brand.colors.onSurface, 0.15)}
            strokeWidth={rem(1.2)}
          />
        )}
        {props.showLand &&
          countries.map((country, index) => (
            <path
              key={index}
              d={path(country as never) ?? undefined}
              fill={withAlpha(brand.colors.onSurface, 0.13)}
              stroke={withAlpha(brand.colors.background, 0.72)}
              strokeWidth={rem(1)}
            />
          ))}

        {props.routes.map((route, index) => {
          const coordinates = coordinatesFor(route);
          const routePath = path({ type: "LineString", coordinates }) ?? undefined;
          const routeReveal = interpolate(reveal, [index * 0.08, 0.78 + index * 0.05], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <g key={routeKey(route)}>
              {props.showRouteLines && (
                <>
                  <path
                    d={routePath}
                    fill="none"
                    stroke={withAlpha(brand.colors.background, 0.85)}
                    strokeWidth={rem(9)}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - routeReveal}
                  />
                  <path
                    d={routePath}
                    fill="none"
                    stroke={brand.colors.primary}
                    strokeWidth={rem(4.5)}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="0.018 0.015"
                    strokeDashoffset={1 - routeReveal - frame / fps / 7}
                  />
                </>
              )}
            </g>
          );
        })}

        {props.points.map((point, index) => {
          const coordinates: LonLat = [point.lon, point.lat];
          const projected = projection(coordinates);
          if (!projected || !isVisible(coordinates)) return null;
          const label = labelFor(point, index, stageWidth);
          const pointIn = interpolate(reveal, [index * 0.09, 0.55 + index * 0.08], [0, 1], {
            easing: Easing.out(Easing.cubic),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          if (!props.showPoints && !props.showLabels) return null;
          return (
            <g
              key={pointKey(point)}
              transform={`translate(${projected[0]} ${projected[1]}) scale(${pointIn})`}
            >
              {props.showPoints && props.showPulses && (
                <circle
                  r={rem(15 + pulse * 18)}
                  fill="none"
                  stroke={brand.colors.accent}
                  strokeWidth={rem(3)}
                  opacity={0.75 - pulse * 0.7}
                />
              )}
              {props.showPoints && (
                <circle
                  r={rem(9)}
                  fill={brand.colors.accent}
                  stroke={brand.colors.background}
                  strokeWidth={rem(4)}
                />
              )}
              {props.showLabels && (
                <text
                  x={rem(label.x)}
                  y={rem(label.y)}
                  textAnchor={label.anchor}
                  fill={brand.colors.onSurface}
                  stroke={brand.colors.background}
                  strokeWidth={rem(8)}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  style={{
                    fontFamily: brand.fonts.body,
                    fontSize: rem(25),
                    fontWeight: 700,
                  }}
                >
                  {point.label.length > 22 ? `${point.label.slice(0, 21)}…` : point.label}
                </text>
              )}
            </g>
          );
        })}

        {props.traveler !== "none" &&
          props.routes.map((route) => {
            const travelInterpolator = geoInterpolate(
              [route.fromLon, route.fromLat],
              [route.toLon, route.toLat]
            );
            const travel = travelInterpolator(routePhase) as LonLat;
            const travelPoint = projection(travel);
            if (!travelPoint || !isVisible(travel)) return null;

            const tangentBefore = projection(
              travelInterpolator(Math.max(0, routePhase - 0.003)) as LonLat
            );
            const tangentAfter = projection(
              travelInterpolator(Math.min(1, routePhase + 0.003)) as LonLat
            );
            const travelAngle =
              tangentBefore && tangentAfter
                ? (Math.atan2(
                    tangentAfter[1] - tangentBefore[1],
                    tangentAfter[0] - tangentBefore[0]
                  ) *
                    180) /
                  Math.PI
                : 0;

            return props.traveler === "plane" ? (
              <g
                key={`traveler-${routeKey(route)}`}
                transform={`translate(${travelPoint[0]} ${travelPoint[1]}) rotate(${travelAngle + 90})`}
              >
                <circle
                  r={rem(22)}
                  fill={withAlpha(brand.colors.background, 0.78)}
                />
                <AirplaneIcon
                  x={-rem(18)}
                  y={-rem(18)}
                  size={rem(36)}
                  color={brand.colors.accent}
                  weight="fill"
                />
              </g>
            ) : (
              <circle
                key={`traveler-${routeKey(route)}`}
                cx={travelPoint[0]}
                cy={travelPoint[1]}
                r={rem(7)}
                fill={brand.colors.accent}
                stroke={brand.colors.background}
                strokeWidth={rem(3)}
              />
            );
          })}
      </svg>

      {props.showLegend && (
        <div
          style={{
            position: "absolute",
            left: rem(74),
            right: rem(74),
            bottom: rem(184),
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: rem(20),
            opacity: reveal,
            color: brand.colors.onSurface,
          }}
        >
          {props.traveler === "plane" ? (
            <AirplaneIcon size={rem(22)} color={brand.colors.accent} weight="fill" />
          ) : props.traveler === "dot" || props.showPoints ? (
            <span
              style={{
                width: rem(12),
                height: rem(12),
                borderRadius: "50%",
                backgroundColor: brand.colors.accent,
                boxShadow: `0 0 ${rem(24)}px ${brand.colors.accent}`,
              }}
            />
          ) : null}
          <span
            style={{
              fontFamily: brand.fonts.body,
              fontSize: rem(27),
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}
          >
            {footerLabel}
          </span>
          {props.showLegendStats && (
            <>
              <span
                style={{
                  flex: 1,
                  height: rem(2),
                  backgroundColor: withAlpha(brand.colors.onSurface, 0.18),
                }}
              />
              <span style={{ color: brand.colors.muted, fontSize: rem(22), fontWeight: 600 }}>
                {props.points.length} points · {props.routes.length} routes
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const worldGlobeDef: TemplateDef = {
  slug: "world-globe",
  title: "World Globe",
  tier: "free",
  category: "Charts",
  description:
    "A rotating orthographic world with optional layers, pulsing coordinates, animated routes, and a dot or solid Phosphor plane traveler.",
  sourceContract: "overlay",
  regions: ["fullscreen"],
  schema,
  demoProps: {
    title: "Las Vegas to London",
    eyebrow: "World view",
    points: [
      { label: "Las Vegas", lat: 36.1699, lon: -115.1398 },
      { label: "London", lat: 51.5074, lon: -0.1278 },
    ],
    routes: [
      {
        fromLat: 36.1699,
        fromLon: -115.1398,
        toLat: 51.5074,
        toLon: -0.1278,
        fromLabel: "Las Vegas",
        toLabel: "London",
      },
    ],
    rotationSpeed: 2.4,
    centerLat: 37,
    centerLon: -58,
    globeScale: 1,
    traveler: "plane",
    showOverlay: true,
    showLegend: true,
    showLegendStats: true,
    showGlow: true,
    showOcean: true,
    showLand: true,
    showRouteLines: true,
    showPoints: true,
    showPulses: true,
    showLabels: true,
    showGrid: true,
  },
  demoDurationSec: 8,
  component: WorldGlobe,
};
