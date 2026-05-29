// Web entry point - loads polyfills before the app

// SEO META TAGS INJECTION - Must run BEFORE React loads for crawlers to see them
(function() {
  // Only run on server-side (initial page load), not on navigation
  if (typeof document === 'undefined') return;
  
  // Check if meta tags already exist
  if (document.getElementById('seo-meta-tags')) return;
  
  const metaTags = [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
    { name: 'theme-color', content: '#121212' },
    { name: 'title', content: 'YoVibe | Best Nightlife Events, Parties & Venues in Uganda' },
    { name: 'description', content: 'YoVibe is your ultimate guide to nightlife, events, entertainment, and vibes in Uganda. Discover the best venues, clubs, bars, parties, concerts, and experiences.' },
    { name: 'keywords', content: 'yovibe, yo vibe, nightlife, events, venues, parties, entertainment, concerts, vibes, vybz, happiness, fun, clubs, bars, Uganda, Kampala' },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: 'https://yovibe.net/' },
    { property: 'og:title', content: 'YoVibe | Best Nightlife Events, Parties & Venues in Uganda' },
    { property: 'og:description', content: 'Discover the best nightlife, events, venues, parties, and entertainment in Uganda with YoVibe.' },
    { property: 'og:image', content: 'https://yovibe.net/assets/og-image.png' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:site_name', content: 'YoVibe' },
    { property: 'og:locale', content: 'en_UG' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:url', content: 'https://yovibe.net/' },
    { name: 'twitter:title', content: 'YoVibe | Best Nightlife Events, Parties & Venues in Uganda' },
    { name: 'twitter:description', content: 'Discover the best nightlife, events, venues, parties, and entertainment in Uganda with YoVibe.' },
    { name: 'twitter:image', content: 'https://yovibe.net/assets/og-image.png' },
    { name: 'twitter:site', content: '@yovibe' },
    { name: 'twitter:creator', content: '@yovibe' },
    { name: 'robots', content: 'index, follow' },
    { name: 'author', content: 'YoVibe' },
    { name: 'geo.region', content: 'UG' },
    { name: 'geo.placename', content: 'Kampala' }
  ];
  
  const head = document.getElementsByTagName('head')[0];

  const ensureHeadTag = (selector, factory) => {
    if (head.querySelector(selector)) return;
    const el = factory();
    head.appendChild(el);
  };

  // PWA installability and iOS standalone support tags.
  ensureHeadTag('link[rel="manifest"]', () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'manifest');
    link.setAttribute('href', '/manifest.webmanifest');
    return link;
  });

  ensureHeadTag('link[rel="apple-touch-icon"]', () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'apple-touch-icon');
    link.setAttribute('href', '/assets/icon.png');
    return link;
  });

  ensureHeadTag('meta[name="apple-mobile-web-app-capable"]', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'apple-mobile-web-app-capable');
    meta.setAttribute('content', 'yes');
    return meta;
  });

  ensureHeadTag('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
    meta.setAttribute('content', 'black-translucent');
    return meta;
  });

  ensureHeadTag('meta[name="apple-mobile-web-app-title"]', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'apple-mobile-web-app-title');
    meta.setAttribute('content', 'YoVibe');
    return meta;
  });
  
  metaTags.forEach(tag => {
    const meta = document.createElement('meta');
    if (tag.charset) {
      meta.setAttribute('charset', tag.charset);
    } else if (tag.property) {
      meta.setAttribute('property', tag.property);
      meta.setAttribute('content', tag.content);
    } else {
      meta.setAttribute('name', tag.name);
      meta.setAttribute('content', tag.content);
    }
    head.appendChild(meta);
  });
  
  // Set title
  document.title = 'YoVibe | Best Nightlife Events, Parties & Venues in Uganda';
})();

// Import polyfills first - order matters!
import "react-native-get-random-values"

// Import URL polyfill for React Native web compatibility
import "./src/utils/url-polyfill"

// Import and execute expo-polyfills
import "./src/utils/expo-polyfills"

// Register the main component
import { registerRootComponent } from "expo"
import App from "./src/App"

registerRootComponent(App)




