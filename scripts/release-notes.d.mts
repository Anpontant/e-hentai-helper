export interface ReleaseNotesInput {
  /** Commit subject lines (e.g. from `git log --format=%s`). */
  subjects: string[];
  /** Release version, used in the trailing signed-release line. */
  version: string;
  /** Optional GitHub compare URL appended as a "Full Changelog" link. */
  compareUrl?: string;
}

export function buildReleaseNotes(input: ReleaseNotesInput): string;
