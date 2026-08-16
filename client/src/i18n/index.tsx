/**
 * Minimal dependency-free i18n for the dashboard. Persian is the source of
 * truth for the dictionary shape; English and German must stay structurally
 * identical (enforced by the Record type below).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fa } from "./fa";
import { en } from "./en";
import { de } from "./de";

export type LanguageCode = "fa" | "en" | "de";

export const LANGUAGES: Array<{ code: LanguageCode; label: string; dir: "rtl" | "ltr"; locale: string }> = [
  { code: "fa", label: "فارسی", dir: "rtl", locale: "fa-IR" },
  { code: "en", label: "English", dir: "ltr", locale: "en-US" },
  { code: "de", label: "Deutsch", dir: "ltr", locale: "de-DE" },
];

export type Dictionary = typeof fa;

const dictionaries: Record<LanguageCode, Dictionary> = { fa, en, de };

const STORAGE_KEY = "publisher-ui-language";

export function isLanguageCode(value: string): value is LanguageCode {
  return value === "fa" || value === "en" || value === "de";
}

type I18nContextValue = {
  lang: LanguageCode;
  dir: "rtl" | "ltr";
  locale: string;
  setLang: (lang: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function resolve(path: string, dictionary: Dictionary): string {
  let node: unknown = dictionary;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof node === "string" ? node : path;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isLanguageCode(stored) ? stored : "fa";
  });

  const meta = LANGUAGES.find(language => language.code === lang)!;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.dir;
  }, [lang, meta.dir]);

  const setLang = useCallback((next: LanguageCode) => setLangState(next), []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = resolve(key, dictionaries[lang]);
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [lang]
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, dir: meta.dir, locale: meta.locale, setLang, t }), [lang, meta.dir, meta.locale, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>");
  return context;
}
