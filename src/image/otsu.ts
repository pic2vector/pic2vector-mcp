import { InputError } from "../errors.js";
import type { Raster } from "./types.js";

/**
 * Otsu threshold, then force opaque pixels to black or white.
 * Transparent pixels stay transparent and are left out of the histogram.
 */
export function binarizeOtsu(raster: Raster): Raster {
  const { width, height, data } = raster;
  const pixelCount = width * height;
  const histogram = new Uint32Array(256);
  const gray = new Uint8Array(pixelCount);
  let opaque = 0;

  for (let index = 0, offset = 0; index < pixelCount; index += 1, offset += 4) {
    if (data[offset + 3] < 128) {
      gray[index] = 255;
      continue;
    }
    const luminance = Math.round(
      data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114,
    );
    gray[index] = luminance;
    histogram[luminance] += 1;
    opaque += 1;
  }

  if (opaque === 0) {
    throw new InputError("The image has no opaque pixels to trace.");
  }

  const distinctTones = histogram.reduce((count, bin) => count + (bin > 0 ? 1 : 0), 0);
  const threshold = distinctTones <= 1 ? 255 : otsuThreshold(histogram, opaque);
  const out = new Uint8Array(pixelCount * 4);
  for (let index = 0, offset = 0; index < pixelCount; index += 1, offset += 4) {
    // Transparent pixels become white paper. vtracer drops #000000 ink that sits
    // on a clear ground, and the bw path removes this white layer after tracing.
    if (data[offset + 3] < 128) {
      out[offset] = 255;
      out[offset + 1] = 255;
      out[offset + 2] = 255;
      out[offset + 3] = 255;
      continue;
    }
    const value = gray[index] <= threshold ? 0 : 255;
    out[offset] = value;
    out[offset + 1] = value;
    out[offset + 2] = value;
    out[offset + 3] = 255;
  }

  return { width, height, data: out };
}

function otsuThreshold(histogram: Uint32Array, total: number): number {
  let sum = 0;
  for (let tone = 0; tone < 256; tone += 1) sum += tone * histogram[tone];

  let backgroundSum = 0;
  let backgroundWeight = 0;
  let best = -1;
  let threshold = 0;

  for (let tone = 0; tone < 256; tone += 1) {
    backgroundWeight += histogram[tone];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += tone * histogram[tone];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const between =
      backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (between > best) {
      best = between;
      threshold = tone;
    }
  }

  return threshold;
}
