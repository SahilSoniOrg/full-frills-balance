/**
 * Local in-memory Naive Bayes text classifier for transaction categorization.
 */

export interface ClassifierCategoryScore {
  categoryAccountId: string;
  probability: number;
}

export class LocalTransactionClassifier {
  private vocabulary = new Set<string>();
  private classDocCounts: Record<string, number> = {};
  private classWordCounts: Record<string, Record<string, number>> = {};
  private classTotalWords: Record<string, number> = {};
  private totalDocs = 0;

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  public train(samples: { text: string; categoryAccountId: string }[]): void {
    this.vocabulary.clear();
    this.classDocCounts = {};
    this.classWordCounts = {};
    this.classTotalWords = {};
    this.totalDocs = samples.length;

    for (const sample of samples) {
      const cat = sample.categoryAccountId;
      const tokens = this.tokenize(sample.text);

      this.classDocCounts[cat] = (this.classDocCounts[cat] || 0) + 1;
      if (!this.classWordCounts[cat]) {
        this.classWordCounts[cat] = {};
        this.classTotalWords[cat] = 0;
      }

      for (const token of tokens) {
        this.vocabulary.add(token);
        this.classWordCounts[cat][token] = (this.classWordCounts[cat][token] || 0) + 1;
        this.classTotalWords[cat] += 1;
      }
    }
  }

  public classify(text: string): ClassifierCategoryScore[] {
    const tokens = this.tokenize(text);
    const scores: { categoryAccountId: string; score: number }[] = [];
    const categories = Object.keys(this.classDocCounts);

    if (categories.length === 0 || this.totalDocs === 0 || this.vocabulary.size === 0) {
      return [];
    }

    for (const cat of categories) {
      let logProbability = Math.log(this.classDocCounts[cat] / this.totalDocs);
      const totalWordsInCat = this.classTotalWords[cat] || 0;
      const vocabSize = this.vocabulary.size;

      for (const token of tokens) {
        const count = this.classWordCounts[cat]?.[token] || 0;
        const wordProbability = (count + 1) / (totalWordsInCat + vocabSize);
        logProbability += Math.log(wordProbability);
      }

      scores.push({ categoryAccountId: cat, score: logProbability });
    }

    if (scores.length === 0) return [];

    scores.sort((a, b) => b.score - a.score);
    const maxScore = scores[0].score;

    const exps = scores.map(s => ({
      categoryAccountId: s.categoryAccountId,
      val: Math.exp(s.score - maxScore),
    }));
    const sumExps = exps.reduce((acc, curr) => acc + curr.val, 0);

    return exps
      .map(e => ({
        categoryAccountId: e.categoryAccountId,
        probability: sumExps > 0 ? e.val / sumExps : 0,
      }))
      .slice(0, 3);
  }
}
