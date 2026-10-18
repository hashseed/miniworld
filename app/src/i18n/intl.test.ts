import { describe, expect, it } from 'vitest';
import { dateTimeFormat, numberFormat, pluralRules } from './intl.ts';

describe('cached Intl formatters', () => {
  it('makes each formatter once per language and options', () => {
    expect(numberFormat('de')).toBe(numberFormat('de'));
    expect(numberFormat('de')).not.toBe(numberFormat('en'));
    expect(numberFormat('en', { maximumSignificantDigits: 2 })).toBe(
      numberFormat('en', { maximumSignificantDigits: 2 }),
    );
    expect(numberFormat('en', { maximumSignificantDigits: 2 })).not.toBe(numberFormat('en'));
    expect(numberFormat('de').format(12345)).toBe('12.345');
    const opts = { year: 'numeric', timeZone: 'UTC' } as const;
    expect(dateTimeFormat('en-GB', opts)).toBe(dateTimeFormat('en-GB', { ...opts }));
    expect(pluralRules('en').select(1)).toBe('one');
    expect(pluralRules('en')).toBe(pluralRules('en'));
  });
});
