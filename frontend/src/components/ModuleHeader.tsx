import React from 'react';

interface ModuleHeaderProps {
  title: string;
  subtitle: string;
}

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({ title, subtitle }) => {
  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '32px 40px',
      borderRadius: '16px',
      marginBottom: '32px',
      boxShadow: '0 10px 40px rgba(102, 126, 234, 0.2)',
    }}>
      <h1 style={{ 
        margin: '0 0 8px 0',
        fontSize: '32px', 
        fontWeight: 800, 
        color: '#ffffff',
        letterSpacing: '-0.02em',
        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
      }}>
        {title}
      </h1>
      <p style={{ 
        margin: 0,
        fontSize: '15px', 
        color: 'rgba(255, 255, 255, 0.9)',
        fontWeight: 400,
        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
      }}>
        {subtitle}
      </p>
    </div>
  );
};

export default ModuleHeader;
