import { getLocales, type Locale } from 'expo-localization';
import en from '../../locale/en.json';
import ru from '../../locale/ru.json';

export type SupportedLanguage = 'en' | 'ru';

const supportedLocales: SupportedLanguage[] = ['en', 'ru'];

export const getLocale = (): SupportedLanguage => {
  const locale = getLocales()[0].languageCode?.toLowerCase() || 'en';
  if (supportedLocales.includes(locale as SupportedLanguage)) {
    return locale as SupportedLanguage;
  }
  return 'en';
};

export const getExpoLocale = (): Locale => {
  return getLocales()[0];
};

let currentLanguage: SupportedLanguage = getLocale();

const texts: Record<SupportedLanguage, Record<string, string>> = {
  en,
  ru,
};

export function t(key: string, params?: Record<string, string>): string {
  let text = texts[currentLanguage]?.[key] ?? texts.en[key] ?? `<-${key}->`;
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replace(`{${paramKey}}`, value);
    });
  }
  return text;
}
