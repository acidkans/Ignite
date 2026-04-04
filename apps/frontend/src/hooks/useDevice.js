import { useState, useEffect } from 'react';

export function useDevice() {
  const [device, setDevice] = useState({
    isMobile: window.innerWidth < 768,
    isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
    isDesktop: window.innerWidth >= 1024,
    width: window.innerWidth
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');

    const handleUpdate = () => {
      setDevice({
        isMobile: mobileQuery.matches,
        isTablet: tabletQuery.matches,
        isDesktop: !mobileQuery.matches && !tabletQuery.matches,
        width: window.innerWidth
      });
    };

    mobileQuery.addEventListener('change', handleUpdate);
    tabletQuery.addEventListener('change', handleUpdate);
    window.addEventListener('resize', handleUpdate);
    
    return () => {
      mobileQuery.removeEventListener('change', handleUpdate);
      tabletQuery.removeEventListener('change', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, []);

  return device;
}
