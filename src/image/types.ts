export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

export type ImageFormat = "png" | "jpeg" | "webp" | "unknown";

export type TraceMode = "color" | "bw";
