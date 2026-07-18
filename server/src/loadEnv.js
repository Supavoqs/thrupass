const fs = require('node:fs');
const path = require('node:path');

// Minimal .env loader, no dependency: reads KEY=VALUE lines from a .env file
// in the app root (next to package.json) into process.env. Lines starting
// with # are comments; surrounding quotes on values are stripped; variables
// already present in the real environment always win. This exists because
// shared-hosting env-var UIs (cPanel's Node.js selector) are fiddly enough
// that values can silently fail to save — a file is a reliable fallback the
// merchant can create with File Manager.
const envPath = path.join(__dirname, '..', '.env');
try {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
} catch {
  // No .env file — perfectly fine, the real environment is the normal path.
}
