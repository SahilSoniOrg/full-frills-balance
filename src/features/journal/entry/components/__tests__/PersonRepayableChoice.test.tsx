import { fireEvent, render } from '@/src/testing/render';
import { PersonRepayableChoice } from '../PersonRepayableChoice';

describe('PersonRepayableChoice', () => {
  it('shows a direction-aware question and hint', () => {
    const { getByText } = render(
      <PersonRepayableChoice flow="outflow" personName="Ari" repayable onChange={() => {}} />,
    );
    expect(getByText('Should Ari pay you back?')).toBeTruthy();
    expect(getByText('Tracks an open receivable for Ari')).toBeTruthy();
  });
  it('notifies when selection changes', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <PersonRepayableChoice flow="inflow" personName="Ari" repayable onChange={onChange} />,
    );
    fireEvent.press(getByLabelText('No'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
