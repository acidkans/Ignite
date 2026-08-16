import { useState, useEffect } from 'react';

// Dotyk wykrywamy po ZDOLNOŚCI urządzenia (`any-pointer`), nie po szerokości okna —
// tablet w poziomie ma ≥1024px i dostaje widok desktopowy, więc `isTablet` (oparty na
// media query szerokości) nigdy by się tam nie zapalił. `any-pointer: coarse` łapie
// iPada/Androida i hybrydy z ekranem dotykowym.
// @anchor device-touch-query
const TOUCH_QUERY = '(any-pointer: coarse)';

export function useDevice() {
  const [device, setDevice] = useState({
    isMobile: window.innerWidth < 768,
    isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
    isDesktop: window.innerWidth >= 1024,
    isTouch: window.matchMedia(TOUCH_QUERY).matches,
    width: window.innerWidth
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const touchQuery = window.matchMedia(TOUCH_QUERY);

    const handleUpdate = () => {
      setDevice({
        isMobile: mobileQuery.matches,
        isTablet: tabletQuery.matches,
        isDesktop: !mobileQuery.matches && !tabletQuery.matches,
        isTouch: touchQuery.matches,
        width: window.innerWidth
      });
    };

    mobileQuery.addEventListener('change', handleUpdate);
    tabletQuery.addEventListener('change', handleUpdate);
    touchQuery.addEventListener('change', handleUpdate);
    window.addEventListener('resize', handleUpdate);

    return () => {
      mobileQuery.removeEventListener('change', handleUpdate);
      tabletQuery.removeEventListener('change', handleUpdate);
      touchQuery.removeEventListener('change', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, []);

  return device;
}
