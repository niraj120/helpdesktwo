import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdLock, MdArrowBack, MdHome, MdShield } from 'react-icons/md';

/**
 * NoAccess Component
 * 
 * Displayed when a user attempts to access a page without required permissions.
 * Shows a friendly error message with helpful actions.
 */
const NoAccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  // Get navigation state (which permission was missing)
  const state = location.state as any;
  const fromPath = state?.from?.pathname || '/';
  const missingPermission = state?.missingPermission;
  const missingPermissions = state?.missingPermissions;
  const requireAll = state?.requireAll;

  const getText = (en: string, hi: string, mr: string): string => {
    if (i18n.language === 'hi') return hi;
    if (i18n.language === 'mr') return mr;
    return en;
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--background-secondary)',
      padding: '24px',
      fontFamily: i18n.language === 'mr' 
        ? '"Noto Sans Devanagari", sans-serif' 
        : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        maxWidth: '600px',
        width: '100%',
        backgroundColor: 'var(--background-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: '48px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
        textAlign: 'center'
      }}>
        {/* Lock Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 24px',
          backgroundColor: 'var(--error-light)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '40px',
          color: 'var(--error-main)'
        }}>
          <MdLock />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '32px',
          fontWeight: '600',
          color: 'var(--text-primary)',
          marginBottom: '16px'
        }}>
          {getText('Access Denied', 'एक्सेस अस्वीकृत', 'प्रवेश नाकारला')}
        </h1>

        {/* Description */}
        <p style={{
          fontSize: '16px',
          color: 'var(--text-secondary)',
          marginBottom: '24px',
          lineHeight: '1.6'
        }}>
          {getText(
            'You do not have the required permissions to access this page.',
            'आपके पास इस पृष्ठ तक पहुँचने के लिए आवश्यक अनुमतियाँ नहीं हैं।',
            'आपल्याकडे हे पृष्ठ ऍक्सेस करण्यासाठी आवश्यक परवानग्या नाहीत.'
          )}
        </p>

        {/* Permission Details (for debugging/admin) */}
        {(missingPermission || missingPermissions) && (
          <div style={{
            backgroundColor: 'var(--surface-variant)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '24px',
            textAlign: 'left'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              color: 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              <MdShield />
              <span>
                {getText('Required Permission(s):', 'आवश्यक अनुमति:', 'आवश्यक परवानगी:')}
              </span>
            </div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--background-primary)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)'
            }}>
              {missingPermission && (
                <div>• {missingPermission}</div>
              )}
              {missingPermissions && Array.isArray(missingPermissions) && (
                <>
                  {missingPermissions.map((perm: string, index: number) => (
                    <div key={index}>• {perm}</div>
                  ))}
                  <div style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic'
                  }}>
                    {requireAll 
                      ? getText('(All permissions required)', '(सभी अनुमतियाँ आवश्यक)', '(सर्व परवानग्या आवश्यक)')
                      : getText('(Any one permission required)', '(कोई एक अनुमति आवश्यक)', '(कोणतीही एक परवानगी आवश्यक)')
                    }
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Help Text */}
        <p style={{
          fontSize: '14px',
          color: 'var(--text-secondary)',
          marginBottom: '32px',
          lineHeight: '1.5'
        }}>
          {getText(
            'If you believe you should have access to this page, please contact your system administrator or manager.',
            'यदि आपको लगता है कि आपके पास इस पृष्ठ तक पहुंच होनी चाहिए, तो कृपया अपने सिस्टम व्यवस्थापक या प्रबंधक से संपर्क करें।',
            'जर तुम्हाला वाटत असेल की तुम्हाला या पृष्ठावर प्रवेश असावा, तर कृपया तुमच्या सिस्टम प्रशासकाशी किंवा व्यवस्थापकाशी संपर्क साधा.'
          )}
        </p>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          {/* Go Back Button */}
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: 'transparent',
              color: 'var(--primary-main)',
              border: '1px solid var(--primary-main)',
              borderRadius: 'var(--radius-md)',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--primary-light)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <MdArrowBack />
            {getText('Go Back', 'वापस जाएं', 'परत जा')}
          </button>

          {/* Home Button */}
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: 'var(--primary-main)',
              color: 'var(--primary-on)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--primary-dark)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--primary-main)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
          >
            <MdHome />
            {getText('Go to Dashboard', 'डैशबोर्ड पर जाएं', 'डॅशबोर्डवर जा')}
          </button>
        </div>

        {/* Additional Info */}
        <div style={{
          marginTop: '32px',
          paddingTop: '24px',
          borderTop: '1px solid var(--border-light)',
          fontSize: '12px',
          color: 'var(--text-secondary)'
        }}>
          {getText(
            'For security reasons, access to this page is restricted to authorized users only.',
            'सुरक्षा कारणों से, इस पृष्ठ तक पहुंच केवल अधिकृत उपयोगकर्ताओं तक ही सीमित है।',
            'सुरक्षेच्या कारणांमुळे, या पृष्ठावरील प्रवेश केवळ अधिकृत वापरकर्त्यांसाठी प्रतिबंधित आहे.'
          )}
        </div>
      </div>
    </div>
  );
};

export default NoAccess;
