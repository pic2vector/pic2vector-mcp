import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { InputError } from "../errors.js";
import { downloadImage } from "./download.js";
import { isHttpUrl } from "./url-policy.js";

export async function loadImageBytes(input: string): Promise<Buffer> {
  if (isHttpUrl(input)) return downloadImage(input);

  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    throw new InputError("Only http and https URLs are supported. Local files need an absolute path.");
  }
  if (!path.isAbsolute(input)) {
    throw new InputError("Local input must be an absolute file path, or pass an http(s) URL.");
  }

  let info;
  try {
    info = await lstat(input);
  } catch (error) {
    if (isMissing(error)) throw new InputError(`File not found: ${input}`);
    throw new InputError(`Could not read ${input}.`);
  }
  if (!info.isFile()) throw new InputError(`Not a file: ${input}`);
  return readFile(input);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
