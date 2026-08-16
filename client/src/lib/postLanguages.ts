/** Client-side mirror of the server's post-language names (for display only). */
export type PostLanguageCode = "fa" | "en" | "de" | "custom";

export function languageName(language: string): string {
  switch (language) {
    case "fa":
      return "فارسی (Persian)";
    case "en":
      return "English";
    case "de":
      return "Deutsch";
    case "custom":
      return "Custom";
    default:
      return language;
  }
}

export const POST_LANGUAGE_OPTIONS: Array<{ value: PostLanguageCode; labelKey: string }> = [
  { value: "fa", labelKey: "settings.langFa" },
  { value: "en", labelKey: "settings.langEn" },
  { value: "de", labelKey: "settings.langDe" },
  { value: "custom", labelKey: "settings.langCustom" },
];
