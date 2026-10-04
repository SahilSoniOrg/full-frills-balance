import { StyleSheet } from 'react-native';
import { render } from '@/src/utils/test-utils';
import { FormHeroSection } from '../FormHeroSection';

describe('FormHeroSection compatibility', () => {
  it('preserves the legacy nameAlign setting through UnderlineNameField', () => {
    const screen = render(
      <FormHeroSection
        nameValue="Rent"
        onNameChange={() => {}}
        nameAlign="center"
        showAmount={false}
      />,
    );
    expect(StyleSheet.flatten(screen.getByTestId('hero-name-input').props.style).textAlign).toBe(
      'center',
    );

    screen.rerender(
      <FormHeroSection
        nameValue="Rent"
        onNameChange={() => {}}
        nameAlign="left"
        showAmount={false}
      />,
    );
    expect(StyleSheet.flatten(screen.getByTestId('hero-name-input').props.style).textAlign).toBe(
      'left',
    );
  });
});
