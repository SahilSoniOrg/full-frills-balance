import { Theme } from '@/src/constants/design-tokens';
import { PetEvolution, PetMood } from '@/src/services/FinancialPetService';

export const EVOLUTION_ICONS: Record<PetEvolution, string> = {
  [PetEvolution.Egg]: '🥚',
  [PetEvolution.Baby]: '🐣',
  [PetEvolution.Companion]: '🐱',
  [PetEvolution.Sage]: '🦉',
};

export const MOOD_EMOJIS: Record<PetMood, string> = {
  [PetMood.Ecstatic]: '🤩',
  [PetMood.Happy]: '😊',
  [PetMood.Hungry]: '😋',
  [PetMood.Asleep]: '😴',
};

export function getPetHealthColor(health: number, theme: Theme): string {
  if (health >= 75) return theme.success;
  if (health >= 40) return theme.warning;
  return theme.error;
}
