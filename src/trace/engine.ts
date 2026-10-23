import type { TracerConfig } from "wasm_vtracer";
import { InputError } from "../errors.js";
import type { Raster, TraceMode } from "../image/types.js";
import { ensureVtracerReady, type VtracerEngine } from "./load-vtracer.js";

export async function traceRaster(raster: Raster, mode: TraceMode): Promise<string> {
  const engine = await ensureVtracerReady();
  const config = new engine.TracerConfig();
  try {
    applyPreset(engine, config, mode);
    const svg = engine.convertImageToSvg(raster.data, raster.width, raster.height, config);
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

function applyPreset(engine: VtracerEngine, config: TracerConfig, mode: TraceMode): void {
  if (mode === "bw") {
    config.presetLineArt();
    config.setColorMode(engine.ColorMode.Color);
    config.setPathSimplifyMode(engine.PathSimplifyMode.Spline);
    config.setHierarchical(engine.Hierarchical.Cutout);
    return;
  }

  config.presetPhoto();
  config.setColorMode(engine.ColorMode.Color);
  config.setPathSimplifyMode(engine.PathSimplifyMode.Spline);
  config.setHierarchical(engine.Hierarchical.Stacked);
  config.setFilterSpeckle(4);
  config.setCornerThreshold(60);
  config.setLayerDifference(16);
  config.setColorPrecision(6);
}
