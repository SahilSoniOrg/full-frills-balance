import { PetService } from '../PetService';

describe('PetService', () => {
  it('should return health 100 and ecstatic mood when no pending inbox records and zero/positive margin', () => {
    const payload = PetService.calculatePetPayload(0, 0, 30);
    expect(payload.petHealth).toBe(100);
    expect(payload.petMood).toBe('ecstatic');
    expect(payload.unreviewedCount).toBe(0);
    expect(payload.safeToSpendRunwayDays).toBe(30);
  });

  it('should penalize health for pending inbox records (audit deficit)', () => {
    const payload = PetService.calculatePetPayload(3, 0); // 3 * 10 = 30 penalty -> 70 health
    expect(payload.petHealth).toBe(70);
    expect(payload.petMood).toBe('happy');
    expect(payload.unreviewedCount).toBe(3);
  });

  it('should set mood to hungry when health is between 26 and 50', () => {
    const payload = PetService.calculatePetPayload(6, 0); // 6 * 10 = 60 penalty -> 40 health
    expect(payload.petHealth).toBe(40);
    expect(payload.petMood).toBe('hungry');
  });

  it('should set mood to asleep when health is 25 or below', () => {
    const payload = PetService.calculatePetPayload(8, 0); // 8 * 10 = 80 penalty -> 20 health
    expect(payload.petHealth).toBe(20);
    expect(payload.petMood).toBe('asleep');
  });

  it('should penalize health when safe to spend has a shortfall (negative margin)', () => {
    const payload = PetService.calculatePetPayload(0, -300); // 100 - 3 = 97
    expect(payload.petHealth).toBe(97);

    const payloadSevere = PetService.calculatePetPayload(5, -5000); // base 20 - 50 = 0
    expect(payloadSevere.petHealth).toBe(0);
    expect(payloadSevere.petMood).toBe('asleep');
  });
});
