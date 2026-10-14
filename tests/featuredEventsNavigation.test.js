const fs = require('fs');
const path = require('path');

describe('featured event navigation', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  test('uses the existing admin-controlled featured field and preserves the full catalogue', () => {
    const screen = read('src/screens/EventsScreen.tsx');
    expect(screen).toContain('event.isFeatured');
    expect(screen).not.toContain('hotPickBadge');
    expect(screen).toContain('horizontal');
    expect(screen).toContain('setInterval');
    expect(screen).toContain('eventCardHorizontalMargin');
    expect(screen).toContain('gridAvailableWidth');
    expect(screen).toMatch(/gridAvailableWidth\s*- eventCardHorizontalMargin \* 2 \* gridColumns/);
    expect(screen).toContain('featuredCardFootprint');
    expect(screen).toContain('featuredCarouselGap = deviceType.isLargeScreen ? 0 : spacing.md');
    expect(screen).toContain('featuredDesktopOffset = deviceType.isLargeScreen ? -eventCardHorizontalMargin : 0');
    expect(screen).toContain('featuredSlideWidth = featuredCardFootprint + featuredCarouselGap');
    expect(screen).toContain('contentContainerStyle={[styles.featuredCarouselContent, { columnGap: featuredCarouselGap }]}');
    expect(screen).toContain('featuredVisibleCards = deviceType.isLargeScreen ? 3 : deviceType.isTablet ? 2 : 1');
    expect(screen).toContain('featuredViewportWidth');
    expect(screen).toContain('canScrollFeatured');
    expect(screen).toContain('onMomentumScrollEnd');
    expect(screen).toContain('nestedScrollEnabled');
    expect(screen).toContain('ListHeaderComponentStyle={styles.featuredHeader}');
    expect(screen).toContain('data={displayedEvents || []}');
    expect(screen).toContain('accessibilityRole="button"');
  });

  test('keeps the root URL as a public events landing page instead of redirecting it', () => {
    const routes = read('src/utils/routes.tsx');
    expect(routes).toContain("component: withCompatNavigation(EventsScreen)");
    expect(routes).not.toContain('window.location.href = \'/events\'');
  });

  test('leaves public event metadata to the edge document instead of duplicating it in the client', () => {
    const detail = read('src/screens/EventDetailScreen.tsx');
    expect(detail).not.toContain("const scriptId = 'event-json-ld'");
    expect(detail).not.toContain('availability": "https://schema.org/InStock');
  });
});
