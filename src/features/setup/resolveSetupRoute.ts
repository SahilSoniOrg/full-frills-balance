export type SetupRoute = 'legacy_post_import' | 'first_run' | 'create_workplace';

/** Keep the legacy imported-Workplace acknowledgement reachable during the UI migration. */
export function resolveSetupRoute(params: {
  mode?: string;
  stage?: string;
  hasPendingImportedWorkplace?: boolean;
}): SetupRoute {
  if (params.stage === 'post_import' || params.hasPendingImportedWorkplace) {
    return 'legacy_post_import';
  }
  return params.mode === 'full' ? 'create_workplace' : 'first_run';
}
