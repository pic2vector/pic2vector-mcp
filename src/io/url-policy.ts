import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { InputError } from "../errors.js";

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("224.0.0.0", 4, "ipv4");
blocked.addSubnet("240.0.0.0", 4, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Reject localhost, loopback, and private or link-local addresses. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InputError("The image URL is not valid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InputError("Only http and https URLs are supported.");
  }

  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!hostname) throw new InputError("The image URL is missing a host.");
  if (isBlockedHostname(hostname)) {
    throw new InputError(`Refusing to fetch a private or loopback address (${hostname}).`);
  }

  const addresses = await resolveAddresses(hostname);
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new InputError(
        `Refusing to fetch a private or loopback address (${hostname} → ${address}).`,
      );
    }
  }

  return url;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localdomain")
  );
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) {
      throw new InputError(`Could not resolve host ${hostname}.`);
    }
    return records.map((record) => record.address);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(`Could not resolve host ${hostname}.`);
  }
}

function isBlockedAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return blocked.check(address, "ipv4");
  if (kind !== 6) return true;

  const mapped = address.toLowerCase().startsWith("::ffff:")
    ? address.slice("::ffff:".length)
    : "";
  if (mapped && isIP(mapped) === 4) return isBlockedAddress(mapped);
  return blocked.check(address, "ipv6");
}
