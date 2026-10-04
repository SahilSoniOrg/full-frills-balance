import { Inline, Stack } from '@/src/design-system';
import { render, screen } from '@/src/utils/test-utils';

describe('Stack', () => {
  it('supports column and row directions through the shared implementation', () => {
    render(
      <>
        <Stack testID="column-stack">column</Stack>
        <Inline testID="row-stack">row</Inline>
      </>,
    );

    expect(screen.getByTestId('column-stack').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]),
    );
    expect(screen.getByTestId('row-stack').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexDirection: 'row' })]),
    );
  });

  it('preserves boolean wrap semantics from Inline', () => {
    render(
      <Inline testID="wrapped-inline" wrap>
        wrapped
      </Inline>,
    );

    expect(screen.getByTestId('wrapped-inline').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexWrap: 'wrap' })]),
    );
  });
});
