# E2E Stress Test: 50+ New Test Cases Map

Mapping of the 50 new test cases requested for the E2E suite expansion.

## 1. Complex Journaling (20 Cases)
**File**: `e2e/complex-journal.test.ts`

- [ ] **Multi-line Basics**
    - [ ] 3-line balanced split (1 Credit, 2 Debits)
    - [ ] 3-line balanced split (2 Credits, 1 Debit)
    - [ ] 5-line complex split (various accounts)
    - [ ] Zero-sum journal (e.g., $100 out, $100 in, same account type)
- [ ] **Advanced Validation**
    - [ ] Unbalanced Debit surplus prevention
    - [ ] Unbalanced Credit surplus prevention
    - [ ] Empty description validation
    - [ ] Invalid date format handling
    - [ ] Future date entry validation
- [ ] **Audit & History**
    - [ ] Verify "View Edit History" link appears after any edit
    - [ ] Verify audit log contains original amount
    - [ ] Verify audit log contains updated amount
    - [ ] Verify multiple edits are tracked sequentially
- [ ] **State Transitions**
    - [ ] Switch from Simple to Advanced mode (auto-populate)
    - [ ] Prevent switch from Advanced to Simple if >2 lines
    - [ ] Verify "EDITING" badge in details after partial save
- [ ] **Edge Splits**
    - [ ] $0.01 split (precision stress)
    - [ ] Large number split ($1,000,000+)
    - [ ] Negative amount entry prevention in split lines
    - [ ] Multiple lines to same account validation

## 2. Account Management & Types (10 Cases)
**File**: `e2e/account-types.test.ts`

- [ ] Liability account creation (Credit Card)
- [ ] Income account creation (Salary)
- [ ] Equity account creation (Opening Balance)
- [ ] Managing loan repayment (Liability decrease, Asset decrease)
- [ ] Interest expense tracking (Expense increase, Liability decrease)
- [ ] Transfer between Asset and Liability (Paying off CC)
- [ ] Closing balance verification for Liability
- [ ] Account name collision prevention
- [ ] Deleting account with dependencies (Referential integrity check)
- [ ] Editing account type (Verify forbidden/allowed transitions)

## 3. UI, Settings & Accessibility (10 Cases)
**File**: `e2e/visual-regressions.test.ts`

- [ ] Dark Mode toggle stability
- [ ] Privacy Mode (amounts hidden on all screens: Accounts, Journal, Details)
- [ ] Custom currency symbol rendering
- [ ] Search functionality in Accounts List
- [ ] Filtering Journal by date range
- [ ] Empty state: No Accounts screen
- [ ] Empty state: No Transactions screen
- [ ] Responsive tablet vs phone layout check (viewport stress)
- [ ] Modal layout stability (Currency Picker)
- [ ] Scrolling stability on long transaction lists

## 4. Stress & Data Integrity (10 Cases)
**File**: `e2e/stress-boundary.test.ts`

- [ ] Rapid data entry (10 transactions in <30s)
- [ ] Mass deletion of accounts
- [ ] App reload during active journal creation (Draft recovery check)
- [ ] IndexedDB mass export (v1 mandatory)
- [ ] Import legacy data (Compatibility check)
- [ ] Currency conversion precision stress (Rounding rules)
- [ ] Long description character limit (1000+ chars)
- [ ] Rapid toggling of UI modes (Light/Dark/Privacy)
- [ ] Navigation history stress (Deep nesting)
- [ ] Offline operation simulation (Mocking no network if applicable)
