"""Build assets/demo.gif from a real vectorize_image call.

The clip is a scripted terminal sequence plus a rasterization of the SVG
paths the server wrote. It is not a screen recording of Claude or Cursor.
"""

import json
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
WIDTH, HEIGHT = 960, 540
INK = (244, 239, 230)
MUTED = (168, 156, 138)
GREEN = (125, 196, 146)
AMBER = (232, 168, 74)
RED = (226, 84, 72)
PANEL = (28, 26, 23)
BG = (18, 16, 14)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="pic2vector-demo-") as temp:
        demo = Path(temp)
        subprocess.check_call(["node", "scripts/capture-demo.mjs", str(demo)], cwd=ROOT)
        meta = json.loads((demo / "result.json").read_text())
        svg = (demo / "logo.svg").read_text()
        source = Image.open(demo / "logo.png").convert("RGBA")
        frames = [
            title_frame(),
            command_frame(),
            tools_frame(meta["description"]),
            result_frame(meta["input"], meta["output"], meta["summary"]),
            compare_frame(source, svg),
        ]
        gif_path = ROOT / "assets" / "demo.gif"
        write_gif(frames, [2.0, 2.0, 2.5, 2.5, 3.0], gif_path)
        print(f"wrote {gif_path} ({gif_path.stat().st_size} bytes)")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((28, 24, WIDTH - 28, HEIGHT - 58), radius=16, fill=PANEL)
    footer = font(15)
    draw.text((36, HEIGHT - 42), "Scripted terminal demo  ·  not a Claude Desktop or Cursor recording", font=footer, fill=MUTED)
    return image, draw


