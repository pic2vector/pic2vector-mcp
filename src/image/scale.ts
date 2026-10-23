import { MAX_EDGE_PX } from "../constants.js";
import type { Raster } from "./types.js";

/** Shrink the long edge to `maxEdge` with bilinear filtering. */
export function limitLongEdge(raster: Raster, maxEdge = MAX_EDGE_PX): Raster {
  const longEdge = Math.max(raster.width, raster.height);
  if (longEdge <= maxEdge) return raster;

  const scale = maxEdge / longEdge;
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  return {
    width,
    height,
    data: resizeBilinear(raster, width, height),
  };
}

function resizeBilinear(source: Raster, width: number, height: number): Uint8Array {
  const dest = new Uint8Array(width * height * 4);
  const xScale = source.width / width;
  const yScale = source.height / height;
  const src = source.data;

  for (let y = 0; y < height; y += 1) {
    const sy = (y + 0.5) * yScale - 0.5;
    const y0 = clamp(Math.floor(sy), 0, source.height - 1);
    const y1 = clamp(y0 + 1, 0, source.height - 1);
    const fy = clamp(sy - y0, 0, 1);

    for (let x = 0; x < width; x += 1) {
      const sx = (x + 0.5) * xScale - 0.5;
      const x0 = clamp(Math.floor(sx), 0, source.width - 1);
      const x1 = clamp(x0 + 1, 0, source.width - 1);
      const fx = clamp(sx - x0, 0, 1);
      const i00 = (y0 * source.width + x0) * 4;
      const i10 = (y0 * source.width + x1) * 4;
      const i01 = (y1 * source.width + x0) * 4;
      const i11 = (y1 * source.width + x1) * 4;
      const out = (y * width + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const top = src[i00 + channel] * (1 - fx) + src[i10 + channel] * fx;
        const bottom = src[i01 + channel] * (1 - fx) + src[i11 + channel] * fx;
        dest[out + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }

  return dest;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
