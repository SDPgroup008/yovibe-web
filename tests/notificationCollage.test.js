const { buildNotificationCollageSvg, parseEventPreviews } = require('../netlify/shared/notificationCollage');

describe('notification collage', () => {
  test('renders at most three named poster tiles', () => {
    const previews = parseEventPreviews(JSON.stringify([
      { slug: 'one', name: 'First Event', posterUrl: 'https://cdn.example.com/one.jpg' },
      { slug: 'two', name: 'Second Event', posterUrl: 'https://cdn.example.com/two.jpg' },
      { slug: 'three', name: 'Third Event', posterUrl: 'https://cdn.example.com/three.jpg' },
      { slug: 'four', name: 'Excluded Event', posterUrl: 'https://cdn.example.com/four.jpg' },
    ]));
    const svg = buildNotificationCollageSvg(previews, [null, null, null]);

    expect(previews).toHaveLength(3);
    expect(svg).toContain('First Event');
    expect(svg).toContain('Second Event');
    expect(svg).toContain('Third Event');
    expect(svg).not.toContain('Excluded Event');
  });
});
