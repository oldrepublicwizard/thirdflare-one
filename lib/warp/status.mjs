/**
 * Parse warp-cli status text into connection flags.
 */
export function parseStatus(text) {
  const clean = String(text || "").replace(/\r/g, "").trim();
  const lower = clean.toLowerCase();
  const disconnected = /\b(disconnected|not connected)\b/.test(lower);
  const connecting = !disconnected && /\b(connecting|reconnecting)\b/.test(lower);
  const connected = !disconnected && !connecting && /\bconnected\b/.test(lower);
  const registrationMissing = lower.includes("registration missing") || lower.includes("not registered");
  const healthy = lower.includes("network: healthy") || lower === "healthy";
  const unhealthy = lower.includes("unhealthy") || lower.includes("degraded");
  const daemonMissing = lower.includes("unable to connect to the cloudflarewarp daemon");

  return {
    label: clean || "Unavailable",
    connected,
    connecting,
    disconnected,
    registrationMissing,
    healthy,
    unhealthy,
    daemonMissing,
    severity: connected || healthy ? "good" : connecting || unhealthy ? "warn" : "bad"
  };
}

/**
 * Stable key for transition comparison (ignore cosmetic label churn).
 */
export function statusFingerprint(status) {
  if (!status) return "none";
  return [
    status.connected ? "1" : "0",
    status.connecting ? "1" : "0",
    status.disconnected ? "1" : "0",
    status.registrationMissing ? "1" : "0",
    status.daemonMissing ? "1" : "0",
    status.unhealthy ? "1" : "0",
    status.severity || "bad"
  ].join(":");
}

/**
 * Decide whether to notify and what to say.
 * Returns null when the change is not meaningful (or first sample).
 */
export function notificationForTransition(previous, next) {
  if (!next) return null;
  if (!previous) return null; // suppress bootstrap noise

  const prevKey = statusFingerprint(previous);
  const nextKey = statusFingerprint(next);
  if (prevKey === nextKey) return null;

  if (next.daemonMissing && !previous.daemonMissing) {
    return {
      title: "ThirdFlare One",
      body: "Cloudflare WARP daemon is unavailable."
    };
  }

  if (next.connected && !previous.connected) {
    return {
      title: "ThirdFlare One",
      body: "Connected to Cloudflare WARP."
    };
  }

  if (next.disconnected && previous.connected) {
    return {
      title: "ThirdFlare One",
      body: "Disconnected from Cloudflare WARP."
    };
  }

  if (next.unhealthy && !previous.unhealthy && next.connected) {
    return {
      title: "ThirdFlare One",
      body: "WARP network is unhealthy or degraded."
    };
  }

  if (next.registrationMissing && !previous.registrationMissing) {
    return {
      title: "ThirdFlare One",
      body: "WARP registration is missing."
    };
  }

  return null;
}
