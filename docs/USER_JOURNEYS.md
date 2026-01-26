# User Journeys

## Personas

### 1. The Fresh Starter (First-Time User)
*   **Context**: Downloaded the app to get a handle on personal finances. Has valid anxiety about "doing it wrong".
*   **Goals**: Set up basic tracking quickly. See a "win" (first balance).
*   **Fears**: Complex setup, accounting jargon, privacy (cloud).
*   **Key Path**: Onboarding -> Create Bank Account -> Add First Expense.

### 2. The Regular Tracker (Returning User)
*   **Context**: Uses the app daily to log coffee, groceries, bills.
*   **Goals**: Speed. Get in, simple log, get out.
*   **Fears**: Friction (too many taps), forgetting what they bought.
*   **Key Path**: Open App -> Tap FAB -> Simple Entry (Expense).

### 3. The Ledger Architect (Power User)
*   **Context**: Understands double-entry. Wants to split bills, track transfers accurately.
*   **Goals**: Precision. Correctly modeled transfers (Credit Card payment from Checking).
*   **Fears**: Imbalanced journals, "magic" auto-corrections they didn't ask for.
*   **Key Path**: Advanced Journal Entry (Multi-leg transaction).

### 4. The Fumbler (Error-Prone User)
*   **Context**: Distracted, tapping quickly. Might delete the wrong thing.
*   **Goal**: undo mistakes.
*   **Fears**: Permanent data loss.
*   **Key Path**: Edit Transaction -> Change Amount -> Save -> Realize mistake -> Edit again.

---

## Journeys Map

### Journey 1: The First Launch (Fresh Starter)
1.  **Launch App**: Splash screen.
2.  **Onboarding**:
    *   **Input**: "What should we call you?"
    *   **Input**: "Default Currency" (Selection list).
    *   **Action**: "Get Started".
3.  **Home Screen (Empty State)**:
    *   *Assumption*: User sees "No transactions yet" and a clear Call to Action (CTA).
4.  **Action**: Tap "+" (or dedicated "Add Account" CTA if present).
5.  **Create Account**:
    *   **Screen**: Account Creation.
    *   **Input**: Name ("Chase Checking"), Type ("Asset").
    *   **Action**: Save.
6.  **Result**: Redirect to Home/Accounts list. Account visible.

### Journey 2: The Daily Coffee (Returning User)
1.  **Launch App**: Dashboard visible (~300ms).
2.  **Action**: Tap Floating Action Button (+).
3.  **Journal Entry (Simple Mode)**:
    *   **State**: Defaults to "Expense". Defaults to last used asset account? (Assumption: Defaults or forces selection).
    *   **Input**: Amount ("5.50").
    *   **Input**: Note ("Oat latte").
    *   **Action**: Submit.
4.  **Result**: Toast "Transaction created". Dashboard updates Net Worth. Transaction appears in list.

### Journey 3: The Correction (Error-Prone User)
1.  **Context**: Just entered $500 instead of $50.
2.  **Action**: Tap transaction in list.
3.  **Details Screen**: View details.
4.  **Action**: Tap "Edit" (Pencil).
5.  **Edit Screen**:
    *   **Input**: Change Amount to 50.
    *   **Action**: Save.
6.  **Result**: Updates immediately. Net Worth recalculates.

### Journey 4: The Clean Slate (Data Management)
1.  **Navigation**: Go to Settings.
2.  **Action**: Tap "Danger Zone" / "Reset App".
3.  **Confirmation**: Modal warning.
4.  **Action**: Confirm.
5.  **Result**: App restarts or redirects to Onboarding. Database cleared.
