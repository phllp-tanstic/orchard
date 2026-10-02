"use client";

/**
 * The confirm step (F003 T4). Disabled and labelled from the CAPABILITIES
 * response, not from a constant: if mainnetExecution ever becomes true the
 * button changes because the server said so, and until then the UI cannot
 * accidentally imply execution is live.
 */
export function ConfirmButton({
  mainnetExecution,
  reason,
}: {
  mainnetExecution: boolean;
  reason: string;
}) {
  if (mainnetExecution) {
    // Intentionally still inert: this feature ships no execution path at all,
    // so even a true flag must not produce a working buy button here.
    return (
      <button type="button" aria-disabled="true" disabled data-testid="confirm">
        Execution is not available in this app
      </button>
    );
  }
  return (
    <div>
      <button type="button" aria-disabled="true" disabled data-testid="confirm">
        Execution is not live yet
      </button>
      <p className="tiny muted" style={{ marginTop: 6 }} data-testid="confirm-reason">
        {reason}
      </p>
    </div>
  );
}
