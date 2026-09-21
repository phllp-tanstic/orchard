/** Raised when closeProbeRun is called on a run that already has a terminal event. */
export class ProbeRunAlreadyTerminalError extends Error {
  readonly probeRunId: string;

  constructor(probeRunId: string, cause: unknown) {
    super(`probe_run ${probeRunId} already has a terminal event; cannot close it again`);
    this.name = "ProbeRunAlreadyTerminalError";
    this.probeRunId = probeRunId;
    this.cause = cause;
  }
}

/** True when a Postgres error is the evidence.reject_event_after_terminal() trigger firing. */
export function isTerminalEventConflict(err: unknown): boolean {
  return err instanceof Error && /already has a terminal event/.test(err.message);
}
