import React, { memo } from 'react';

/**
 * LoadingSpinner - Memoized loading indicator
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Wrapped in React.memo since it has no props that change
 * - Reusable across the application for consistent loading states
 */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 border-2',
  md: 'w-10 h-10 border-3',
  lg: 'w-12 h-12 border-4',
};

const LoadingSpinner = memo<LoadingSpinnerProps>(({
  size = 'md',
  message,
  fullScreen = false,
  className = '',
}) => {
  const spinner = (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div
        className={`${sizeClasses[size]} border-blue-600 border-t-transparent rounded-full animate-spin`}
      />
      {message && (
        <p className="text-gray-600 text-sm m-0">{message}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        {spinner}
      </div>
    );
  }

  return spinner;
});

LoadingSpinner.displayName = 'LoadingSpinner';

export default LoadingSpinner;
