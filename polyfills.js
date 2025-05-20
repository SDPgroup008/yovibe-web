// Fix for touch events in React Native Web
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', function() {}, { passive: true });
  document.addEventListener('touchmove', function() {}, { passive: true });
  document.addEventListener('touchend', function() {}, { passive: true });
}

// AsyncStorage polyfill for web
if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
  const originalSetItem = window.localStorage.setItem;
  window.localStorage.setItem = function(key, value) {
    try {
      originalSetItem.call(window.localStorage, key, value);
    } catch (e) {
      console.warn('Local storage is full, clearing and retrying');
      window.localStorage.clear();
      originalSetItem.call(window.localStorage, key, value);
    }
  };
}