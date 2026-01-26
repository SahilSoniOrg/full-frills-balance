# Known Gaps & Risks

## 🐛 Bugs
*   **None Critical found yet** in static analysis.
*   *Risk*: `FlashList` type workaround in `JournalListScreen.tsx` (`as any`). May hide type errors.

## ⚠️ UX Flaws
1.  **Account Deletion Safety**:
    *   **Severity**: P1 (Critical Risk)
    *   **Issue**: `AccountRepository.delete()` performs a soft delete without checking for linked transactions at the repository level. While `AccountDetailsScreen` shows a warning, programmatic access or other UI paths could lead to orphaned transactions.
    *   **Impact**: Financial data integrity risk.
2.  **Simple Mode Defaults**:
    *   **Severity**: P2
    *   **Issue**: In "Simple Mode", does it intelligently select the "From" account? If a user has 5 asset accounts, valid default selection is crucial to avoid friction.
3.  **Loading States**:
    *   **Severity**: P2
    *   **Issue**: Initial dashboard load might show layout shift if Net Worth calculates slowly.

## 🧩 Missing Features
1.  **Reports**:
    *   **Severity**: P1 (for v1 completeness)
    *   **Issue**: The "Reports" tab is a placeholder. Users expect visualization of their spending.
2.  **Search Filtering**:
    *   **Severity**: P2
    *   **Issue**: Search exists but might strictly match strings. Date range filtering is missing.

## 🧱 Product Debt
1.  **No Cloud Sync**:
    *   **Why**: By design (Local-first), but users *will* ask for backup beyond manual JSON export.
2.  **Hardcoded Currencies**:
    *   **Why**: Currency service loads local list. Updating rates/currencies requires app update.

---

# Future Roadmap

## Phase 1: V1 Polish (Immediate)
- [ ] Implement basic Reports (Pie chart of expenses).
- [ ] Verify Account Deletion safeguards (Prevent orphan transactions).
- [ ] Add Date Range filter to Transaction List.

## Phase 2: Trust & Safety
- [ ] Biometric Lock (FaceID/TouchID) on app launch.
- [ ] Automatic Backup (Local file versioning).

## Phase 3: Power Features
- [ ] CSV Import (Bank statements).
- [ ] Recurring Transactions.
- [ ] Budgeting Goals.
