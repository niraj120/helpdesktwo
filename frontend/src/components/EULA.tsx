import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getText } from '../utils/language';
import { API_CONFIG } from '../config/constants';


const EULA = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [isChecked, setIsChecked] = useState(false);

  const handleAccept = async () => {
    if (!isChecked) {
      alert(getText('Please read and agree to the Terms and Conditions', 'कृपया अटी आणि शर्ती वाचा आणि सहमत व्हा', 'कृपया अटी आणि शर्ती वाचा आणि सहमत व्हा'));
      return;
    }

    try {
      // Get userId and token from localStorage
      const userId = localStorage.getItem('userId');
      const token = localStorage.getItem('authToken');
      
      if (!userId || !token) {
        alert('User not authenticated');
        navigate('/login');
        return;
      }
      
      const response = await fetch(`${API_CONFIG.API_URL}/auth/eula/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          version: '1.0' // Send current EULA version
        })
      });

      const data = await response.json();
      console.log('Response:', data);
      
      if (response.ok) {
        console.log('✅ EULA accepted:', data);
        
        // Redirect to dashboard after accepting EULA
        navigate('/dashboard');
      } else {
        console.error('❌ EULA acceptance failed:', data);
        alert(data.error || data.message || 'Failed to accept EULA');
      }
    } catch (error: any) {
      console.error('Error accepting EULA:', error);
      alert(`An error occurred: ${error.message || 'Please try again.'}`);
    }
  };

  const toggleLanguage = () => {
    const newLang = getText('mr', 'en', 'en');
    i18n.changeLanguage(newLang);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: i18n.language === 'mr' ? '"Noto Sans Devanagari", "Noto Sans", sans-serif' : '"Inter", "Noto Sans", sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        width: '100%',
        maxWidth: '900px',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px'
            }}>
              🛡️
            </div>
            <div>
              <h1 style={{
                margin: '0',
                color: 'white',
                fontSize: '24px',
                fontWeight: '600'
              }}>
                {getText('End-User License Agreement', 'अंतिम-वापरकर्ता परवाना करार', 'अंतिम-वापरकर्ता परवाना करार')}
              </h1>
              <p style={{
                margin: '4px 0 0 0',
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '14px'
              }}>
                {getText('PLEASE READ THE TERMS AND CONDITIONS CAREFULLY', 'कृपया अटी आणि शर्ती काळजीपूर्वक वाचा', 'कृपया अटी आणि शर्ती काळजीपूर्वक वाचा')}
              </p>
            </div>
          </div>
          <button
            onClick={toggleLanguage}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease-in-out'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            🌐 {getText('मराठी', 'English', 'English')}
          </button>
        </div>

        {/* Warning Box */}
        <div style={{
          margin: '24px',
          padding: '16px',
          backgroundColor: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: '8px'
        }}>
          <p style={{
            margin: '0',
            color: '#92400e',
            fontSize: '14px',
            lineHeight: '1.6'
          }}>
            {getText('Before installing the Software, please read the terms and conditions of this document carefully. If you do not agree to the terms and conditions, please do not install this Software.', 'सॉफ्टवेअर इंस्टॉल करण्यापूर्वी, कृपया या दस्तऐवजातील अटी आणि शर्ती काळजीपूर्वक वाचा. जर तुम्ही अटी आणि शर्तींशी सहमत नसाल तर कृपया हे सॉफ्टवेअर इंस्टॉल करू नका.', 'सॉफ्टवेअर इंस्टॉल करण्यापूर्वी, कृपया या दस्तऐवजातील अटी आणि शर्ती काळजीपूर्वक वाचा. जर तुम्ही अटी आणि शर्तींशी सहमत नसाल तर कृपया हे सॉफ्टवेअर इंस्टॉल करू नका.')}
          </p>
        </div>

        {/* Content */}
        <div style={{
          maxHeight: '400px',
          overflowY: 'auto',
          padding: '0 24px',
          fontSize: '14px',
          lineHeight: '1.8',
          color: '#374151'
        }}>
          {i18n.language === 'en' ? (
            <>
              <p style={{ marginBottom: '16px' }}>
                This End-User Licensed Agreement ("Agreement") is entered into on the date the Licensee (defined later) agrees to the terms and conditions of this Agreement, by and between:
              </p>
              <p style={{ marginBottom: '16px' }}>
                <strong>Hubblehox Technologies Private Limited</strong>, a company incorporated under the laws of India, with its registered office at Unit 801, 8th Floor, Interface 11, Off. Link Road, Malad West, Mumbai-400064 (hereinafter referred to as the "Hubblehox" / "Company", which expression shall, unless repugnant to the context, deemed to include its Affiliates, successors and permitted assigns; & the Party granting the End-User securing license from the Company, to install, access and/or use the Software on its behalf (hereinafter referred to as the "Licensee"). Hubblehox and the Licensee is hereinafter referred to as "Party" and collectively as "Parties". The terms (we, our & us) shall be used in context of Hubblehox, and the terms (you, your) shall be used to refer and in context of the Licensee and/or End-User (defined later).
              </p>
              <div style={{
                padding: '16px',
                backgroundColor: '#fef9e7',
                border: '1px solid #f9e79f',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <p style={{ margin: '0', fontWeight: '600' }}>
                  BY PLACING AN ORDER FOR THE SOFTWARE OR DOWNLOADING AND INSTALLING IT OR ACCEPTING THIS AGREEMENT IN ANY FORM, OR USING THE SOFTWARE, YOU (WHETHER AN INDIVIDUAL OR AN ENTITY) ACKNOWLEDGE AND AGREE TO BE LEGALLY BOUND BY THE TERMS OUTLINED IN THIS AGREEMENT. IF YOU ARE ACCEPTING THIS AGREEMENT ON BEHALF OF A LEGAL ENTITY, YOU CONFIRM THAT YOU HAVE THE AUTHORITY TO BIND THAT ENTITY TO THESE TERMS.
                </p>
              </div>
              <p style={{ marginBottom: '16px' }}>
                This Agreement governs your use of the Software and related services provided by Hubblehox Technologies Private Limited. By using the Software, you agree to comply with all applicable laws and regulations.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                1. Grant of License
              </h3>
              <p style={{ marginBottom: '16px' }}>
                Subject to the terms and conditions of this Agreement, the Company grants you a limited, non-exclusive, non-transferable, revocable license to install and use the Software solely for your internal business purposes.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                2. Restrictions
              </h3>
              <p style={{ marginBottom: '16px' }}>
                You shall not: (a) modify, reverse engineer, decompile, or disassemble the Software; (b) remove any proprietary notices from the Software; (c) use the Software for any unlawful purpose; (d) distribute, sublicense, or transfer the Software to any third party.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                3. Intellectual Property
              </h3>
              <p style={{ marginBottom: '16px' }}>
                All intellectual property rights in and to the Software are owned by Hubblehox Technologies Private Limited. This Agreement does not grant you any rights to patents, copyrights, trade secrets, trademarks, or any other rights in respect to the Software.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                4. Data Privacy and Security
              </h3>
              <p style={{ marginBottom: '16px' }}>
                Your use of the Software is subject to our Privacy Policy. We collect and process data in accordance with applicable data protection laws. You are responsible for maintaining the confidentiality of your account credentials.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                5. Termination
              </h3>
              <p style={{ marginBottom: '16px' }}>
                This Agreement is effective until terminated. Your rights under this Agreement will terminate automatically without notice if you fail to comply with any term hereof. Upon termination, you must cease all use of the Software and destroy all copies.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                6. Warranty Disclaimer
              </h3>
              <p style={{ marginBottom: '16px' }}>
                THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                7. Limitation of Liability
              </h3>
              <p style={{ marginBottom: '16px' }}>
                IN NO EVENT SHALL HUBBLEHOX TECHNOLOGIES PRIVATE LIMITED BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF OR IN CONNECTION WITH THE USE OF THE SOFTWARE.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                8. Governing Law
              </h3>
              <p style={{ marginBottom: '16px' }}>
                This Agreement shall be governed by and construed in accordance with the laws of India. Any disputes arising from this Agreement shall be subject to the exclusive jurisdiction of the courts in Mumbai, India.
              </p>
            </>
          ) : (
            <>
              <p style={{ marginBottom: '16px' }}>
                हा अंतिम-वापरकर्ता परवाना करार ("करार") परवानाधारक (नंतर परिभाषित) या कराराच्या अटी आणि शर्तींशी सहमत झाल्यानंतरच्या तारखेला केला जातो:
              </p>
              <p style={{ marginBottom: '16px' }}>
                <strong>हबलहॉक्स टेक्नॉलॉजीज प्रायव्हेट लिमिटेड</strong>, भारताच्या कायद्यांतर्गत स्थापन झालेली कंपनी, तिचे नोंदणीकृत कार्यालय युनिट ८०१, ८वा मजला, इंटरफेस ११, ऑफ. लिंक रोड, मलाड वेस्ट, मुंबई-४०००६४ येथे आहे (यापुढे "हबलहॉक्स" / "कंपनी" म्हणून संदर्भित, जी अभिव्यक्ती, संदर्भानुसार विरोधाभासी नसल्यास, तिच्या सहयोगी संस्था, उत्तराधिकारी आणि परवानगी असलेल्या नियुक्त्यांचा समावेश आहे असे समजले जाईल).
              </p>
              <div style={{
                padding: '16px',
                backgroundColor: '#fef9e7',
                border: '1px solid #f9e79f',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <p style={{ margin: '0', fontWeight: '600' }}>
                  सॉफ्टवेअरसाठी ऑर्डर देऊन किंवा ते डाउनलोड आणि इंस्टॉल करून किंवा कोणत्याही स्वरूपात हा करार स्वीकारून, किंवा सॉफ्टवेअर वापरून, तुम्ही (व्यक्ती असो किंवा संस्था) या करारात वर्णन केलेल्या अटींना कायदेशीररित्या बांधील राहण्यास मान्यता देता. जर तुम्ही कायदेशीर संस्थेच्या वतीने हा करार स्वीकारत असाल, तर तुम्ही पुष्टी करता की तुमच्याकडे त्या संस्थेला या अटींनी बांधण्याचा अधिकार आहे.
                </p>
              </div>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                १. परवाना प्रदान
              </h3>
              <p style={{ marginBottom: '16px' }}>
                या कराराच्या अटी आणि शर्तींच्या अधीन राहून, कंपनी तुम्हाला सॉफ्टवेअर केवळ तुमच्या अंतर्गत व्यवसाय हेतूंसाठी इंस्टॉल आणि वापरण्यासाठी मर्यादित, गैर-अनन्य, हस्तांतरण न करता येणारा, रद्द करण्यायोग्य परवाना देते.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                २. निर्बंध
              </h3>
              <p style={{ marginBottom: '16px' }}>
                तुम्ही खालील गोष्टी करू शकत नाही: (अ) सॉफ्टवेअरमध्ये बदल, रिव्हर्स इंजिनियर, डिकंपाइल किंवा डिसअसेंबल करणे; (ब) सॉफ्टवेअरमधून कोणत्याही मालकीच्या सूचना काढणे; (क) कोणत्याही बेकायदेशीर हेतूसाठी सॉफ्टवेअर वापरणे; (ड) सॉफ्टवेअरचे वितरण, उपपरवाना किंवा कोणत्याही तृतीय पक्षाकडे हस्तांतरण करणे.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                ३. बौद्धिक संपत्ती
              </h3>
              <p style={{ marginBottom: '16px' }}>
                सॉफ्टवेअरमधील आणि त्याशी संबंधित सर्व बौद्धिक संपत्ती अधिकार हबलहॉक्स टेक्नॉलॉजीज प्रायव्हेट लिमिटेडच्या मालकीचे आहेत. हा करार तुम्हाला सॉफ्टवेअरच्या संदर्भात पेटंट, कॉपीराइट, व्यापार रहस्ये, ट्रेडमार्क किंवा इतर कोणत्याही अधिकारांचे अधिकार देत नाही.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                ४. डेटा गोपनीयता आणि सुरक्षा
              </h3>
              <p style={{ marginBottom: '16px' }}>
                सॉफ्टवेअरचा तुमचा वापर आमच्या गोपनीयता धोरणाच्या अधीन आहे. आम्ही लागू डेटा संरक्षण कायद्यांनुसार डेटा संकलित आणि प्रक्रिया करतो. तुमच्या खात्याच्या प्रमाणपत्रांची गोपनीयता राखण्याची जबाबदारी तुमची आहे.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                ५. समाप्ती
              </h3>
              <p style={{ marginBottom: '16px' }}>
                हा करार समाप्त होईपर्यंत प्रभावी आहे. जर तुम्ही येथील कोणत्याही अटीचे पालन करण्यात अपयशी ठरलात तर या करारांतर्गत तुमचे अधिकार सूचनेशिवाय आपोआप समाप्त होतील. समाप्तीनंतर, तुम्ही सॉफ्टवेअरचा सर्व वापर थांबवला पाहिजे आणि सर्व प्रती नष्ट केल्या पाहिजेत.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                ६. हमी अस्वीकरण
              </h3>
              <p style={{ marginBottom: '16px' }}>
                सॉफ्टवेअर "जसे आहे तसे" कोणत्याही प्रकारच्या हमीशिवाय प्रदान केले जाते, व्यक्त किंवा गर्भित, व्यापारयोग्यता आणि विशिष्ट हेतूसाठी योग्यतेच्या गर्भित हमींसह मर्यादित नाही.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                ७. दायित्व मर्यादा
              </h3>
              <p style={{ marginBottom: '16px' }}>
                कोणत्याही परिस्थितीत हबलहॉक्स टेक्नॉलॉजीज प्रायव्हेट लिमिटेड सॉफ्टवेअरच्या वापराशी संबंधित किंवा त्यातून उद्भवणाऱ्या कोणत्याही अप्रत्यक्ष, आनुषंगिक, विशेष किंवा परिणामी नुकसानीसाठी जबाबदार राहणार नाही.
              </p>
              <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>
                ८. प्रशासकीय कायदा
              </h3>
              <p style={{ marginBottom: '16px' }}>
                हा करार भारताच्या कायद्यांनुसार नियंत्रित आणि अर्थ लावला जाईल. या करारातून उद्भवणारे कोणतेही विवाद मुंबई, भारतातील न्यायालयांच्या अनन्य अधिकारक्षेत्राच्या अधीन असतील.
              </p>
            </>
          )}
        </div>

        {/* Checkbox */}
        <div style={{
          padding: '24px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#374151'
          }}>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer'
              }}
            />
            <span>
              {getText('I have read and agree to the Terms and Conditions', 'मी अटी आणि शर्ती वाचल्या आहेत आणि त्यांना सहमत आहे', 'मी अटी आणि शर्ती वाचल्या आहेत आणि त्यांना सहमत आहे')}
            </span>
          </label>
        </div>

        {/* Accept Button */}
        <div style={{
          padding: '0 24px 24px 24px',
          textAlign: 'right'
        }}>
          <button
            onClick={handleAccept}
            disabled={!isChecked}
            style={{
              backgroundColor: isChecked ? '#f97316' : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 32px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isChecked ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease-in-out',
              opacity: isChecked ? 1 : 0.6
            }}
            onMouseOver={(e) => {
              if (isChecked) {
                e.currentTarget.style.backgroundColor = '#ea580c';
              }
            }}
            onMouseOut={(e) => {
              if (isChecked) {
                e.currentTarget.style.backgroundColor = '#f97316';
              }
            }}
          >
            {getText('I Accept', 'मी स्वीकारतो', 'मी स्वीकारतो')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EULA;
