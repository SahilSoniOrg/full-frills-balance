import { Money } from './src/utils/money';

const m = Money.from(100, 'USD');
console.log(m.format());
console.log(m.add(Money.from(50, 'USD')).amount);
