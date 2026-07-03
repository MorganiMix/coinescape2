/**
 * Network helpers.
 *
 * The device only knows its LAN IP; the *external* (public) IP — the one an
 * exchange sees and that you'd whitelist on an API key — must be fetched from a
 * public IP-echo service. We try a couple of well-known HTTPS endpoints in turn
 * so a single outage doesn't break the feature.
 */
import { fetchWithTimeout } from '@/exchange/signing';

/** IPv4/IPv6-ish sanity check so we never display junk from a captive portal. */
function looksLikeIp(value: string): boolean {
  const v = value.trim();
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+:[0-9a-fA-F:]+$/;
  return ipv4.test(v) || ipv6.test(v);
}

const IP_ENDPOINTS: { url: string; extract: (data: any, text: string) => string | undefined }[] = [
  { url: 'https://api.ipify.org?format=json', extract: (d) => d?.ip },
  { url: 'https://ipapi.co/json/', extract: (d) => d?.ip },
  { url: 'https://ifconfig.co/json', extract: (d) => d?.ip },
];

/**
 * Fetch the device's current external IP address, or null if none of the
 * services respond / return a valid address. Never throws.
 */
export async function fetchExternalIp(): Promise<string | null> {
  for (const { url, extract } of IP_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, 8000);
      if (!res.ok) continue;
      const text = await res.text();
      let ip: string | undefined;
      try {
        ip = extract(JSON.parse(text), text);
      } catch {
        // Some endpoints can return a bare string; fall back to the raw text.
        ip = text;
      }
      if (ip && looksLikeIp(ip)) return ip.trim();
    } catch {
      // Try the next endpoint.
    }
  }
  return null;
}
