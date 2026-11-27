# Reports capability matrix (v1 vs Money overview)

Evidence snapshot for Phase 1 **D1**. No code moves.

| Capability | Reports v1 (`/reports`) | Money overview / v2 (`/reports-v2`) |
|---|---|---|
| **Primary entry today** | Header PieChart on Money overview (`toReports`) | Drawer Explore → Money overview (`AppNavigation.toReportsV2`) |
| **Title** | “Reports” | “Money overview” |
| **Sections / tabs** | Overview · Spending · Wealth | Overview · Cash flow · Spending · Income · Net worth · Budgets · Debt · Forecast · Health |
| **Period filters** | DateRangePicker (period filter) | Presets: month / quarter / YTD / all-time / custom |
| **Account filters** | Multi-account picker | Multi-account picker + include/exclude archived |
| **Other filters** | — | Basis (actual / actual+planned); compare prior period / last year |
| **Empty chart / no data** | `ReportNoData` → `EmptyStateView` (“No activity in this period.”); chart string “No activity to show yet” | Breakdown `EmptyStateView` (“No activity in this period”); chart card reuses `reports.chartNoData` |
| **Load / error UI** | `ErrorStateView` + retry via pull refresh | Full failure → `EmptyStateView` “Report unavailable” + Retry; stale-result / refreshing → `ReportsV2StatusNotice`; first load → `LoadingView` |
| **Drilldown** | Spending/wealth paths → `toJournalSearch` (dates, accounts, journal ids, category) | Section drilldown → `toJournalSearch`; paused while results stale |
| **FX / quality** | Incomplete FX warning (non-Wealth) | Incomplete FX warning + quality banner + optional “Fetch missing rates” on Health |
| **Notable unique value** | Mature Overview/Spending/Wealth visuals (sankey, heatmap, wealth) | Broader money story (budgets/debt/forecast/health) + richer filter model |

**Read for D1:** both still earn a keep; v2 is the broader product surface, v1 remains the polished classic trio until a later merge.
