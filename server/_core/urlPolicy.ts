import dns from "node:dns/promises";
import net from "node:net";

const PRIVATE_NETWORK_OPT_IN = "true";

function ipv4FromMappedHex(value: string) {
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null;
  if (high < 0 || high > 0xffff || low < 0 || low > 0xffff) return null;
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function isPrivateAddress(address: string): boolean {
  // URL.hostname keeps the brackets around IPv6 literals.
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (net.isIPv6(normalized)) {
    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    )
      return true;
    if (normalized.startsWith("::ffff:")) {
      const embedded = normalized.slice("::ffff:".length);
      const ipv4 = embedded.includes(".")
        ? embedded
        : ipv4FromMappedHex(embedded);
      return ipv4 ? isPrivateAddress(ipv4) : false;
    }
    return false;
  }
  return false;
}

export async function assertSafeRemoteUrl(value: string, label = "URL") {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`${label} must use http or https.`);
  const privateOptIn =
    process.env.ALLOW_PRIVATE_NETWORK_URLS === PRIVATE_NETWORK_OPT_IN;
  if (privateOptIn) return url;
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    isPrivateAddress(url.hostname)
  ) {
    throw new Error(
      `${label} points to a private or local network address; set ALLOW_PRIVATE_NETWORK_URLS=true only for an intentional isolated deployment.`
    );
  }
  const records = await Promise.race([
    dns.lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} hostname lookup timed out.`)),
        3000
      )
    ),
  ]);
  if (records.some(record => isPrivateAddress(record.address)))
    throw new Error(`${label} resolves to a private or local network address.`);
  return url;
}

export async function fetchSafeRemote(
  value: string,
  init: RequestInit,
  label = "URL"
) {
  let current = value;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertSafeRemoteUrl(current, label);
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirect === 3)
      throw new Error(`${label} followed too many or invalid redirects.`);
    current = new URL(location, current).toString();
  }
  throw new Error(`${label} followed too many redirects.`);
}
