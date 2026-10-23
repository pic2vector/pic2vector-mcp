import { MAX_DOWNLOAD_BYTES, DOWNLOAD_TIMEOUT_MS, MAX_REDIRECTS } from "../constants.js";
import { InputError } from "../errors.js";
import { assertPublicHttpUrl } from "./url-policy.js";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export async function downloadImage(rawUrl: string): Promise<Buffer> {
  const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const cancel = new AbortController();
  const signal = AbortSignal.any([timeout, cancel.signal]);
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicHttpUrl(current);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          accept: "image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
          "user-agent": "pic2vector-mcp",
        },
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new InputError("Timed out downloading the image after 15 seconds.");
      }
      throw new InputError(`Failed to download the image. ${errorText(error)}`);
    }

    if (REDIRECT_STATUS.has(response.status)) {
      await response.body?.cancel();
      if (hop === MAX_REDIRECTS) {
        throw new InputError("The image URL redirected too many times.");
      }
      const location = response.headers.get("location");
      if (!location) throw new InputError("The image URL redirected without a location.");
      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new InputError(`Failed to download the image: HTTP ${response.status}.`);
    }

    const declared = contentLength(response);
    if (declared !== null && declared > MAX_DOWNLOAD_BYTES) {
      await cancelBody(response);
      throw new InputError(
        `The image URL is ${declared} bytes, which exceeds the 10MB limit.`,
      );
    }

    return readLimited(response, MAX_DOWNLOAD_BYTES);
  }

  throw new InputError("The image URL redirected too many times.");
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Closing an unread body can reject; the size error is what the caller wants.
  }
}

function contentLength(response: Response): number | null {
  const header = response.headers.get("content-length");
  if (!header) return null;
  const value = Number(header);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new InputError("The image URL returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new InputError("The image URL exceeds the 10MB limit.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (isTimeout(error)) {
      throw new InputError("Timed out downloading the image after 15 seconds.");
    }
    throw new InputError(`Failed to download the image. ${errorText(error)}`);
  }

  if (total === 0) throw new InputError("The image URL returned an empty response.");
  return Buffer.concat(chunks);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The download failed.";
}
