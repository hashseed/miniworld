// Runtime localisation: the active language, its messages and formatting.
// Switching language changes every string without a reload (spec milestone 1,
// section 8.4).

import en from '../../messages/en.json';
import de from '../../messages/de.json';
import { Store } from '../core/store.ts';
import { formatMessage, type Language, type Messages, type Params } from './messages.ts';
import { numberFormat } from './intl.ts';

const MESSAGES: Record<Language, Messages> = { en, de };

export type MessageKey = keyof typeof en;

export class I18n extends Store<Language> {
  get language(): Language {
    return this.value;
  }

  t(key: MessageKey, params: Params = {}): string {
    const template = MESSAGES[this.value][key] ?? MESSAGES.en[key] ?? key;
    return formatMessage(template, params, this.value);
  }

  number(n: number, options?: Intl.NumberFormatOptions): string {
    return numberFormat(this.value, options).format(n);
  }
}

/** Native names of the languages, always written in their own language. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', de: 'Deutsch' };
