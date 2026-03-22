import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import commsEn from '../public/locales/en/comms.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { comms: commsEn }
    },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'comms',
    ns: ['comms'],
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
