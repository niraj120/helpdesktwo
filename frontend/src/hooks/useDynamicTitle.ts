import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Custom hook to dynamically update the browser tab title based on project branding
 * NOTE: This hook is now deprecated. Title updates are handled by BrandingContext.
 * Keeping this for backward compatibility, but it does nothing.
 */
export const useDynamicTitle = () => {
  const location = useLocation();

  useEffect(() => {
    // Title is now updated by BrandingContext
    // This hook is kept for backward compatibility but does nothing
    console.log('useDynamicTitle: Title management delegated to BrandingContext');
  }, [location.pathname]);
};
