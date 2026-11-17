import { Box } from '@/src/design-system/Box';
import { render, screen } from '@/src/testing/render';

describe('Box', () => {
  it('supports the padding props used by the removed Inset wrapper', () => {
    render(
      <Box testID="padded-box" paddingHorizontal="md" paddingVertical="sm">
        child
      </Box>,
    );

    expect(screen.getByTestId('padded-box').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          paddingHorizontal: expect.any(Number),
          paddingVertical: expect.any(Number),
        }),
      ]),
    );
  });
});
