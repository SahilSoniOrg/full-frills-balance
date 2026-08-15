import { LocalTransactionClassifier } from '../BayesClassifier';

describe('LocalTransactionClassifier', () => {
  it('handles empty training data gracefully without NaN or throwing', () => {
    const classifier = new LocalTransactionClassifier();
    expect(classifier.classify('Swiggy food delivery')).toEqual([]);

    classifier.train([]);
    expect(classifier.classify('Swiggy food delivery')).toEqual([]);
  });

  it('trains and correctly classifies text into category with highest probability', () => {
    const classifier = new LocalTransactionClassifier();
    classifier.train([
      { text: 'Swiggy food delivery lunch', categoryAccountId: 'cat-food' },
      { text: 'Zomato dinner pizza', categoryAccountId: 'cat-food' },
      { text: 'Starbucks coffee tea', categoryAccountId: 'cat-food' },
      { text: 'Uber ride taxi trip', categoryAccountId: 'cat-transport' },
      { text: 'Ola cab fare metro', categoryAccountId: 'cat-transport' },
      { text: 'Shell petrol fuel gas', categoryAccountId: 'cat-transport' },
    ]);

    const foodResults = classifier.classify('swiggy lunch order');
    expect(foodResults.length).toBeGreaterThan(0);
    expect(foodResults[0].categoryAccountId).toBe('cat-food');
    expect(foodResults[0].probability).toBeGreaterThan(0.5);

    const transportResults = classifier.classify('uber cab trip');
    expect(transportResults.length).toBeGreaterThan(0);
    expect(transportResults[0].categoryAccountId).toBe('cat-transport');
    expect(transportResults[0].probability).toBeGreaterThan(0.5);
  });

  it('filters out short tokens and special characters during tokenization', () => {
    const classifier = new LocalTransactionClassifier();
    classifier.train([{ text: 'ATM #123 $$ cash withdrawal', categoryAccountId: 'cat-cash' }]);

    const results = classifier.classify('ATM cash');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].categoryAccountId).toBe('cat-cash');
  });
});
