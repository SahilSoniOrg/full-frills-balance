import Account from '@/src/data/models/Account';
import { getStringSimilarity } from '@/src/utils/stringDistance';

export interface FuzzyMatchResult {
  account: Account;
  score: number;
}

export function fuzzyMatch(hint: string, candidates: Account[]): FuzzyMatchResult | null {
  let bestMatch: FuzzyMatchResult | null = null;
  const cleanHint = hint.toLowerCase().trim();
  const hintWords = cleanHint.split(/[\s,._\-\/]+/).filter(w => w.length > 0);

  for (const account of candidates) {
    const cleanName = account.name.toLowerCase().trim();
    const nameWords = cleanName.split(/[\s,._\-\/]+/).filter(w => w.length > 0);

    // 1. Exact match (Ultimate Tier)
    if (cleanName === cleanHint) {
      return { account, score: 1.0 };
    }

    let score = 0;

    // 2. Starts-with match (Very strong for banks like "HDFC...")
    if (cleanName.startsWith(cleanHint) || cleanHint.startsWith(cleanName)) {
      score = 0.95;
    } else {
      // 3. Exact word subset matches
      const isNameSubset = nameWords.length > 0 && nameWords.every(w => hintWords.includes(w));
      const isHintSubset = hintWords.length > 0 && hintWords.every(w => nameWords.includes(w));

      if (isNameSubset || isHintSubset) {
        score = 0.94;
      } else {
        // 4. Word overlap match with sequence bonus
        const matchingWords = nameWords.filter(w => hintWords.includes(w));
        if (matchingWords.length > 0) {
          const overlapRatio = matchingWords.length / Math.max(nameWords.length, hintWords.length);

          // Sequence bonus: Are matching words in the same order?
          let sequenceMatches = 0;
          let lastIdx = -1;
          for (const word of matchingWords) {
            const idx = hintWords.indexOf(word);
            if (idx > lastIdx) {
              sequenceMatches++;
              lastIdx = idx;
            }
          }
          const sequenceRatio = sequenceMatches / matchingWords.length;

          // Combined word score (Base 0.5 + overlap + sequence)
          score = 0.5 + overlapRatio * 0.2 + sequenceRatio * 0.2;
        } else {
          // 5. Fallback to Levenshtein similarity (highly penalized)
          score = getStringSimilarity(cleanHint, cleanName) * 0.6;
        }
      }
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { account, score };
    }
  }

  return bestMatch;
}
