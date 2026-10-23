import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import { InputError } from "../errors.js";
import type { ImageFormat, Raster } from "./types.js";

export function detectFormat(bytes: Uint8Array): ImageFormat {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return "unknown";
}

export function decodeImage(bytes: Buffer): Raster {
  const format = detectFormat(bytes);
  if (format === "webp") {
    throw new InputError(
      "Only PNG and JPG are supported. WebP can be converted online at https://pic2vector.com",
    );
  }
  if (format === "png") return decodePng(bytes);
  if (format === "jpeg") return decodeJpegImage(bytes);
  throw new InputError(
    "Only PNG and JPG are supported. Other formats can be converted online at https://pic2vector.com",
  );
}

function decodePng(bytes: Buffer): Raster {
  try {
    const png = PNG.sync.read(bytes);
    return rasterFromDecoded(png.width, png.height, png.data, "PNG");
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(`Could not decode this PNG file. ${errorText(error)}`);
  }
}

function decodeJpegImage(bytes: Buffer): Raster {
  try {
    const decoded = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 80,
    });
    return rasterFromDecoded(decoded.width, decoded.height, decoded.data, "JPG");
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(`Could not decode this JPG file. ${errorText(error)}`);
  }
}

function rasterFromDecoded(
  width: number,
  height: number,
  pixels: Uint8Array,
  label: string,
): Raster {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new InputError(`The ${label} image has no pixels.`);
  }
  const expected = width * height * 4;
  if (pixels.length < expected) {
    throw new InputError(`The ${label} image data is incomplete.`);
  }
  const data = pixels.length === expected ? new Uint8Array(pixels) : pixels.slice(0, expected);
  return { width, height, data };
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The file is not a valid image.";
}
