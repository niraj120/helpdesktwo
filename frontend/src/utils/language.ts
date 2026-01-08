import i18n from '../i18n/index';

/**
 * Get text in the current language
 * @param en English text
 * @param hi Hindi text
 * @param mr Marathi text
 * @returns Text in the current language
 */
export const getText = (en: string, hi: string, mr: string): string => {
  if (i18n.language === 'hi') return hi;
  if (i18n.language === 'mr') return mr;
  return en;
};

/**
 * Check if current language is English
 */
export const isEnglish = (): boolean => i18n.language === 'en';

/**
 * Check if current language is Hindi
 */
export const isHindi = (): boolean => i18n.language === 'hi';

/**
 * Check if current language is Marathi
 */
export const isMarathi = (): boolean => i18n.language === 'mr';
