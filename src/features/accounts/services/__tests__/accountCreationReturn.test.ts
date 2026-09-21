import { asAccountId } from '@/src/types/ids';
import {
  discardAccountCreationReturn,
  registerAccountCreationReturn,
  resolveAccountCreationReturn,
} from '@/src/utils/accountCreationReturn';

describe('accountCreationReturn', () => {
  it('resolves a return callback once with the created account', () => {
    const onCreated = jest.fn();
    const token = registerAccountCreationReturn(onCreated);

    resolveAccountCreationReturn(token, asAccountId('new-account'));
    resolveAccountCreationReturn(token, asAccountId('other-account'));

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith('new-account');
  });

  it('discards a return callback when account creation is cancelled', () => {
    const onCreated = jest.fn();
    const token = registerAccountCreationReturn(onCreated);

    discardAccountCreationReturn(token);
    resolveAccountCreationReturn(token, asAccountId('new-account'));

    expect(onCreated).not.toHaveBeenCalled();
  });
});
