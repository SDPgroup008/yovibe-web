// Fix for touch events in React Native Web
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', function() {}, { passive: true });
  document.addEventListener('touchmove', function() {}, { passive: true });
  document.addEventListener('touchend', function() {}, { passive: true });
}

// Fix for AsyncStorage on web
if (typeof window !== 'undefined' && !window.localStorage) {
  window.localStorage = {
    getItem: (key) => {
      try {
        return window.sessionStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value);
      } catch (e) {
        console.error('Error setting localStorage item:', e);
      }
    },
    removeItem: (key) => {
      try {
        window.sessionStorage.removeItem(key);
      } catch (e) {
        console.error('Error removing localStorage item:', e);
      }
    },
  };
}