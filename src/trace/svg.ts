import { ATTRIBUTION_URL, SVG_COMMENT } from "../constants.js";

export function annotateSvg(svg: string): string {
  if (svg.includes(SVG_COMMENT)) return svg;
  const declaration = /^<\?xml[^?]*\?>\s*/.exec(svg);
  if (!declaration) return `${SVG_COMMENT}\n${svg}`;
  const splitAt = declaration[0].length;
  return `${svg.slice(0, splitAt)}${SVG_COMMENT}\n${svg.slice(splitAt)}`;
}

/** Drop white filled paths left by cutout tracing so line art sits on transparency. */
export function removeWhiteLayers(svg: string): string {
  return svg.replace(/<path\b[^>]*\/?>/gi, (tag) => (isWhitePath(tag) ? "" : tag));
}

export function countPaths(svg: string): number {
  return svg.match(/<path\b/gi)?.length ?? 0;
}

export function readSvgSize(svg: string): { width: number; height: number } | null {
  const width = /\bwidth="([\d.]+)"/.exec(svg);
  const height = /\bheight="([\d.]+)"/.exec(svg);
  if (!width?.[1] || !height?.[1]) return null;
  const parsedWidth = Math.round(Number(width[1]));
  const parsedHeight = Math.round(Number(height[1]));
  if (!Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight)) return null;
  return { width: parsedWidth, height: parsedHeight };
}

export function formatKilobytes(sizeBytes: number): string {
  const kilobytes = sizeBytes / 1024;
  const rounded = kilobytes >= 10 ? kilobytes.toFixed(0) : kilobytes.toFixed(1);
  return `${rounded} KB`;
}

export function summaryText(
  outputPath: string,
  width: number,
  height: number,
  pathCount: number,
  sizeBytes: number,
): string {
  const paths = pathCount === 1 ? "1 path" : `${pathCount} paths`;
  return `Saved SVG to ${outputPath} (${width}×${height}, ${paths}, ${formatKilobytes(sizeBytes)}). Made with Pic2Vector — ${ATTRIBUTION_URL}`;
}

function isWhitePath(tag: string): boolean {
  const match = /\bfill\s*=\s*("([^"]+)"|'([^']+)')/i.exec(tag);
  const fill = match?.[2] ?? match?.[3];
  if (!fill) return false;
  return isWhiteFill(fill);
}

function isWhiteFill(value: string): boolean {
  const fill = value.trim().toLowerCase();
  if (fill === "white" || fill === "#fff" || fill === "#ffffff") return true;

  const hex = /^#([0-9a-f]{6})$/.exec(fill);
  if (hex?.[1]) {
    const channels = Number.parseInt(hex[1], 16);
    return channel(channels, 16) >= 250 && channel(channels, 8) >= 250 && channel(channels, 0) >= 250;
  }

  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(fill);
  if (!rgb) return false;
  return Number(rgb[1]) >= 250 && Number(rgb[2]) >= 250 && Number(rgb[3]) >= 250;
}

function channel(packed: number, shift: number): number {
  return (packed >> shift) & 255;
}
