const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(indexPath)) throw new Error('Build artifact missing: dist/index.html');
const html = fs.readFileSync(indexPath, 'utf8');

for (const value of ['yovibe-site-jsonld', 'reinolmartin0001@gmail.com', '+256764336256', '/events', '/venues', '/calendar', '/map', '/about']) {
  if (!html.includes(value)) throw new Error(`SEO artifact missing ${value}`);
}
if ((html.match(/id="yovibe-site-jsonld"/g) || []).length !== 1) {
  throw new Error('Expected exactly one site JSON-LD block in the built web shell');
}
console.log('SEO artifact verification passed.');
