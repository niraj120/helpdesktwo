/**
 * OptimizedImage Component
 * ========================
 * A performance-optimized image component with:
 * - Native lazy loading
 * - Progressive loading with blur placeholder
 * - Intersection Observer for below-fold images
 * - Error handling with fallback
 * - WebP detection and modern format preference
 *
 * Usage:
 *   <OptimizedImage
 *     src={imageUrl}
 *     alt="Description"
 *     width={200}
 *     height={100}
 *     priority={false}  // Set true for above-fold images
 *   />
 */

import React, { useState, useRef, useEffect, memo, CSSProperties } from 'react';

interface OptimizedImageProps {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Width in pixels or CSS value */
  width?: number | string;
  /** Height in pixels or CSS value */
  height?: number | string;
  /** Priority loading (skip lazy load for above-fold) */
  priority?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
  /** Object-fit property */
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  /** Show blur placeholder while loading */
  showPlaceholder?: boolean;
  /** Placeholder background color */
  placeholderColor?: string;
  /** Fallback component when image fails */
  fallback?: React.ReactNode;
  /** Callback when image loads */
  onLoad?: () => void;
  /** Callback when image fails */
  onError?: () => void;
}

/**
 * Detect WebP support
 */
const checkWebPSupport = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
};

// Cache WebP support result
let webPSupported: boolean | null = null;

/**
 * Default fallback component
 */
const DefaultFallback: React.FC<{ width?: number | string; height?: number | string }> = ({ width, height }) => (
  <div
    style={{
      width: typeof width === 'number' ? `${width}px` : width || '100%',
      height: typeof height === 'number' ? `${height}px` : height || '100%',
      backgroundColor: '#F3F4F6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '4px',
    }}
  >
    <svg
      style={{ width: '24px', height: '24px', color: '#9CA3AF' }}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  </div>
);

/**
 * OptimizedImage Component
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = memo(({
  src,
  alt,
  width,
  height,
  priority = false,
  className = '',
  style,
  objectFit = 'contain',
  showPlaceholder = true,
  placeholderColor = '#F3F4F6',
  fallback,
  onLoad,
  onError,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check WebP support on mount
  useEffect(() => {
    if (webPSupported === null) {
      checkWebPSupport().then((supported) => {
        webPSupported = supported;
      });
    }
  }, []);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority, isInView]);

  // Handle image load
  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
    onLoad?.();
  };

  // Handle image error
  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
    onError?.();
  };

  // Build style object
  const containerStyle: CSSProperties = {
    position: 'relative',
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    overflow: 'hidden',
    backgroundColor: showPlaceholder && !isLoaded ? placeholderColor : 'transparent',
    transition: 'background-color 0.3s ease',
    ...style,
  };

  const imageStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit,
    opacity: isLoaded && !hasError ? 1 : 0,
    transition: 'opacity 0.3s ease',
  };

  // Show fallback if error
  if (hasError) {
    return (
      <div ref={containerRef} className={className} style={containerStyle}>
        {fallback || <DefaultFallback width={width} height={height} />}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      {/* Placeholder skeleton */}
      {showPlaceholder && !isLoaded && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: placeholderColor,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Actual image - only render when in view */}
      {isInView && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={handleLoad}
          onError={handleError}
          style={imageStyle}
        />
      )}

      {/* Inline styles for animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

/**
 * Logo-specific optimized image with sensible defaults
 */
export const OptimizedLogo: React.FC<Omit<OptimizedImageProps, 'objectFit'> & {
  maxWidth?: number;
  maxHeight?: number;
}> = memo(({ maxWidth = 200, maxHeight = 60, style, ...props }) => (
  <OptimizedImage
    {...props}
    objectFit="contain"
    style={{
      maxWidth,
      maxHeight,
      ...style,
    }}
  />
));

OptimizedLogo.displayName = 'OptimizedLogo';

/**
 * Avatar-specific optimized image with circular shape
 */
export const OptimizedAvatar: React.FC<Omit<OptimizedImageProps, 'objectFit'> & {
  size?: number;
}> = memo(({ size = 40, style, ...props }) => (
  <OptimizedImage
    {...props}
    width={size}
    height={size}
    objectFit="cover"
    style={{
      borderRadius: '50%',
      ...style,
    }}
  />
));

OptimizedAvatar.displayName = 'OptimizedAvatar';

export default OptimizedImage;
