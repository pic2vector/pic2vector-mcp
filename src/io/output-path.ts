import path from "node:path";
import { InputError } from "../errors.js";
import { isHttpUrl } from "./url-policy.js";

export function resolveOutputPath(input: string, requested: string | undefined): string {
  if (requested !== undefined) {
    if (requested.trim() === "") throw new InputError("output_path must be a non-empty path.");
    return path.resolve(requested);
  }

  if (isHttpUrl(input)) {
    const stem = stemFromUrl(input);
    return path.join(process.cwd(), `${stem}.svg`);
  }

  const parsed = path.parse(path.resolve(input));
  return path.join(parsed.dir, `${parsed.name}.svg`);
}

function stemFromUrl(input: string): string {
  let base = "image";
  try {
    const segment = path.posix.basename(new URL(input).pathname);
    if (segment && segment !== "/" && segment !== ".") base = segment;
  } catch {
    base = "image";
  }
  const stripped = base.replace(/\.(png|jpe?g|gif|webp|avif|bmp)$/i, "");
  const safe = stripped.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 80);
  return safe || "image";
}
