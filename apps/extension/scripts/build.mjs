// Copies src/ to dist/ and writes the version from package.json into the manifest.
// The release workflow zips dist/ for Chrome and Firefox (the same files work in both).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
cpSync(join(root, 'src'), dist, { recursive: true });
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
manifest.version = version;
writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built Charcoal Helper ${version} → ${dist}`);
