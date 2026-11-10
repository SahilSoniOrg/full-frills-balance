/** Database-free identity rules shared by capture and planned-payment writers. */
export const MOVEMENT_MATCH_WINDOWS = {
  strictDays: 1,
  softDays: 4,
  softAmountRatio: 0.05,
} as const;
const DAY = 86_400_000;

export type MovementChannel = 'sms' | 'email' | 'voice';
export interface MovementObservation {
  id: string;
  channel: MovementChannel;
  amount: number;
  currency: string;
  accountId: string;
  direction: 'debit' | 'credit' | 'unknown';
  date: number;
  reference?: string | null;
  economicKind?: string | null;
  visibleAccountId?: string;
}
export interface MovementOccurrence {
  id: string;
  planId: string;
  status: 'active' | 'paused' | 'completed';
  date: number;
  intervalDays: number;
  amount: number;
  currency: string;
  accountId: string;
  direction: 'debit' | 'credit';
  fxMode?: string | null;
  skipped?: boolean;
  claimed?: boolean;
  structure?: string | null;
  visibleAmount?: number;
  toAccountId?: string | null;
}
export interface ExistingMovement {
  id: string;
  date: number;
  amount: number;
  currency: string;
  accountId: string;
  direction: MovementObservation['direction'];
  reference?: string | null;
  channel?: MovementChannel;
  linked?: boolean;
  planLinked?: boolean;
  status?: 'planned' | 'posted';
  structure?: string | null;
  /** Occurrence day claimed by this journal (`ORIGINAL_PLANNED_DATE`); falls back to `date`. */
  originalPlannedDate?: number;
}
export interface MovementMatchFacts {
  observation: MovementObservation;
  occurrences: MovementOccurrence[];
  pendingObservations: MovementObservation[];
  captureJournals: ExistingMovement[];
  journals: ExistingMovement[];
  today: number;
}
export type MovementMatchResult =
  | { kind: 'hard'; candidates: ExistingMovement[] }
  | { kind: 'strictUnique'; occurrence: MovementOccurrence; silentAttach: boolean }
  | { kind: 'reviewSameChannel'; candidates: MovementOccurrence[] }
  | { kind: 'soft' | 'conflict' | 'ambiguous'; candidates: MovementOccurrence[] }
  | { kind: 'none' };

function dayDistance(a: number, b: number): number {
  const localDay = (value: number) => {
    const d = new Date(value);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.abs(Math.round((localDay(a) - localDay(b)) / DAY));
}
function windowDays(interval: number, requested: number): number {
  return Math.min(requested, Math.max(0, Math.ceil(interval / 2) - 1));
}
function refConflict(obs: MovementObservation, journal: ExistingMovement): boolean {
  const normalize = (value?: string | null) => value?.trim().replace(/\s+/g, '').toLowerCase();
  return (
    !!normalize(obs.reference) &&
    !!normalize(journal.reference) &&
    normalize(obs.reference) !== normalize(journal.reference) &&
    obs.accountId === journal.accountId
  );
}
function sameMovement(
  obs: MovementObservation,
  item: ExistingMovement | MovementOccurrence,
  amount: number,
): boolean {
  return (
    item.currency === obs.currency &&
    item.accountId === (obs.visibleAccountId ?? obs.accountId) &&
    ('direction' in item ? item.direction === obs.direction : true) &&
    amount === obs.amount
  );
}

export function matchSharedMovement(facts: MovementMatchFacts): MovementMatchResult {
  const { observation: obs } = facts;
  const normalize = (value?: string | null) => value?.trim().replace(/\s+/g, '').toLowerCase();
  const refs = facts.journals.filter(
    j =>
      j.status === 'posted' &&
      normalize(obs.reference) &&
      normalize(j.reference) === normalize(obs.reference) &&
      sameMovement(obs, j, j.amount) &&
      !refConflict(obs, j),
  );
  if (refs.length === 1) return { kind: 'hard', candidates: refs };

  const eligible = facts.occurrences.filter(
    o =>
      o.status === 'active' &&
      !o.skipped &&
      !o.claimed &&
      o.date <= facts.today + windowDays(o.intervalDays, MOVEMENT_MATCH_WINDOWS.softDays) * DAY,
  );
  const strict: MovementOccurrence[] = [];
  const soft: MovementOccurrence[] = [];
  const conflict: MovementOccurrence[] = [];
  const fx: MovementOccurrence[] = [];
  for (const o of eligible) {
    const related = facts.journals.filter(j => j.planLinked && j.id === o.id);
    if (related.some(j => refConflict(obs, j))) continue;
    const amount = o.visibleAmount ?? o.amount;
    const account = obs.visibleAccountId ?? obs.accountId;
    if (
      (o.accountId !== account && o.toAccountId !== account) ||
      o.currency !== obs.currency ||
      (o.direction !== obs.direction && obs.direction !== 'unknown')
    )
      continue;
    const dayDelta = dayDistance(obs.date, o.date);
    const softLimit = windowDays(o.intervalDays, MOVEMENT_MATCH_WINDOWS.softDays);
    if (dayDelta > softLimit) continue;
    // FX plans never settle unattended; only route a real account/date match to review.
    if (o.fxMode) {
      fx.push(o);
      continue;
    }
    const limit = windowDays(o.intervalDays, MOVEMENT_MATCH_WINDOWS.strictDays);
    if (o.structure && obs.economicKind && o.structure !== obs.economicKind) {
      conflict.push(o);
      continue;
    }
    const dateStrict = dayDelta <= limit;
    const amountStrict = amount === obs.amount;
    if (dateStrict && amountStrict) strict.push(o);
    else if (
      (dayDelta > limit && amountStrict) ||
      (dateStrict &&
        Math.abs(amount - obs.amount) <= amount * MOVEMENT_MATCH_WINDOWS.softAmountRatio)
    )
      soft.push(o);
  }
  if (soft.length || conflict.length || fx.length)
    return {
      kind: conflict.length ? 'conflict' : 'soft',
      candidates: [
        ...new Map([...strict, ...conflict, ...soft, ...fx].map(x => [x.id, x])).values(),
      ],
    };
  if (strict.length !== 1)
    return strict.length ? { kind: 'ambiguous', candidates: strict } : { kind: 'none' };
  const occurrence = strict[0];
  const movementCount =
    facts.pendingObservations.filter(
      p =>
        p.id !== obs.id &&
        p.accountId === (obs.visibleAccountId ?? obs.accountId) &&
        p.currency === obs.currency &&
        p.direction === obs.direction &&
        p.amount === (occurrence.visibleAmount ?? occurrence.amount) &&
        dayDistance(p.date, occurrence.date) <= windowDays(occurrence.intervalDays, 1),
    ).length +
    facts.captureJournals.filter(
      j =>
        !j.linked &&
        !j.planLinked &&
        !refConflict(obs, j) &&
        sameMovement(obs, j, j.amount) &&
        dayDistance(j.date, occurrence.date) <= windowDays(occurrence.intervalDays, 1),
    ).length;
  if (movementCount) return { kind: 'ambiguous', candidates: [occurrence] };
  const claimDay = (j: ExistingMovement) => j.originalPlannedDate ?? j.date;
  const claiming = facts.journals.find(
    j =>
      j.planLinked &&
      j.status === 'posted' &&
      claimDay(j) === occurrence.date &&
      j.accountId === occurrence.accountId,
  );
  const sameChannel = claiming?.channel === obs.channel;
  if (claiming && sameChannel) return { kind: 'reviewSameChannel', candidates: [occurrence] };
  return { kind: 'strictUnique', occurrence, silentAttach: !!claiming && !sameChannel };
}
