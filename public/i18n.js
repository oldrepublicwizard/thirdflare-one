let catalog = {};
let locale = "en";

export function getLocale() {
  return locale;
}

export async function loadLocale(code = "en") {
  locale = code || "en";
  try {
    const response = await fetch(`/locales/${locale}.json`);
    if (!response.ok) throw new Error(`locale ${locale} missing`);
    catalog = await response.json();
  } catch {
    if (locale !== "en") {
      return loadLocale("en");
    }
    catalog = {};
  }
  return catalog;
}

/**
 * Translate a dotted key. Optional params replace `{name}` placeholders.
 */
export function t(key, params = {}) {
  const parts = String(key).split(".");
  let value = catalog;
  for (const part of parts) {
    if (value && typeof value === "object" && part in value) {
      value = value[part];
    } else {
      value = null;
      break;
    }
  }
  if (typeof value !== "string") return key;
  return value.replace(/\{(\w+)\}/g, (_, name) => (
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  ));
}

export function tip(key) {
  return t(`tips.${key}`);
}
