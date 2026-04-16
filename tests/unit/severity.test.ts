import { describe, it, expect } from 'vitest';
import { classifyCharge, classifyWorst, Severity } from '@lib/severity';

describe('classifyCharge', () => {
  it('classifies murder as violent felony', () => {
    expect(classifyCharge('Murder')).toBe('violent_felony');
    expect(classifyCharge('MURDER 1ST DEGREE')).toBe('violent_felony');
  });

  it('classifies assault as violent felony', () => {
    expect(classifyCharge('Aggravated Assault')).toBe('violent_felony');
    expect(classifyCharge('Battery - Family Violence')).toBe('violent_felony');
  });

  it('classifies drug trafficking as felony', () => {
    expect(classifyCharge('Possession of Methamphetamine')).toBe('felony');
    expect(classifyCharge('Trafficking Cocaine')).toBe('felony');
  });

  it('classifies DUI as serious misdemeanor', () => {
    expect(classifyCharge('Driving Under the Influence')).toBe('serious_misdemeanor');
    expect(classifyCharge('DUI - Alcohol')).toBe('serious_misdemeanor');
  });

  it('classifies basic traffic as misdemeanor', () => {
    expect(classifyCharge('Speeding')).toBe('misdemeanor');
    expect(classifyCharge('Failure to Maintain Lane')).toBe('misdemeanor');
  });

  it('defaults unknown to misdemeanor', () => {
    expect(classifyCharge('Unknown Charge XYZ')).toBe('misdemeanor');
  });
});

describe('classifyWorst', () => {
  it('returns highest severity from a list', () => {
    const worst = classifyWorst(['Speeding', 'Murder', 'DUI']);
    expect(worst).toBe<Severity>('violent_felony');
  });

  it('returns misdemeanor for empty', () => {
    expect(classifyWorst([])).toBe<Severity>('misdemeanor');
  });
});
