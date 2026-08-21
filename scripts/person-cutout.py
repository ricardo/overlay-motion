#!/usr/bin/env python3
"""Cut a person out of footage and put a chosen backdrop behind them.

Run with the bootstrap venv, which owns torch and the RVM checkpoint:

    dev-assets/matting-venv/bin/python scripts/person-cutout.py IN OUT \\
        --repo dev-assets/rvm \\
        --checkpoint dev-assets/models/rvm_mobilenetv3.pth \\
        --background transparent --stroke 20

Two decisions the caller makes, never this script:

    --background   what replaces the room: transparent, a flat color, the
                   source blurred back, or a supplied image/video.
    --stroke       the sticker outline, in pixels. DEFAULT 0, meaning no
                   outline. It is an effect, not a side effect of matting, so
                   it is opt-in.

Only the alpha matte is model-produced. Foreground RGB is copied from the
color-managed source, so skin, hair and clothing never pass through a
generative model. Feed a rotation-correct SDR proxy, not an HDR original.

Supersedes the per-project copies under dev-assets/projects/*/composite_rvm*.py.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def probe(path: Path) -> tuple[int, int, float, int]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
         "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    stream = json.loads(result.stdout)["streams"][0]
    num, den = (int(part) for part in stream["r_frame_rate"].split("/"))
    frames = stream.get("nb_frames")
    return (
        int(stream["width"]),
        int(stream["height"]),
        num / max(den, 1),
        int(frames) if frames and frames != "N/A" else 0,
    )


def parse_hex(value: str, device: torch.device) -> torch.Tensor:
    digits = value.lstrip("#")
    if len(digits) == 3:
        digits = "".join(c * 2 for c in digits)
    rgb = [int(digits[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return torch.tensor(rgb, device=device, dtype=torch.float32).view(1, 3, 1, 1)


def gaussian_kernel(device: torch.device, sigma: float, size: int) -> torch.Tensor:
    coords = torch.arange(size, device=device, dtype=torch.float32) - size // 2
    kernel = torch.exp(-(coords**2) / (2 * sigma**2))
    return (kernel / kernel.sum()).view(1, 1, 1, size)


def blur_wide(image: torch.Tensor, sigma: float) -> torch.Tensor:
    """Heavy separable blur, run at quarter scale. A background blur is judged
    by its softness, not its sampling, and a full-resolution sigma-24 kernel is
    145 taps per axis for no visible gain."""
    if sigma <= 0:
        return image
    small = F.interpolate(image, scale_factor=0.25, mode="area")
    small_sigma = max(sigma / 4, 0.6)
    size = int(small_sigma * 6) | 1
    k = gaussian_kernel(image.device, small_sigma, size)
    pad = size // 2
    channels = small.shape[1]
    small = F.conv2d(F.pad(small, (pad, pad, 0, 0), mode="replicate"),
                     k.expand(channels, 1, 1, size), groups=channels)
    small = F.conv2d(F.pad(small, (0, 0, pad, pad), mode="replicate"),
                     k.transpose(2, 3).expand(channels, 1, size, 1), groups=channels)
    return F.interpolate(small, size=image.shape[-2:], mode="bilinear", align_corners=False)


def dilate_octagon(alpha: torch.Tensor, radius: int) -> torch.Tensor:
    """Alternate square and cross 3x3 max filters: an octagonal structuring
    element, within ~4% of a euclidean disk. A single square max_pool of the
    same radius overshoots convex corners by 41% and bevels curved shapes like
    a head or a shoulder."""
    out = alpha
    for step in range(radius):
        if step % 2 == 0:
            out = F.max_pool2d(out, kernel_size=3, stride=1, padding=1)
        else:
            out = torch.maximum(
                F.max_pool2d(out, kernel_size=(1, 3), stride=1, padding=(0, 1)),
                F.max_pool2d(out, kernel_size=(3, 1), stride=1, padding=(1, 0)),
            )
    return out


class RawReader:
    """Frame source that never runs dry: a still repeats, and a clip shorter
    than the footage holds its last frame instead of tearing the composite."""

    def __init__(self, path: Path, width: int, height: int, pix_fmt: str, channels: int):
        self.size = width * height * channels
        self.height, self.width, self.channels = height, width, channels
        self.proc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0",
             "-vf", f"scale={width}:{height}:force_original_aspect_ratio=increase,"
                    f"crop={width}:{height}",
             "-f", "rawvideo", "-pix_fmt", pix_fmt, "-"],
            stdout=subprocess.PIPE,
        )
        self.last: bytes | None = None

    def read(self) -> bytes:
        assert self.proc.stdout is not None
        chunk = self.proc.stdout.read(self.size)
        if len(chunk) == self.size:
            self.last = chunk
            return chunk
        if self.last is None:
            raise RuntimeError("background/overlay produced no frames")
        return self.last

    def tensor(self, device: torch.device) -> torch.Tensor:
        array = np.frombuffer(self.read(), dtype=np.uint8)
        array = array.reshape(self.height, self.width, self.channels).copy()
        t = torch.from_numpy(array).to(device=device, dtype=torch.float32)
        return t.permute(2, 0, 1).unsqueeze(0) / 255

    def close(self) -> None:
        if self.proc.stdout is not None:
            self.proc.stdout.close()
        self.proc.terminate()
        self.proc.wait()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Person cutout with an optional outline and a chosen backdrop.",
    )
    parser.add_argument("input", type=Path, help="rotation-correct SDR proxy")
    parser.add_argument("output", type=Path)
    parser.add_argument("--repo", type=Path, required=True, help="RVM checkout")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument(
        "--background", default="transparent",
        help="transparent | #RRGGBB | blur | path to an image or video",
    )
    parser.add_argument(
        "--stroke", type=int, default=0,
        help="outline width in px around the cutout; 0 (default) draws none",
    )
    parser.add_argument("--stroke-color", default="#FFFFFF")
    parser.add_argument("--background-dim", type=float, default=0.0,
                        help="0..1, darkens a blur/image/video backdrop only")
    parser.add_argument("--blur-sigma", type=float, default=24.0)
    parser.add_argument("--downsample-ratio", type=float, default=0.4,
                        help="RVM inference scale; aim for ~512px on the short side")
    parser.add_argument("--device", choices=("mps", "cpu"), default="mps")
    parser.add_argument("--expand", type=float, default=1.5, help="protective matte expansion px")
    parser.add_argument("--feather", type=float, default=1.15, help="matte feather sigma px")
    parser.add_argument("--overlay", type=Path,
                        help="RGBA layer (straight alpha) composited in the same pass, "
                             "so the protected foreground survives exactly one encode")
    parser.add_argument("--limit-frames", type=int)
    parser.add_argument("--start-frame", type=int, default=0)
    return parser


def main() -> int:
    args = build_parser().parse_args()

    mode = args.background.strip()
    if mode not in ("transparent", "blur") and not HEX.match(mode):
        if not Path(mode).exists():
            raise SystemExit(
                f"--background {mode!r} is not 'transparent', 'blur', a #RRGGBB color "
                "or an existing file"
            )
    transparent = mode == "transparent"
    if args.stroke < 0:
        raise SystemExit("--stroke must be >= 0")

    width, height, fps, total_frames = probe(args.input)
    if not total_frames:
        raise SystemExit(f"could not count frames in {args.input}")
    if args.limit_frames:
        total_frames = min(total_frames, args.start_frame + args.limit_frames)
    frame_bytes = width * height * 3

    sys.path.insert(0, str(args.repo))
    from model import MattingNetwork  # noqa: PLC0415

    requested = args.device
    if requested == "mps" and not torch.backends.mps.is_available():
        requested = "cpu"
    device = torch.device(requested)
    model = MattingNetwork("mobilenetv3").eval().to(device)
    model.load_state_dict(torch.load(args.checkpoint, map_location="cpu", weights_only=True))

    decode = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", str(args.input), "-map", "0:v:0",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )

    overlay_reader = None
    if args.overlay:
        ow, oh, _, _ = probe(args.overlay)
        if (ow, oh) != (width, height):
            raise SystemExit(f"overlay is {ow}x{oh}, source is {width}x{height}")
        overlay_reader = RawReader(args.overlay, width, height, "rgba", 4)

    plate_reader = None
    if mode not in ("transparent", "blur") and not HEX.match(mode):
        plate_reader = RawReader(Path(mode), width, height, "rgb24", 3)

    if transparent:
        encode_args = ["-c:v", "prores_ks", "-profile:v", "4444",
                       "-pix_fmt", "yuva444p10le", "-alpha_bits", "8", "-vendor", "apl0"]
        in_pix_fmt = "rgba"
    else:
        encode_args = ["-c:v", "libx264", "-preset", "slow", "-crf", "10",
                       "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                       "-x264-params",
                       "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited"]
        in_pix_fmt = "rgb24"

    encode = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "rawvideo", "-pix_fmt", in_pix_fmt, "-s", f"{width}x{height}",
         "-r", f"{fps:.8f}", "-i", "-", "-an",
         *encode_args,
         "-color_range", "tv", "-colorspace", "bt709",
         "-color_primaries", "bt709", "-color_trc", "bt709",
         str(args.output)],
        stdin=subprocess.PIPE,
    )

    assert decode.stdout is not None and encode.stdin is not None
    recurrent: list = [None] * 4
    feather = gaussian_kernel(device, args.feather, 7)
    feather2d = feather * feather.transpose(2, 3)
    stroke_soften = gaussian_kernel(device, 0.9, 5)
    stroke_soften2d = stroke_soften * stroke_soften.transpose(2, 3)
    expand_k = max(1, int(round(args.expand)))
    stroke_rgb = parse_hex(args.stroke_color, device) if args.stroke else None
    flat = parse_hex(mode, device) if HEX.match(mode) else None
    dim = float(min(max(args.background_dim, 0.0), 1.0))

    with torch.inference_mode():
        for index in range(total_frames):
            raw = decode.stdout.read(frame_bytes)
            if len(raw) != frame_bytes:
                break
            array = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3).copy()
            source = torch.from_numpy(array).to(device=device, dtype=torch.float32)
            source = source.permute(2, 0, 1).unsqueeze(0) / 255

            # Recurrent state must advance over every frame in order, including
            # frames --start-frame skips writing.
            _, alpha, *recurrent = model(source, *recurrent, args.downsample_ratio)

            alpha = F.max_pool2d(alpha, kernel_size=2 * expand_k + 1, stride=1, padding=expand_k)
            alpha = torch.clamp(F.conv2d(alpha, feather2d, padding=3), 0, 1)

            if args.stroke:
                coverage = dilate_octagon(alpha, args.stroke)
                coverage = torch.clamp(F.conv2d(coverage, stroke_soften2d, padding=2), 0, 1)
                cutout = source * alpha + stroke_rgb * (1 - alpha)
            else:
                coverage = alpha
                cutout = source

            if overlay_reader is not None:
                over = overlay_reader.tensor(device)
                over_rgb, over_a = over[:, :3], over[:, 3:]
                # Straight-alpha "over": an overlay that extends past the cutout
                # adds coverage, so alpha composes too. ffmpeg's overlay filter
                # keeps the main input's alpha instead, which would clip the
                # overlay to the silhouette it happens to cross.
                merged = over_a + coverage * (1 - over_a)
                cutout = ((over_rgb * over_a + cutout * coverage * (1 - over_a))
                          / merged.clamp(min=1e-6)).clamp(0, 1)
                coverage = merged

            if transparent:
                out = torch.cat([cutout, coverage], dim=1)
            else:
                if flat is not None:
                    backdrop = flat.expand(1, 3, height, width)
                elif mode == "blur":
                    backdrop = blur_wide(source, args.blur_sigma)
                else:
                    backdrop = plate_reader.tensor(device)  # type: ignore[union-attr]
                if dim and mode != "transparent" and flat is None:
                    backdrop = backdrop * (1 - dim)
                out = (cutout * coverage + backdrop * (1 - coverage)).clamp(0, 1)

            if index >= args.start_frame:
                buffer = (out.squeeze(0).permute(1, 2, 0).mul(255).round()
                          .clamp(0, 255).to(torch.uint8).cpu().numpy())
                encode.stdin.write(buffer.tobytes())

            if index % 30 == 0 or index + 1 == total_frames:
                print(f"frame {index + 1}/{total_frames}", flush=True)

    decode.stdout.close()
    encode.stdin.close()
    for reader in (overlay_reader, plate_reader):
        if reader is not None:
            reader.close()
    if args.limit_frames:
        decode.terminate()
    decode_rc = decode.wait()
    encode_rc = encode.wait()
    if (decode_rc != 0 and not args.limit_frames) or encode_rc != 0:
        raise RuntimeError(f"ffmpeg failure: decode={decode_rc}, encode={encode_rc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
