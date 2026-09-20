function isPrivateNetworkHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const mappedIpv4 = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4Host = mappedIpv4 ?? host;
  return (
    ipv4Host === "localhost" ||
    ipv4Host.endsWith(".localhost") ||
    ipv4Host.endsWith(".local") ||
    ipv4Host === "::1" ||
    ipv4Host === "::" ||
    ipv4Host === "0.0.0.0" ||
    ipv4Host.startsWith("127.") ||
    ipv4Host.startsWith("10.") ||
    ipv4Host.startsWith("192.168.") ||
    ipv4Host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ipv4Host) ||
    ipv4Host.startsWith("fc") ||
    ipv4Host.startsWith("fd") ||
    ipv4Host.startsWith("fe80:")
  );
}

export function assertSafeRemoteUrl(value: string, label = "URL") {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`${label} must use http or https.`);
  if (
    isPrivateNetworkHost(url.hostname) &&
    process.env.ALLOW_PRIVATE_NETWORK_URLS !== "true"
  )
    throw new Error(`${label} points to a private or local network address.`);
  return url;
}

export async function fetchSafeRemote(
  value: string,
  init: RequestInit,
  label = "URL"
) {
  let current = value;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    assertSafeRemoteUrl(current, label);
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
