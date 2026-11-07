import { EventProcessor } from './processor.mjs';

// Account ledger fed by the event processor.
// Event types: 'deposit' { amount }, 'withdraw' { amount }, 'reset' {}
export function createLedger({ startSeq = 1, openingBalance = 0 } = {}) {
  let balance = openingBalance;
  const history = [];

  const processor = new EventProcessor((event) => {
    switch (event.type) {
      case 'deposit':
        balance += event.payload.amount;
        break;
      case 'withdraw':
        balance -= event.payload.amount;
        break;
      case 'reset':
        balance = 0;
        break;
      default:
        throw new Error(`unknown event type ${event.type}`);
    }
    history.push(event.id);
  }, { startSeq });

  return {
    receive: (event) => processor.process(event),
    get balance() { return balance; },
    get history() { return [...history]; },
    get lastSeq() { return processor.lastSeq; },
    get pendingCount() { return processor.pendingCount; },
  };
}
