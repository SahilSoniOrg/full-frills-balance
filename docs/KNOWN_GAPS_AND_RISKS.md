# Known Gaps & Risks

## 🐛 Bugs
*   **None critical** identified in latest audit.

## ⚠️ UX Considerations
1.  **Loading States on Boot**:
    *   **Severity**: P3
    *   **Issue**: Initial dashboard load runs the full simulation pipeline. On older Android devices, the Safe to Spend card may show a brief loading skeleton before resolving.
    *   **Mitigation**: Adaptive boot scheduling prioritizes UI thread. Splash screen covers cold-boot latency.

2.  **Chart Gesture Conflicts**:
    *   **Severity**: P3
    *   **Issue**: Vertical scrolling can occasionally trigger chart tooltip on the Safe to Spend projection chart.
    *   **Mitigation**: `activeOffsetX/Y` thresholds on `Gesture.Pan` reduce false activations. Ongoing refinement.

## 🧩 Known Limitations
1.  **SMS Import — Android Only**:
    *   **Why**: iOS does not expose SMS access APIs. Feature requires the `expo-sms-inbox` native module.
2.  **No Cloud Sync**:
    *   **Why**: By design (offline-first, privacy-centric). Users rely on JSON export/import for backup.
    *   **Future**: Encrypted file-based backup is on the roadmap.
3.  **Exchange Rate Freshness**:
    *   **Why**: Rates are fetched from ExchangeRate-API and cached locally. Stale rates are possible during extended offline periods.

## 🧱 Technical Debt
1.  **`as any` Residue**:
    *   Some `as any` casts remain in sharing and older UI components. Being cleaned up incrementally.
2.  **Test Coverage Gaps**:
    *   Simulation engine has strong coverage (unit + heavy scenario tests). Some newer UI features (hub, commitments view) lack dedicated tests.
3.  **Import Plugin Error Handling**:
    *   Edge cases in Ivy Wallet and Cashew import plugins could produce partial imports on malformed files. Validation coverage is being expanded.
