import React from 'react';

interface SkipLinkProps {
  href?: string;
  children?: React.ReactNode;
}

/**
 * SkipLink component for accessibility
 * Allows keyboard users to skip directly to main content
 */
export const SkipLink: React.FC<SkipLinkProps> = ({ 
  href = '#main-content', 
  children = 'Skip to main content' 
}) => {
  return (
    <a
      href={href}
      style={{
        position: 'absolute',
        left: '-9999px',
        zIndex: 999,
        padding: '1rem',
        backgroundColor: '#3F41D1',
        color: 'white',
        textDecoration: 'none',
        borderRadius: '4px',
        fontWeight: 600,
      }}
      onFocus={(e) => {
        e.currentTarget.style.left = '1rem';
        e.currentTarget.style.top = '1rem';
      }}
      onBlur={(e) => {
        e.currentTarget.style.left = '-9999px';
        e.currentTarget.style.top = 'auto';
      }}
    >
      {children}
    </a>
  );
};

export default SkipLink;
