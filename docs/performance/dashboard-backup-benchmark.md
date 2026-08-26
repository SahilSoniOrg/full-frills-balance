# Dashboard benchmark with a local backup

Use the real import path and a personal export without copying the export into
the repository:

```sh
FFB_BACKUP_PATH=/absolute/path/to/backup.zip \
  bunx playwright test e2e/dashboard-backup-performance.test.ts
```

`FFB_BACKUP_PATH` may point to a JSON export or a ZIP export. ZIP payloads are
extracted to an operating-system temporary directory because the web file
compression adapter does not extract archives. The source archive is never
modified, copied into the repository, or committed.

The test measures the dashboard after import, then records one cold navigation
and five activity-to-dashboard warm navigations. It prints the timings as a
`[PERF]` line. Run it against the same backup after code changes to compare
results.

