import { X509Certificate } from "node:crypto";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { Agent, EnvHttpProxyAgent, type Dispatcher } from "undici";

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
    // `ca` replaces the public roots, and OpenSSL otherwise accepts a chain
    // only when it ends at a self-signed root. A pinned leaf or intermediate
    // issued by a CA would then never verify, and checkServerIdentity (which
    // runs only after the chain has) would never see the pin.
    allowPartialTrustChain: true,
    checkServerIdentity: (host: string, cert: PeerCertificate) =>
      pinned.has(cert.fingerprint256) ? undefined : checkServerIdentity(host, cert),
  };
}

/**
 * How long an idle connection to the console is kept for the next call, when
 * the server does not say (a Keep-Alive header's timeout wins). It has to end
 * before the server's own idle timeout, or a call reuses a socket the server
 * has just closed and fails with "other side closed"; a write is not retried.
 * Proxies in front of api.ui.com and consoles commonly close at 60 s (AWS
 * load balancers) or 75 s (nginx), so this stays well short of both while
 * still covering the usual gap between a model's calls.
 */
const KEEP_ALIVE_MS = 20_000;

/**
 * Whether Node routes its own fetch through HTTP_PROXY / HTTPS_PROXY. Node
 * does so only when asked (NODE_USE_ENV_PROXY=1 or --use-env-proxy), so a
 * proxy variable set for other tools never captures a local console's traffic.
 */
function nodeUsesEnvProxy(): boolean {
  const flag = "--use-env-proxy";
  return (
    process.env.NODE_USE_ENV_PROXY === "1" ||
    process.execArgv.includes(flag) ||
    (process.env.NODE_OPTIONS ?? "").split(/\s+/).includes(flag)
  );
}

/**
 * The dispatcher for requests to the console: its TLS settings, and
 * connections kept open across the gaps between a model's calls instead of
 * paying a new TLS handshake each time. HTTP/1.1 only, as Node's built-in
 * fetch speaks, rather than undici's default of offering HTTP/2. With Node's
 * env proxy turned on, requests go through HTTP_PROXY / HTTPS_PROXY (minus
 * NO_PROXY) as they did through the built-in fetch.
 */
export function consoleDispatcher(tls: TlsSettings): Dispatcher {
  const connect = consoleTlsOptions(tls);
  const options = { keepAliveTimeout: KEEP_ALIVE_MS, allowH2: false, connect };
  return nodeUsesEnvProxy()
    ? new EnvHttpProxyAgent({ ...options, requestTls: { ...connect, allowH2: false } })
    : new Agent(options);
}
