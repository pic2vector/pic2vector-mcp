import {
  ColorMode,
  Hierarchical,
  PathSimplifyMode,
  TracerConfig,
  convertImageToSvg,
  init,
} from "wasm_vtracer";
import { InputError } from "../errors.js";
import type { Raster, TraceMode } from "../image/types.js";

let ready = false;

function ensureReady(): void {
  if (ready) return;
  init();
  ready = true;
}

export function traceRaster(raster: Raster, mode: TraceMode): string {
  ensureReady();
  const config = new TracerConfig();
  try {
    applyPreset(config, mode);
    const svg = convertImageToSvg(raster.data, raster.width, raster.height, config);
    if (!svg.includes("<svg")) {
      throw new InputError(svg.trim() || "vtracer did not return an SVG.");
    }
    return svg;
  } catch (error) {
    if (error instanceof InputError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new InputError(`Vectorization failed: ${message}`);
  } finally {
    config.free();
  }
}

function applyPreset(config: TracerConfig, mode: TraceMode): void {
  if (mode === "bw") {
    config.presetLineArt();
    config.setColorMode(ColorMode.Color);
    config.setPathSimplifyMode(PathSimplifyMode.Spline);
    config.setHierarchical(Hierarchical.Cutout);
    return;
  }

  config.presetPhoto();
  config.setColorMode(ColorMode.Color);
  config.setPathSimplifyMode(PathSimplifyMode.Spline);
  config.setHierarchical(Hierarchical.Stacked);
  config.setFilterSpeckle(4);
  config.setCornerThreshold(60);
  config.setLayerDifference(16);
  config.setColorPrecision(6);
}
