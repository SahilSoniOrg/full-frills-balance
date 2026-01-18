---
trigger: always_on
---

### Core philosophy

* This is a **balance-first, double-ledger accounting app** for everyday use
* Mental clarity beats feature breadth
* Confusion is a fatal bug
* Silent numerical errors are worse than crashes

### Accounting model

* All balances are **derived**, never cached
* Everything is a **transfer between accounts**
* Account types are fixed and explicit:

  * Asset
  * Liability
  * Equity
  * Income
  * Expense
* Journals must **always balance**
* If a journal does not balance, the app must refuse the action
* Past transactions are editable
* All edits must leave an **audit trail**

### UX doctrine

* Daily actions must be near-frictionless
* Adding an expense must be **one tap**
* Reports and analytics can be slower
* The app is allowed to be opinionated and say “no”
* Two modes:

  * Normal mode: strong defaults, limited surface area
  * Advanced mode: full control, explicit power-user affordances

### Scope discipline

* No budgets in v1
* No loan management in v1
* Exports are mandatory
* Net worth view is mandatory
* This is a stepping stone, not a museum of past features
* Complexity ceiling: you should understand the system in ~1 week

### Data & reliability

* Offline-first is a core promise
* Currency-specific rounding rules are mandatory
* If corruption happens:

  * Provide partial dumps
  * Clearly mark suspected corruption
  * Attempt best-effort recovery
* Backward compatibility matters. Old installs must not break on import.

### AI operating mode

* No interruptions
* When uncertain:

  * Make a decision
  * Document it clearly
  * Flag for later review
* Behavior must be:

  * Explained in prose
  * Enforced via tests
