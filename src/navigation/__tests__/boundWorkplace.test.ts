import { WORKPLACE_MISMATCH_MESSAGE, assertBoundWorkplace } from '@/src/navigation/boundWorkplace';
import { asWorkplaceId } from '@/src/types/ids';

describe('assertBoundWorkplace', () => {
  it('allows matching launch and active workplaces', () => {
    expect(() => assertBoundWorkplace(asWorkplaceId('home'), asWorkplaceId('home'))).not.toThrow();
  });

  it('refuses writes when the active workplace diverged from launch', () => {
    expect(() => assertBoundWorkplace(asWorkplaceId('home'), asWorkplaceId('other'))).toThrow(
      WORKPLACE_MISMATCH_MESSAGE,
    );
  });
});
