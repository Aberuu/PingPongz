import os from 'os';

export function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    for (const net of netList) {
      // IPv4 and non-internal only
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  // Fallback to localhost if no LAN adapter found (e.g. offline standalone)
  if (addresses.length === 0) {
    addresses.push('127.0.0.1');
  }

  return addresses;
}