def wrap(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if draw.textlength(trial, font=face) <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def title_frame() -> Image.Image:
    image, draw = canvas()
    draw.text((64, 78), "Pic2Vector MCP", font=font(42, True), fill=INK)
    draw.text((64, 136), "Image to SVG for AI assistants", font=font(24), fill=AMBER)
    body = font(20)
    lines = [
        "$ npx -y pic2vector-mcp",
        "",
        "One stdio tool, vectorize_image.",
        "PNG and JPG in. SVG file out.",
        "The frames after this one are a real call",
        "of that tool, including the SVG it wrote.",
    ]
    y = 210
    for line in lines:
        color = GREEN if line.startswith("$") else INK
        draw.text((64, y), line, font=body, fill=color)
        y += 34
    return image


def command_frame() -> Image.Image:
    image, draw = canvas()
    draw.text((56, 56), "terminal", font=font(16), fill=MUTED)
    lines = [
        ("$", GREEN, " npx -y pic2vector-mcp"),
        ("", INK, ""),
        ("", INK, "pic2vector-mcp"),
        ("", MUTED, "name      pic2vector"),
        ("", MUTED, "transport stdio"),
        ("", MUTED, "tool      vectorize_image"),
        ("", INK, ""),
        ("", GREEN, "waiting for an MCP client on stdin"),
    ]
    y = 110
    face = font(22)
    for prefix, color, text in lines:
        draw.text((64, y), f"{prefix}{text}", font=face, fill=color)
        y += 36
    return image


def tools_frame(description: str) -> Image.Image:
    image, draw = canvas()
    draw.text((56, 52), "tools/list", font=font(16), fill=MUTED)
    draw.text((56, 86), "vectorize_image", font=font(28, True), fill=INK)
    face = font(18)
    lines = wrap(draw, description, face, 820)
    y = 140
    for line in lines[:9]:
        draw.text((56, y), line, font=face, fill=INK if "pic2vector.com" not in line else AMBER)
        y += 28
    return image


def result_frame(input_path: str, output_path: str, summary: str) -> Image.Image:
    image, draw = canvas()
    draw.text((56, 48), "tools/call  vectorize_image", font=font(16), fill=MUTED)
    face = font(18)
    call = f'input: {input_path}'
    draw.text((56, 82), call, font=face, fill=GREEN)
    draw.text((56, 108), f"mode: color    output_path: {output_path}", font=face, fill=GREEN)
    draw.text((56, 150), "content[0]", font=font(16), fill=MUTED)
    y = 186
    for line in wrap(draw, summary, face, 820):
        draw.text((56, y), line, font=face, fill=INK)
        y += 30
    note = font(18)
    draw.text((56, y + 16), "SVG comment written at the top of the file:", font=note, fill=MUTED)
    draw.text((56, y + 48), "<!-- Generated by pic2vector-mcp · https://pic2vector.com -->", font=note, fill=AMBER)
    return image


def compare_frame(source: Image.Image, svg: str) -> Image.Image:
    image, draw = canvas()
    draw.text((56, 46), "logo.png", font=font(16), fill=MUTED)
    draw.text((500, 46), "logo.svg  (paths from the file)", font=font(16), fill=MUTED)
    left = composite(source, 360)
    right = composite(rasterize_svg(svg, source.size), 360)
    image.paste(left, (70, 80))
    image.paste(right, (520, 80))
    return image


def composite(sprite: Image.Image, box: int) -> Image.Image:
    board = checker(box, box)
    fitted = sprite.resize((box, box), Image.Resampling.NEAREST)
    board.alpha_composite(fitted)
    return board.convert("RGB")


def checker(width: int, height: int, cell: int = 18) -> Image.Image:
    image = Image.new("RGBA", (width, height), (236, 232, 223, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                draw.rectangle((x, y, x + cell, y + cell), fill=(214, 208, 196, 255))
    return image


def rasterize_svg(svg: str, size: tuple[int, int]) -> Image.Image:
    width = int(float(re.search(r'\bwidth="([\d.]+)"', svg).group(1)))
    height = int(float(re.search(r'\bheight="([\d.]+)"', svg).group(1)))
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for fill, tx, ty, subpaths in parse_svg_paths(svg):
        if fill == "none":
            continue
        color = hex_color(fill)
        for subpath in subpaths:
            points = [(x + tx, y + ty) for x, y in subpath]
            if len(points) >= 3:
                draw.polygon(points, fill=color)
    if image.size != size:
        image = image.resize(size, Image.Resampling.NEAREST)
    return image


def parse_svg_paths(svg: str):
    parsed = []
    for tag in re.finditer(r"<path\b([^>]*)/?>", svg):
        attrs = tag.group(1)
        fill_match = re.search(r'\bfill="([^"]+)"', attrs)
        move = re.search(r"translate\(\s*([-\d.]+)[ ,]([-\d.]+)\s*\)", attrs)
        data = re.search(r'\bd="([^"]+)"', attrs)
        if not data:
            continue
        fill = fill_match.group(1) if fill_match else "#000000"
        tx = float(move.group(1)) if move else 0.0
        ty = float(move.group(2)) if move else 0.0
        parsed.append((fill, tx, ty, parse_path_data(data.group(1))))
    return parsed


def parse_path_data(data: str):
    tokens = re.findall(r"[MmCcZz]|-?\d*\.?\d+(?:e[-+]?\d+)?", data)
    index = 0
    subpaths = []
    current: list[tuple[float, float]] = []
    cursor = (0.0, 0.0)
    start = (0.0, 0.0)

    def number() -> float:
        nonlocal index
        value = float(tokens[index])
        index += 1
        return value

    while index < len(tokens):
        command = tokens[index]
        if not re.fullmatch(r"[MmCcZz]", command):
            break
        index += 1
        if command in "Mm":
            if len(current) > 1:
                subpaths.append(current)
            x, y = number(), number()
            if command == "m":
                x += cursor[0]
                y += cursor[1]
            cursor = (x, y)
            start = cursor
            current = [cursor]
        elif command in "Cc":
            while index < len(tokens) and not re.fullmatch(r"[MmCcZz]", tokens[index]):
                x1, y1 = number(), number()
                x2, y2 = number(), number()
                x, y = number(), number()
                if command == "c":
                    x1 += cursor[0]
                    y1 += cursor[1]
                    x2 += cursor[0]
                    y2 += cursor[1]
                    x += cursor[0]
                    y += cursor[1]
                current.extend(sample_cubic(cursor, (x1, y1), (x2, y2), (x, y))[1:])
                cursor = (x, y)
        elif command in "Zz":
            current.append(start)
            subpaths.append(current)
            current = []
            cursor = start
    if len(current) > 1:
        subpaths.append(current)
    return subpaths


def sample_cubic(p0, p1, p2, p3, steps: int = 20):
    points = []
    for step in range(steps + 1):
        t = step / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        points.append((x, y))
    return points


def hex_color(fill: str) -> tuple[int, int, int, int]:
    match = re.fullmatch(r"#([0-9a-fA-F]{6})", fill.strip())
    if not match:
        return (0, 0, 0, 255)
    value = int(match.group(1), 16)
    return ((value >> 16) & 255, (value >> 8) & 255, value & 255, 255)


def write_gif(frames: list[Image.Image], durations: list[float], destination: Path) -> None:
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        listing = folder / "frames.txt"
        lines = []
        for index, (frame, duration) in enumerate(zip(frames, durations)):
            file = folder / f"frame-{index}.png"
            frame.save(file)
            lines.append(f"file '{file}'")
            lines.append(f"duration {duration}")
        lines.append(f"file '{folder / f'frame-{len(frames) - 1}.png'}'")
        listing.write_text("\n".join(lines) + "\n")
        destination.parent.mkdir(parents=True, exist_ok=True)
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(listing),
                "-vf",
                "fps=8,scale=960:540:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=48:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer",
                "-loop",
                "0",
                str(destination),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


if __name__ == "__main__":
    main()
