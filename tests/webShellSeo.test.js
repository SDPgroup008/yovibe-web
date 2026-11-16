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
    expect(patcher).toContain('info@yovibe.net');
    expect(patcher).toContain('+256764336256');
    expect(patcher).toContain('/assets/icon.png');
    expect(patcher).toContain('/assets/og-image.png');
    expect(patcher).toContain('copyFileSync(sourceOgImagePath, publishedOgImagePath)');
    expect(patcher).toContain('og:image:secure_url');
  });

  test('provides all public fallback links and no longer injects duplicate global metadata', () => {
    for (const route of ['/events', '/venues', '/calendar', '/map', '/about']) {
      expect(patcher).toContain(route);
    }
    expect(patcher).not.toContain('${siteUrl}/contact');
    expect(entry).not.toContain('SEO META TAGS INJECTION');
    expect(entry).not.toContain("document.title = 'YoVibe | Buy Tickets, Discover Events & Venues in Uganda'");
  });

  test('detects iOS Home Screen mode and uses only the device safe insets there', () => {
    const navigation = fs.readFileSync(path.join(root, 'src/components/Navigation.tsx'), 'utf8');
    expect(patcher).toContain('display-mode: standalone');
    expect(patcher).toContain('window.navigator.standalone === true');
    expect(patcher).toContain('yovibe-standalone .yovibe-mobile-header');
    expect(patcher).toContain('padding-top: 2px !important');
    expect(patcher).toContain('padding-bottom: 2px !important');
    expect(patcher).toContain('align-self: flex-start !important');
    expect(patcher).toContain('justify-content: flex-end !important');
    expect(patcher).toContain('yovibe-standalone .yovibe-mobile-content');
    expect(navigation).toContain('yovibe-mobile-content');
    expect(navigation).toContain('yovibe-header-brand');
    expect(navigation).toContain('yovibe-bottom-tab-item');
  });
});
