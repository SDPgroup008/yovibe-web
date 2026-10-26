const fs = require('fs');
const path = require('path');
const { renderTicketPdf } = require('../netlify/shared/ticketPdfArtwork');

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlPkN8AAAAASUVORK5CYII=';

describe('ticket PDF runtime packaging and fallback artwork', () => {
  test('Netlify includes the native Linux renderer used by PDF and email functions', () => {
    const netlifyConfig = fs.readFileSync(path.join(__dirname, '../netlify.toml'), 'utf8');
    const generator = fs.readFileSync(path.join(__dirname, '../scripts/generate-modern-functions.js'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

    expect(manifest.optionalDependencies['@resvg/resvg-js-linux-x64-gnu']).toBe('2.6.2');
    expect(netlifyConfig).toContain('node_modules/@resvg/resvg-js/**');
    expect(netlifyConfig).toContain('node_modules/@resvg/resvg-js-linux-x64-gnu/**');
    expect(generator).toContain('resvgjs.linux-x64-gnu.node');
  });

  test('renders a branded ticket when unapproved poster artwork cannot be loaded', async () => {
    const bytes = await renderTicketPdf({
      eventName: 'Fallback Test',
      ticketType: 'Regular',
      venue: 'Venue',
      date: 'October 26, 2026',
      time: '10:00 AM',
      ticketRef: 'YV-FALLBACK',
      qrCodeDataUrl: png,
      buyerName: 'Guest',
      posterUrl: 'https://untrusted.example/poster.jpg',
    });

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('%PDF');
  });
});
