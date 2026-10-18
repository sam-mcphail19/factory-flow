/**
 * The user-facing app version, shown as a chip in the header.
 *
 * ONE bump per RELEASE (a deploy to the live site), never one per commit,
 * with a single changelog entry covering it: minor for a release carrying
 * features (1.1.0), patch for one that is only fixes (1.0.1).
 *
 * Check the configured site's /api/version before a deploy. If it is behind
 * this number, fold new work into the top changelog entry.
 *
 * Every bump needs an entry in `src/lib/changelog.ts`, written for players:
 * a headline plus a few one-line notes.
 */
export const APP_VERSION = "0.1.0";
