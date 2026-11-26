import { coveredInteractionProps } from '../coveredInteractionProps';

describe('coveredInteractionProps', () => {
  it('disables pointer events and hides descendants from accessibility when covered', () => {
    expect(coveredInteractionProps(true)).toEqual({
      pointerEvents: 'none',
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      'aria-hidden': true,
    });
  });

  it('restores pointer events and accessibility visibility when uncovered', () => {
    expect(coveredInteractionProps(false)).toEqual({
      pointerEvents: 'auto',
      accessibilityElementsHidden: false,
      importantForAccessibility: 'auto',
      'aria-hidden': false,
    });
  });
});
