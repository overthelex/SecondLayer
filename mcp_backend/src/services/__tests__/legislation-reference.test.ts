import { parseLegislationReference } from '../legislation-service';

describe('parseLegislationReference', () => {
  it('parses "ст. 625 ЦК"', () => {
    expect(parseLegislationReference('ст. 625 ЦК')).toEqual({
      radaId: '435-15',
      articleNumber: '625',
    });
  });

  it('parses "ст. 44 ПКУ"', () => {
    expect(parseLegislationReference('ст. 44 ПКУ')).toEqual({
      radaId: '2755-17',
      articleNumber: '44',
    });
  });

  it('parses "ГПК ст. 123"', () => {
    expect(parseLegislationReference('ГПК ст. 123')).toEqual({
      radaId: '1798-12',
      articleNumber: '123',
    });
  });

  it('parses explicit rada_id reference', () => {
    expect(parseLegislationReference('1618-15 ст. 354')).toEqual({
      radaId: '1618-15',
      articleNumber: '354',
    });
  });

  it('returns null when cannot parse', () => {
    expect(parseLegislationReference('hello world')).toBeNull();
  });

  it('parses "постанова КМУ №1388 пункт 6"', () => {
    const result = parseLegislationReference('постанова КМУ №1388 пункт 6');
    expect(result).toEqual({
      radaId: 'KMU:1388',
      articleNumber: '6',
    });
  });

  it('parses "ПКМУ 704 п. 3"', () => {
    const result = parseLegislationReference('ПКМУ 704 п. 3');
    expect(result).toEqual({
      radaId: 'KMU:704',
      articleNumber: '3',
    });
  });

  it('parses "постанова Кабінету Міністрів №1388"', () => {
    const result = parseLegislationReference('постанова Кабінету Міністрів №1388');
    expect(result).toEqual({
      radaId: 'KMU:1388',
      articleNumber: '',
    });
  });

  it('parses "постанова КМУ №1388 від 1998" with explicit year', () => {
    const result = parseLegislationReference('постанова КМУ №1388 від 07.11.1998 пункт 6');
    expect(result).toEqual({
      radaId: '1388-98-п',
      articleNumber: '6',
    });
  });
});
