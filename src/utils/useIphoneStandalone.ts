import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export function isIphoneStandalone(userAgent: string, displayStandalone: boolean, iosStandalone: boolean): boolean {
  return /iPhone|iPod/i.test(userAgent) && (displayStandalone || iosStandalone);
}

export function useIphoneStandalone(): boolean {
  const readMode = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    return isIphoneStandalone(
      window.navigator.userAgent,
      window.matchMedia?.('(display-mode: standalone)').matches ?? false,
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
  };
  const [standalone, setStandalone] = useState(readMode);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const media = window.matchMedia?.('(display-mode: standalone)');
    const update = () => setStandalone(readMode());
    if (media?.addEventListener) media.addEventListener('change', update);
    else media?.addListener?.(update);
    window.addEventListener('pageshow', update);
    update();
    return () => {
      if (media?.removeEventListener) media.removeEventListener('change', update);
      else media?.removeListener?.(update);
      window.removeEventListener('pageshow', update);
    };
  }, []);
  return standalone;
}
