import { asAccountId } from '@/src/types/ids';
import { createAccountTreeSnapshot } from '../accountTree';
import {
  createAccountTreeDraft,
  discardAccountTreeDraft,
  stageAccountTreeDraftDrop,
} from '../accountTreeDraft';
import { getAccountTreeSiblingMoveTargets } from '../accountTreeTargets';

const id = asAccountId;
const accounts = [
  { id: id('first'), accountType: 'ASSET', orderNum: 0 },
  { id: id('group'), accountType: 'ASSET', orderNum: 1 },
  { id: id('child'), accountType: 'ASSET', orderNum: 0, parentAccountId: id('group') },
  { id: id('second-child'), accountType: 'ASSET', orderNum: 1, parentAccountId: id('group') },
  { id: id('last'), accountType: 'ASSET', orderNum: 2 },
  { id: id('liability'), accountType: 'LIABILITY', orderNum: 0 },
];

it('disables moves at sibling boundaries and never crosses account types or parents', () => {
  const moves = getAccountTreeSiblingMoveTargets(createAccountTreeSnapshot(accounts));
  expect(moves.get(id('first'))?.up).toBeNull();
  expect(moves.get(id('last'))?.down).toBeNull();
  expect(moves.get(id('liability'))).toEqual({ up: null, down: null });
  expect(moves.get(id('child'))?.up).toBeNull();
  expect(moves.get(id('child'))?.down?.parentId).toBe(id('group'));
});

it('moves a whole group in the draft and preserves its descendants and discard behavior', () => {
  const draft = createAccountTreeDraft(accounts);
  const move = getAccountTreeSiblingMoveTargets(createAccountTreeSnapshot(accounts)).get(
    id('group'),
  )?.up;
  if (!move) throw new Error('Expected an upward move');
  const next = stageAccountTreeDraftDrop(draft, move);
  const snapshot = createAccountTreeSnapshot(next.accounts);
  expect(snapshot.getChildren(null, 'ASSET').map(account => account.id)).toEqual([
    id('group'),
    id('first'),
    id('last'),
  ]);
  expect(snapshot.getChildren(id('group')).map(account => account.id)).toEqual([
    id('child'),
    id('second-child'),
  ]);
  expect(next.operations).toEqual([{ accountId: id('group'), affectedDescendantCount: 2 }]);
  expect(discardAccountTreeDraft(next).accounts).toEqual(accounts);
});

it('moves a child down by one sibling without reparenting it', () => {
  const move = getAccountTreeSiblingMoveTargets(createAccountTreeSnapshot(accounts)).get(
    id('child'),
  )?.down;
  if (!move) throw new Error('Expected a downward move');
  const next = stageAccountTreeDraftDrop(createAccountTreeDraft(accounts), move);
  expect(
    createAccountTreeSnapshot(next.accounts)
      .getChildren(id('group'))
      .map(account => account.id),
  ).toEqual([id('second-child'), id('child')]);
});
