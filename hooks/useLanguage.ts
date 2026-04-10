"use client";

import { useEffect, useState, useCallback } from "react";
import { detectBrowserLanguage } from "@/lib/i18n";
import { t as translate } from "@/lib/i18n";
import type { Language } from "@/types";

const STORAGE_KEY = "guru-language";

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>("en");
  const [ready, setReady] = useState(false);

  // On mount: read from localStorage or detect from browser
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && ["en", "es", "fr", "de", "pt"].includes(stored)) {
      setLanguageState(stored);
    } else {
      const detected = detectBrowserLanguage();
      setLanguageState(detected);
      localStorage.setItem(STORAGE_KEY, detected);
    }
    setReady(true);
  }, []);

  // Sync from profile when user logs in (call this after fetching profile)
  const syncFromProfile = useCallback((profileLang: Language | null) => {
    if (profileLang && ["en", "es", "fr", "de", "pt"].includes(profileLang)) {
      setLanguageState(profileLang);
      localStorage.setItem(STORAGE_KEY, profileLang);
    }
  }, []);

  // Change language (saves to localStorage + optionally to profile)
  const setLanguage = useCallback(async (lang: Language, saveToProfile = true) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);

    if (saveToProfile) {
      try {
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferred_language: lang }),
        });
      } catch {
        // ignore — still saved locally
      }
    }
  }, []);

  // Translation helper bound to current language
  const t = useCallback(
    (key: string) => translate(key, language),
    [language]
  );

  return { language, setLanguage, syncFromProfile, t, ready };
}
