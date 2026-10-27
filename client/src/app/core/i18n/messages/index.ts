import { Locale } from '../locale';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { MessageKey, tr } from './tr';

export type { MessageKey };

/** Dil kodundan sözlüğe. I18nService bunun üzerinden çözüyor. */
export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  tr,
  en,
  es,
  de,
  fr,
};
