import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ru from "./ru.json";

export const LOCALE_STORAGE_KEY = "locale";
export type AppLocale = "en" | "ru";

function detectLanguage(): AppLocale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "en" || stored === "ru") return stored;
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("ru")) return "ru";
  return "ru";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLocale(locale: AppLocale) {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  void i18n.changeLanguage(locale);
}

export function formatLocale(): string {
  return i18n.language === "ru" ? "ru-RU" : "en-US";
}

export default i18n;
