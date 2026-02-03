import React, { memo } from 'react';

/**
 * StatCard - Memoized statistic display card
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Wrapped in React.memo to prevent unnecessary re-renders
 * - Only re-renders when props actually change
 * - Used across Dashboard, Reports, and other stat-heavy pages
 */

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

const StatCard = memo<StatCardProps>(({
  title,
  value,
  icon,
  bgColor = '#EFF6FF',
  textColor = '#1E40AF',
  borderColor = '#3B82F6',
  loading = false,
  onClick,
  className = '',
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-5 shadow-sm transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${className}`}
      style={{
        border: `2px solid ${borderColor}20`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{icon}</span>
        <p className="text-sm text-gray-500 m-0">{title}</p>
      </div>
      <p
        className="text-3xl font-bold m-0"
        style={{ color: textColor }}
      >
        {loading ? '-' : value}
      </p>
    </div>
  );
});

StatCard.displayName = 'StatCard';

export default StatCard;
