import { describe, expect, it } from 'vitest';

import { DATA_EXPORT_BASIC_FIELDS, DATA_EXPORT_FIELDS, DATA_EXPORT_PREMIUM_FIELDS } from './index';

describe('default export fields', () => {
  const contactFields = [DATA_EXPORT_FIELDS.EMAIL, DATA_EXPORT_FIELDS.PHONES, DATA_EXPORT_FIELDS.SOCIALS];

  it('includes website contact fields by default', () => {
    expect(DATA_EXPORT_BASIC_FIELDS).toEqual(expect.arrayContaining(contactFields));
  });

  it('does not list contact fields as premium', () => {
    for (const field of contactFields) {
      expect(DATA_EXPORT_PREMIUM_FIELDS).not.toContain(field);
    }
  });

  it('has no duplicate default fields', () => {
    expect(new Set(DATA_EXPORT_BASIC_FIELDS).size).toBe(DATA_EXPORT_BASIC_FIELDS.length);
  });
});
