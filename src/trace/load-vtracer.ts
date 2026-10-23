import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { ColorMode, Hierarchical, PathSimplifyMode, TracerConfig } from "wasm_vtracer";

const require = createRequire(import.meta.url);

/**
 * Public surface of wasm_vtracer used by the tracer.
 * Loaded from the glue module after the wasm bytes are instantiated by hand.
 */
export interface VtracerEngine {
  ColorMode: typeof ColorMode;
  Hierarchical: typeof Hierarchical;
  PathSimplifyMode: typeof PathSimplifyMode;
  TracerConfig: new () => TracerConfig;
  convertImageToSvg: (
    imageData: Uint8Array,
    width: number,
    height: number,
    config: TracerConfig,
  ) => string;
  init: () => void;
}

interface VtracerGlue extends VtracerEngine {
  __wbg_set_wasm: (wasm: WebAssembly.Exports) => void;
}

let enginePromise: Promise<VtracerEngine> | null = null;

/**
 * Instantiate wasm_vtracer without importing its package entry.
 * That entry ESM-imports a .wasm file. Node 18 and 20 reject it with
 * ERR_UNKNOWN_FILE_EXTENSION, and Node 22 only accepts it as an
 * experimental feature. Reading the bytes and calling
 * WebAssembly.instantiate works on all three without flags.
 */
export function ensureVtracerReady(): Promise<VtracerEngine> {
  enginePromise ??= loadVtracer();
  return enginePromise;
}

async function loadVtracer(): Promise<VtracerEngine> {
  const gluePath = require.resolve("wasm_vtracer/wasm_vtracer_bg.js");
  const wasmPath = require.resolve("wasm_vtracer/wasm_vtracer_bg.wasm");
  const glue = (await import(pathToFileURL(gluePath).href)) as VtracerGlue;
  const bytes = readFileSync(wasmPath);
  const wasmModule = new WebAssembly.Module(bytes);
  const instance = await WebAssembly.instantiate(wasmModule, importObjectFor(glue, wasmModule));
  glue.__wbg_set_wasm(instance.exports);
  const start = instance.exports.__wbindgen_start;
  if (typeof start === "function") start();
  glue.init();
  return glue;
}

function importObjectFor(glue: VtracerGlue, wasmModule: WebAssembly.Module): WebAssembly.Imports {
  const namespaces: WebAssembly.Imports = {};
  for (const item of WebAssembly.Module.imports(wasmModule)) {
    if (item.kind !== "function") {
      throw new Error(`wasm_vtracer import ${item.module}.${item.name} is not a function.`);
    }
    const value = (glue as unknown as Record<string, unknown>)[item.name];
    if (typeof value !== "function") {
      throw new Error(`wasm_vtracer glue does not export ${item.name}.`);
    }
    const namespace = namespaces[item.module] ?? {};
    namespace[item.name] = value as WebAssembly.ImportValue;
    namespaces[item.module] = namespace;
  }
  return namespaces;
}
