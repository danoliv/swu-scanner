import { describe, expect, it } from 'vitest';
import { fillSubtitles, type OfficialCard } from './official-titles.ts';
import type { RawPrinting } from './catalog.ts';

const raw = (over: Partial<RawPrinting>): RawPrinting => ({
  Set: 'SEC',
  Number: '10',
  Name: 'Watto',
  Type: 'Unit',
  VariantType: 'Normal',
  ...over,
});
const off = (over: Partial<OfficialCard>): OfficialCard => ({
  set: 'SEC',
  number: 10,
  title: 'Watto',
  subtitle: 'No Money, No Parts, No Deal',
  ...over,
});

describe('fillSubtitles', () => {
  it('aggiunge il sottotitolo ufficiale a una stampa senza sottotitolo', () => {
    const [r] = fillSubtitles([raw({})], [off({})]);
    expect(r?.Subtitle).toBe('No Money, No Parts, No Deal');
  });
  it('non tocca una stampa che ha già un sottotitolo', () => {
    const [r] = fillSubtitles([raw({ Subtitle: 'Altro' })], [off({})]);
    expect(r?.Subtitle).toBe('Altro');
  });
  it('non usa una carta ufficiale con titolo diverso (stesso set e numero)', () => {
    const [r] = fillSubtitles([raw({})], [off({ title: 'Qualcun Altro' })]);
    expect(r?.Subtitle).toBeUndefined();
  });
  it('ignora i confronti di titolo per maiuscole e accenti', () => {
    const [r] = fillSubtitles([raw({ Name: 'WATTO' })], [off({})]);
    expect(r?.Subtitle).toBe('No Money, No Parts, No Deal');
  });
  it('non fa nulla senza una carta ufficiale corrispondente', () => {
    const [r] = fillSubtitles([raw({ Number: '99' })], [off({})]);
    expect(r?.Subtitle).toBeUndefined();
  });
  it('gestisce numeri con zeri iniziali e numeri non numerici', () => {
    expect(fillSubtitles([raw({ Number: '010' })], [off({})])[0]?.Subtitle).toBe(
      'No Money, No Parts, No Deal',
    );
    expect(fillSubtitles([raw({ Number: 'A1' })], [off({})])[0]?.Subtitle).toBeUndefined();
  });
  it('unisce i set promo con il nome canonico', () => {
    const [r] = fillSubtitles([raw({ Set: 'SECOP' })], [off({ set: 'SECP' })]);
    expect(r?.Subtitle).toBe('No Money, No Parts, No Deal');
  });
  it('ignora sottotitoli ufficiali vuoti o nulli', () => {
    const [r] = fillSubtitles([raw({})], [off({ subtitle: null })]);
    expect(r?.Subtitle).toBeUndefined();
  });
});
