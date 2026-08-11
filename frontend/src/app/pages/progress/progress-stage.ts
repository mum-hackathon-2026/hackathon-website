/**
 * One step of a team's route through the event.
 *
 * Lives beside the page rather than in `core/` because nothing derives it but
 * `Progress`; it is here so the page and its `app-stage-list` child agree on the
 * shape without importing each other.
 */

export type ProgressStageId =
  'team-formed' | 'registration' | 'submission' | 'under-review' | 'judging-complete' | 'results';

export type ProgressStageState = 'done' | 'current' | 'pending';

export interface ProgressStage {
  readonly id: ProgressStageId;
  readonly label: string;
  readonly accent: 'green' | 'blue' | 'red' | 'amber';
  /** Shown once the stage is reached; describes what it means for this team. */
  readonly description: string;
  /** When it happened. Null where the schema records no timestamp for it. */
  readonly at: Date | null;
  readonly state: ProgressStageState;
}
