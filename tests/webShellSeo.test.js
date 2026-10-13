const fs = require('fs');
const path = require('path');

describe('web shell SEO source', () => {
  const root = path.join(__dirname, '..');
  const patcher = fs.readFileSync(path.join(root, 'scripts/patch-web-shell-seo.js'), 'utf8');
  const entry = fs.readFileSync(path.join(root, 'index.web.js'), 'utf8');

  test('defines one raw Organization and WebSite graph with approved contacts', () => {
    expect(patcher).toContain('yovibe-site-jsonld');
    expect(patcher).toContain('Remove a previous site graph');
    expect(patcher).toContain("'@type': 'Organization'");
    expect(patcher).toContain("'@type': 'WebSite'");
    expect(patcher).toContain('reinolmartin0001@gmail.com');
    expect(patcher).toContain('+256764336256');
    expect(patcher).toContain('/assets/icon.png');
  });

  test('provides all public fallback links and no longer injects duplicate global metadata', () => {
    for (const route of ['/events', '/venues', '/calendar', '/map', '/about', '/contact']) {
      expect(patcher).toContain(route);
    }
    expect(entry).not.toContain('SEO META TAGS INJECTION');
    expect(entry).not.toContain("document.title = 'YoVibe | Buy Tickets, Discover Events & Venues in Uganda'");
  });
});
