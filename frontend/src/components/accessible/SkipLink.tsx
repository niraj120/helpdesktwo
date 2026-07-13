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
      className="skip-link"
    >
      {children}
    </a>
  );
};

export default SkipLink;
