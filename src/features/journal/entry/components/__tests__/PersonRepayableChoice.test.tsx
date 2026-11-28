import { fireEvent, render } from '@/src/testing/render';
import { PersonRepayableChoice } from '../PersonRepayableChoice';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => true,
}));

describe('PersonRepayableChoice', () => {
  it('shows a direction-aware question and hint', () => {
    const { getByText } = render(
      <PersonRepayableChoice flow="outflow" personName="Ari" repayable onChange={() => {}} />,
    );
    expect(getByText('Should Ari pay you back?')).toBeTruthy();
    expect(getByText('Tracks an IOU so Ari can pay you back later')).toBeTruthy();
  });
  it('notifies when selection changes', () => {
    const onChange = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <PersonRepayableChoice flow="inflow" personName="Ari" repayable onChange={onChange} />,
    );
    fireEvent(getByTestId('person-repayable-toggle'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 40 } },
    });
    fireEvent.press(getByLabelText('No'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
