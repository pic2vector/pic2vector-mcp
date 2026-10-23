import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ATTRIBUTION_URL, SVG_INLINE_LIMIT_BYTES } from "../constants.js";
import { InputError } from "../errors.js";
import { decodeImage } from "../image/decode.js";
import { binarizeOtsu } from "../image/otsu.js";
import { limitLongEdge } from "../image/scale.js";
import type { TraceMode } from "../image/types.js";
import { loadImageBytes } from "../io/load-input.js";
import { resolveOutputPath } from "../io/output-path.js";
import { traceRaster } from "../trace/engine.js";
import { annotateSvg, countPaths, readSvgSize, removeWhiteLayers, summaryText } from "../trace/svg.js";

export interface VectorizeRequest {
  input: string;
  mode: TraceMode;
  outputPath?: string;
}

export function parseVectorizeArguments(raw: Record<string, unknown> | undefined): VectorizeRequest {
  if (!raw || typeof raw.input !== "string" || raw.input.trim() === "") {
    throw new InputError("input is required and must be an absolute file path or an http(s) URL.");
  }
  if (raw.mode !== undefined && raw.mode !== "color" && raw.mode !== "bw") {
    throw new InputError('mode must be "color" or "bw".');
  }
  if (raw.output_path !== undefined && typeof raw.output_path !== "string") {
    throw new InputError("output_path must be a string.");
  }

  return {
    input: raw.input,
    mode: raw.mode ?? "color",
    outputPath: raw.output_path,
  };
}

export async function vectorizeImage(request: VectorizeRequest): Promise<CallToolResult> {
  const bytes = await loadImageBytes(request.input);
  const decoded = decodeImage(bytes);
  const scaled = limitLongEdge(decoded);
  const prepared = request.mode === "bw" ? binarizeOtsu(scaled) : scaled;
  const traced = traceRaster(prepared, request.mode);
  const svg = annotateSvg(request.mode === "bw" ? removeWhiteLayers(traced) : traced);
  const outputPath = resolveOutputPath(request.input, request.outputPath);
  await writeSvg(outputPath, svg);

  const size = readSvgSize(svg) ?? { width: scaled.width, height: scaled.height };
  const sizeBytes = Buffer.byteLength(svg);
  const summary = summaryText(outputPath, size.width, size.height, countPaths(svg), sizeBytes);
  const content: CallToolResult["content"] = [{ type: "text", text: summary }];
  if (sizeBytes <= SVG_INLINE_LIMIT_BYTES) {
    content.push({ type: "text", text: svg });
  }

  return {
    content,
    structuredContent: {
      output_path: outputPath,
      width: size.width,
      height: size.height,
      mode: request.mode,
      path_count: countPaths(svg),
      size_bytes: sizeBytes,
      attribution: ATTRIBUTION_URL,
    },
  };
}

async function writeSvg(filePath: string, svg: string): Promise<void> {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, svg, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown write error";
    throw new InputError(`Could not write SVG to ${filePath}. ${message}`);
  }
}
