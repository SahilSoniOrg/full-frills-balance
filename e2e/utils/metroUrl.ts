import { execSync } from 'child_process';

function getLanIp(): string | undefined {
  try {
    const ip = execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim();
    return ip || undefined;
  } catch {
    return undefined;
  }
}

/** Metro URL the iOS Simulator can reach (host LAN IP — not 127.0.0.1). */
export function resolveMetroUrl(): string {
  const fromEnv = process.env.DETOX_METRO_URL?.replace(/\/$/, '');
  const port = fromEnv ? new URL(fromEnv).port || '8081' : '8081';

  if (fromEnv) {
    const { hostname } = new URL(fromEnv);
    if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
      return fromEnv;
    }
  }

  const ip = getLanIp();
  if (ip) {
    return `http://${ip}:${port}`;
  }

  return fromEnv ?? 'http://127.0.0.1:8081';
}
