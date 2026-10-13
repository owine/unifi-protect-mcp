import { X509Certificate } from "node:crypto";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { Agent } from "undici";

/** Every certificate in a PEM bundle. Throws on a malformed certificate block. */
export function pemCertificates(pem: string): X509Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((block) => new X509Certificate(block));
}

interface TlsSettings {
  verifySsl: boolean;
  caCert?: string;
}

/**
 * TLS options for a connection to the console, shared by requests and the
 * subscription WebSocket. They are scoped to this client, not set in the
 * process-wide NODE_TLS_REJECT_UNAUTHORIZED, which turned verification off for
 * every other TLS connection in the process as well.
 */
export function consoleTlsOptions({ verifySsl, caCert }: TlsSettings) {
  if (!verifySsl) return { rejectUnauthorized: false };
  if (caCert === undefined) return {};
  // A console's self-signed certificate is issued to a name like unifi.local
  // but reached by IP, so its hostname never matches. Accept the console when
  // it presents exactly a pinned certificate; any other certificate, such as
  // one issued by a pinned CA, still has to match the hostname.
  const pinned = new Set(pemCertificates(caCert).map((cert) => cert.fingerprint256));
  return {
    ca: caCert,
    checkServerIdentity: (host: string, cert: PeerCertificate) =>
      pinned.has(cert.fingerprint256) ? undefined : checkServerIdentity(host, cert),
  };
}

/** How long an idle connection to the console is kept for the next call. */
const KEEP_ALIVE_MS = 60_000;

/**
 * The dispatcher for requests to the console: its TLS settings, and
 * connections kept open across the gaps between a model's calls instead of
 * paying a new TLS handshake each time.
 */
export function consoleDispatcher(tls: TlsSettings): Agent {
  return new Agent({ keepAliveTimeout: KEEP_ALIVE_MS, connect: consoleTlsOptions(tls) });
}
