import { extractDispositiveFromText, classifyOutcome } from '../dispositive';

describe('extractDispositiveFromText', () => {
  it('extracts from the earliest dispositive marker', () => {
    const text = 'ВСТАНОВИВ: факти ... ПОСТАНОВИВ: у задоволенні позову відмовити.';
    const r = extractDispositiveFromText(text);
    expect(r.is_fallback).toBe(false);
    expect(r.marker).toBe('ПОСТАНОВИВ:');
    expect(r.dispositive.startsWith('ПОСТАНОВИВ:')).toBe(true);
  });

  it('falls back to the document tail when no marker is present', () => {
    const text = 'a'.repeat(5000) + 'КІНЕЦЬ';
    const r = extractDispositiveFromText(text, 8000, 100);
    expect(r.is_fallback).toBe(true);
    expect(r.marker).toBeNull();
    expect(r.dispositive.length).toBe(100);
    expect(r.dispositive.endsWith('КІНЕЦЬ')).toBe(true);
  });

  it('returns empty on empty input', () => {
    expect(extractDispositiveFromText('').dispositive).toBe('');
  });
});

describe('classifyOutcome', () => {
  it('detects denial', () => {
    expect(classifyOutcome('ПОСТАНОВИВ: у задоволенні позову відмовити.')).toBe('denied');
    expect(classifyOutcome('касаційну скаргу залишити без задоволення')).toBe('denied');
  });

  it('detects grant', () => {
    expect(classifyOutcome('ВИРІШИВ: позов задовольнити.')).toBe('granted');
  });

  it('detects partial grant before plain grant', () => {
    expect(classifyOutcome('позовні вимоги задовольнити частково')).toBe('partial');
  });

  it('detects remand', () => {
    expect(classifyOutcome('скасувати, справу передати на новий касаційний розгляд')).toBe('remanded');
  });

  it('detects procedural disposal', () => {
    expect(classifyOutcome('справу повернути відповідній колегії суддів для розгляду')).toBe('procedural');
  });

  it('returns unknown when nothing matches', () => {
    expect(classifyOutcome('довільний текст без резолюції')).toBe('unknown');
    expect(classifyOutcome('')).toBe('unknown');
  });
});
