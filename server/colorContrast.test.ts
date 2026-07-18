import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../client/src/lib/colorContrast';

describe('main page colour contrast', () => {
  it('records that the requested light teal needs a darker pairing on light backgrounds', () => {
    expect(contrastRatio('#8dced3', '#ffffff')).toBeLessThan(3);
    expect(contrastRatio('#8dced3', '#ffffff')).toBeLessThan(4.5);
  });

  it('requires the selected darker teal for title text to meet AA contrast on white', () => {
    expect(contrastRatio('#216c72', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('requires the mic icon and button edge to remain distinct from the light teal control', () => {
    expect(contrastRatio('#143f43', '#8dced3')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#216c72', '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});
