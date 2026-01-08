// Reusable modern UI styles for all module pages

export const modernButton = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 20px',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
  transition: 'all 0.2s ease',
  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
};

export const modernCard = {
  background: 'white',
  borderRadius: '16px',
  border: '1px solid #E5E7EB',
  overflow: 'hidden',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
};

export const modernTable = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
};

export const modernTableHeader = {
  background: '#F9FAFB',
  borderBottom: '1px solid #E5E7EB',
};

export const modernTableHeaderCell = {
  padding: '12px 24px',
  textAlign: 'left' as const,
  fontSize: '12px',
  fontWeight: 600,
  color: '#6B7280',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

export const modernTableRow = {
  borderBottom: '1px solid #E5E7EB',
  background: 'white',
  transition: 'background 0.15s ease',
};

export const modernTableCell = {
  padding: '16px 24px',
  fontSize: '14px',
  color: '#374151',
};

export const modernBadge = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 12px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
};

export const modernInput = {
  width: '100%',
  padding: '12px 16px',
  border: '2px solid #E5E7EB',
  borderRadius: '12px',
  fontSize: '14px',
  outline: 'none',
  transition: 'all 0.2s ease',
  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
  background: 'white',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
};

export const modernSelect = {
  padding: '12px 16px',
  border: '2px solid #E5E7EB',
  borderRadius: '12px',
  fontSize: '14px',
  outline: 'none',
  backgroundColor: 'white',
  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
};

export const emptyState = {
  background: 'white',
  borderRadius: '16px',
  border: '1px solid #E5E7EB',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
  textAlign: 'center' as const,
  padding: '80px 40px',
};

export const loadingSpinner = {
  width: '48px',
  height: '48px',
  border: '3px solid #E5E7EB',
  borderTop: '3px solid #667eea',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  margin: '0 auto 16px',
};

export const spinnerKeyframes = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
