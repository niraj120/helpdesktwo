import React from "react";

interface ModuleHeaderProps {
  title: string;
  subtitle: string;
}

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({
  title,
  subtitle,
}) => {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "12px 24px",
        borderRadius: "10px",
        marginBottom: "20px",
        boxShadow: "0 4px 16px rgba(102, 126, 234, 0.18)",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.01em",
            lineHeight: 1.3,
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: "2px 0 0 0",
            fontSize: "12px",
            color: "rgba(255, 255, 255, 0.82)",
            fontWeight: 400,
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
};

export default ModuleHeader;
