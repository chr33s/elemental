// The dev supervisor detects child-server readiness by watching stdout for
// this prefix, so the runtime log line and the probe must never drift apart.
export const ELEMENTAL_SERVER_READY_LOG = "Elemental server listening on";
