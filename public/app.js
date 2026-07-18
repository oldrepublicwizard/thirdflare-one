import { loadLocale, t, tip, getLocale } from "./i18n.js";

const navItems = [
  ["home", "nav.home", "⌂", "pageHome"],
  ["account", "nav.account", "◎", "pageAccount"],
  ["gateway", "nav.gateway", "◇", "pageGateway"],
  ["tunnel", "nav.tunnel", "↔", "pageTunnel"],
  ["split", "nav.split", "⌁", "pageSplit"],
  ["trusted", "nav.trusted", "⌁", "pageTrusted"],
  ["diagnostics", "nav.diagnostics", "◷", "pageDiagnostics"],
  ["settings", "nav.settings", "⚙", "pageSettings"],
  ["app", "nav.app", "✦", "pageApp"],
  ["parity", "nav.parity", "✓", "pageParity"],
  ["advanced", "nav.advanced", "⌘", "pageAdvanced"]
];

const quickModes = ["warp", "doh", "warp+doh", "dot", "warp+dot", "proxy", "tunnel_only"];
const protocols = ["MASQUE", "WireGuard"];
const families = ["off", "malware", "full"];
const masqueOptions = ["h3-with-h2-fallback", "h3-only", "h2-only"];

const state = {
  view: "home",
  snapshot: null,
  busy: false,
  lastAction: null,
  error: null,
  toast: null,
  version: null,
  appConfig: null,
  update: {
    checking: false,
    loadingCatalog: false,
    loadingReleases: false,
    result: null,
    releases: [],
    forks: [],
    upstream: null,
    selectedOwner: "",
    selectedRepo: "",
    selectedTag: "",
    confirmToken: null,
    showReleases: false
  },
  live: {
    connected: false,
    label: "Live status connecting",
    lastEvent: null,
    lastLine: "",
    failures: 0
  },
  forms: {
    proxyPort: "40000",
    vnet: "",
    splitIp: "",
    splitHost: "",
    gatewayId: "",
    dnsFallback: "",
    endpoint: "",
    trustedSsid: "",
    overrideCode: "",
    customCommand: "status",
    organization: "",
    licenseKey: "",
    authToken: ""
  },
  account: null,
  accountLoading: false,
  revealLicense: false,
  accountPath: "auto",
  killswitch: {
    desired: false,
    allowLan: false,
    active: false,
    probeError: false,
    detail: "",
    guidedCommands: null,
    script: null,
    loading: false
  }
};

const app = document.querySelector("#app");

function commandText(key) {
  const command = state.snapshot?.commands?.[key];
  if (!command) return "No output yet.";
  return command.stdout || command.stderr || "No output.";
}

function setting(...keys) {
  const settings = state.snapshot?.settings || {};
  for (const key of keys) {
    const needle = key.toLowerCase();
    const found = Object.entries(settings).find(([name]) => {
      const normalized = name.toLowerCase().replace(/^\([^)]*\)\s*/, "").trim();
      return normalized === needle || normalized.endsWith(`\t${needle}`) || normalized.endsWith(needle);
    });
    if (found) return found[1];
  }
  return "Unknown";
}

function statusKind() {
  if (!state.snapshot?.daemon?.available) return "bad";
  return state.snapshot.status?.severity || "warn";
}

function statusText() {
  if (!state.snapshot) return "Loading WARP state";
  if (!state.snapshot.daemon.available) return "Daemon unavailable";
  return state.snapshot.status.label || "State unavailable";
}

/** Single Connect/Disconnect control driven by live WARP status. */
function connectionToggle() {
  const daemonOk = state.snapshot?.daemon?.available !== false;
  const status = state.snapshot?.status;
  const connected = Boolean(status?.connected);
  const connecting = Boolean(status?.connecting);

  if (!daemonOk) {
    return {
      action: null,
      label: t("common.connect"),
      tipKey: "daemon",
      className: "primary tip connection-toggle",
      disabled: true,
      pressed: false
    };
  }
  if (connected || connecting) {
    return {
      action: "disconnect",
      label: connecting ? t("common.connecting") : t("common.disconnect"),
      tipKey: "disconnect",
      className: "secondary danger tip connection-toggle is-connected",
      disabled: false,
      pressed: true
    };
  }
  return {
    action: "connect",
    label: t("common.connect"),
    tipKey: "connect",
    className: "primary tip connection-toggle",
    disabled: false,
    pressed: false
  };
}

function applyConnectionToggle(button) {
  if (!button) return;
  const toggle = connectionToggle();
  button.className = toggle.className;
  button.textContent = toggle.label;
  button.disabled = toggle.disabled || state.busy;
  button.setAttribute("aria-pressed", toggle.pressed ? "true" : "false");
  button.setAttribute("data-action", toggle.action || "");
  button.setAttribute("data-tip", tip(toggle.tipKey));
  button.tabIndex = 0;
}

function el(tag, className, html = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.innerHTML = html;
  return node;
}

function hasFocusedField() {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  const tag = active.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable;
}

async function refresh({ silent = false } = {}) {
  if (!silent) {
    state.error = null;
    render();
  }
  try {
    const response = await fetch("/api/snapshot");
    state.snapshot = await response.json();
    if (state.view === "account") await loadAccount(false);
    if (state.view === "home" || state.view === "settings") await loadKillSwitch(false);
  } catch (error) {
    state.error = error.message;
  }
  if (silent && hasFocusedField()) {
    patchLiveChrome();
    return;
  }
  render();
}

async function loadKillSwitch(showBusy = true) {
  if (showBusy) state.killswitch.loading = true;
  try {
    const response = await fetch("/api/killswitch");
    const body = await response.json();
    state.killswitch.desired = Boolean(body.desired);
    state.killswitch.allowLan = Boolean(body.allowLan);
    state.killswitch.active = body.active === null ? null : Boolean(body.active);
    state.killswitch.probeError = Boolean(body.probeError);
    state.killswitch.detail = body.detail || "";
    if (body.ok !== false && !body.guidedCommands) {
      state.killswitch.guidedCommands = null;
      state.killswitch.script = null;
    }
  } catch (error) {
    state.killswitch.detail = error.message;
  }
  state.killswitch.loading = false;
}

async function setKillSwitch(enabled, allowLan = state.killswitch.allowLan) {
  if (enabled && !window.confirm(t("home.killSwitchConfirm"))) return;
  state.killswitch.loading = true;
  state.error = null;
  render();
  try {
    const response = await fetch("/api/killswitch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled, allowLan })
    });
    const body = await response.json();
    state.killswitch.desired = Boolean(body.desired);
    state.killswitch.allowLan = Boolean(body.allowLan);
    state.killswitch.active = body.active === null ? null : Boolean(body.active);
    state.killswitch.probeError = Boolean(body.probeError);
    state.killswitch.detail = body.detail || "";
    state.killswitch.guidedCommands = body.guidedCommands || null;
    state.killswitch.script = body.script || null;
    if (!response.ok) state.error = body.detail || "Kill switch apply failed.";
    if (state.appConfig?.warp) {
      state.appConfig.warp.killSwitch = state.killswitch.desired;
      state.appConfig.warp.killSwitchAllowLan = state.killswitch.allowLan;
    }
  } catch (error) {
    state.error = error.message;
  }
  state.killswitch.loading = false;
  render();
}

function killSwitchPanel() {
  const ks = state.killswitch;
  const panel = el("section", "panel killswitch-panel");
  // Treat orphan active (desired off, table on) as on so the toggle can disable.
  const effectivelyOn = Boolean(ks.active) || Boolean(ks.desired);
  const mismatch = Boolean(ks.active) !== Boolean(ks.desired) || Boolean(ks.probeError);
  const badge = ks.probeError
    ? t("home.killSwitchUnknown")
    : (ks.active ? t("home.killSwitchOn") : t("home.killSwitchOff"));
  panel.innerHTML = `
    <div class="panel-heading">
      <h3${tipMarkup("killSwitch")}>${t("home.killSwitch")}</h3>
      <span>${badge}</span>
    </div>
    <p class="panel-lede tip" data-tip="${escapeHtml(tip("killSwitch"))}" tabindex="0">${t("home.killSwitchCopy")}</p>
  `;

  const main = el("div", "switch-row");
  main.innerHTML = `
    <div class="switch-meta">
      <strong class="tip" data-tip="${escapeHtml(tip("killSwitch"))}" tabindex="0">${t("home.killSwitchLabel")}</strong>
      <p>${escapeHtml(ks.detail || (mismatch ? t("home.killSwitchMismatch") : t("home.killSwitchHint")))}</p>
    </div>
  `;
  const toggle = el("button", `switch ${effectivelyOn ? "on" : ""}`);
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", effectivelyOn ? "true" : "false");
  toggle.setAttribute("aria-label", t("home.killSwitchLabel"));
  toggle.disabled = ks.loading || state.busy;
  toggle.onclick = () => setKillSwitch(!effectivelyOn, ks.allowLan);
  main.append(toggle);
  panel.append(main);

  const lan = el("div", "switch-row");
  lan.innerHTML = `
    <div class="switch-meta">
      <strong class="tip" data-tip="${escapeHtml(tip("killSwitchAllowLan"))}" tabindex="0">${t("home.killSwitchAllowLan")}</strong>
      <p>${t("home.killSwitchAllowLanHint")}</p>
    </div>
  `;
  const lanToggle = el("button", `switch ${ks.allowLan ? "on" : ""}`);
  lanToggle.type = "button";
  lanToggle.setAttribute("role", "switch");
  lanToggle.setAttribute("aria-checked", ks.allowLan ? "true" : "false");
  lanToggle.setAttribute("aria-label", t("home.killSwitchAllowLan"));
  lanToggle.disabled = ks.loading || state.busy || !effectivelyOn;
  lanToggle.onclick = () => setKillSwitch(true, !ks.allowLan);
  lan.append(lanToggle);
  panel.append(lan);

  if (ks.guidedCommands?.length) {
    const guide = el("div", "killswitch-guide");
    guide.innerHTML = `<p>${t("home.killSwitchGuided")}</p><pre>${escapeHtml(ks.guidedCommands.join("\n"))}${ks.script ? `\n\n${escapeHtml(ks.script)}` : ""}</pre>`;
    panel.append(guide);
  }
  return panel;
}

async function loadAccount(showBusy = true) {
  if (showBusy) {
    state.accountLoading = true;
    render();
  }
  try {
    const response = await fetch("/api/account");
    state.account = await response.json();
  } catch (error) {
    state.error = error.message;
  }
  state.accountLoading = false;
}

async function action(actionName, value, secondary, confirmCommand = false) {
  if (confirmCommand && !window.confirm(`Run warp-cli action: ${actionName}?`)) return;

  state.busy = true;
  state.error = null;
  render();
  try {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: actionName, value, secondary })
    });
    const body = await response.json();
    state.lastAction = body.result || body;
    if (!response.ok) state.error = body.error || body.result?.stderr || "Command failed.";
  } catch (error) {
    state.error = error.message;
  }
  state.busy = false;
  await refresh();
}

function shell() {
  const root = el("div", "window-shell");
  root.append(header());

  const body = el("main", "app-body");
  const nav = el("nav", "sidebar");
  navItems.forEach(([id, labelKey, icon, tipKey]) => {
    const button = el("button", `nav-item ${state.view === id ? "active" : ""}`);
    button.innerHTML = `<span class="nav-icon" aria-hidden="true">${icon}</span><span>${t(labelKey)}</span>`;
    button.setAttribute("aria-label", t(labelKey));
    if (tipKey) applyTip(button, tipKey);
    button.onclick = () => {
      state.view = id;
      render();
      if (id === "app") loadAppPanel();
      if (id === "account") {
        loadAccount().then(() => render());
      }
    };
    nav.append(button);
  });

  body.append(nav, content());
  root.append(body);
  return root;
}

function header() {
  const node = el("header", "titlebar");
  node.innerHTML = `
    <div class="brand">
      <div class="brand-mark" aria-hidden="true"><span></span></div>
      <div>
        <div class="brand-title">${t("brand.title")}</div>
        <div class="brand-subtitle">${t("brand.subtitle")}</div>
      </div>
    </div>
    <div class="window-actions">
      <div class="live-pill ${state.live.connected ? "online" : "offline"}">
        <span></span>${state.live.connected ? t("common.live") : t("common.polling")}
      </div>
      <button class="ghost" data-refresh>${t("common.refresh")}</button>
      <div class="traffic-dots"><i></i><i></i><i></i></div>
    </div>
  `;
  node.querySelector("[data-refresh]").onclick = refresh;
  return node;
}

function content() {
  const section = el("section", "content");
  const views = {
    home: homeView,
    account: accountView,
    gateway: gatewayView,
    tunnel: tunnelView,
    split: splitView,
    trusted: trustedView,
    diagnostics: diagnosticsView,
    settings: settingsView,
    app: appView,
    parity: parityView,
    advanced: advancedView
  };
  section.append(views[state.view]());
  return section;
}

function tipMarkup(key) {
  const text = tip(key);
  if (!text || text.startsWith("tips.")) return "";
  return ` class="tip" data-tip="${escapeHtml(text)}" tabindex="0"`;
}

function tipDataAttrs(key) {
  const text = tip(key);
  if (!text || text.startsWith("tips.")) return "";
  return ` data-tip="${escapeHtml(text)}" tabindex="0"`;
}

function tipClass(key, base = "") {
  const text = tip(key);
  const has = Boolean(text && !text.startsWith("tips."));
  return [base, has ? "tip" : ""].filter(Boolean).join(" ");
}

function applyTip(node, key) {
  const text = tip(key);
  if (!node || !text || text.startsWith("tips.")) return node;
  node.classList.add("tip");
  node.setAttribute("data-tip", text);
  if (!node.hasAttribute("tabindex")) node.tabIndex = 0;
  return node;
}

const modeValueTips = {
  warp: "modeWarp",
  doh: "modeDoh",
  "warp+doh": "modeWarpDoh",
  dot: "modeDot",
  "warp+dot": "modeWarpDot",
  proxy: "modeProxy",
  tunnel_only: "modeTunnelOnly"
};

const familiesValueTips = {
  off: "familiesOff",
  malware: "familiesMalware",
  full: "familiesFull"
};

const protocolValueTips = {
  MASQUE: "protocolMasque",
  WireGuard: "protocolWireGuard"
};

function pageTitle(title, copy, tipKey = "") {
  return el("div", "page-title", `<h1${tipMarkup(tipKey)}>${title}</h1><p>${copy}</p>`);
}

function homeView() {
  const grid = el("div", "view-stack");
  grid.append(pageTitle(t("home.title"), t("home.copy"), "pageHome"));

  const layout = el("div", "home-grid");
  const primary = el("section", "hero-panel panel");
  primary.innerHTML = `
    <div class="status-orb ${statusKind()}"><span></span></div>
    <div class="hero-copy">
      <div class="status-label tip" data-tip="${escapeHtml(tip("liveStatus"))}" tabindex="0">${statusText()}</div>
      <h2 class="tip" data-tip="${escapeHtml(tip("daemon"))}" tabindex="0">${state.snapshot?.daemon?.available ? t("home.tunnelControls") : t("home.daemonMissing")}</h2>
      <p>${state.snapshot?.daemon?.message || t("common.loading")}</p>
    </div>
    <div class="hero-actions">
      <button type="button" class="connection-toggle" data-connection-toggle tabindex="0"></button>
    </div>
  `;
  const toggleBtn = primary.querySelector("[data-connection-toggle]");
  applyConnectionToggle(toggleBtn);
  toggleBtn.onclick = () => {
    const next = connectionToggle();
    if (!next.action || next.disabled) return;
    action(next.action);
  };
  const quick = el("section", "panel quick-panel");
  quick.innerHTML = `<div class="panel-heading"><h3${tipMarkup("mode")}>${t("home.quickSettings")}</h3><span>${t("home.quickHint")}</span></div>`;
  quick.append(segmented(t("home.mode"), quickModes, "setMode", setting("Mode"), tip("mode"), modeValueTips));
  quick.append(segmented(t("home.protocol"), protocols, "setProtocol", setting("Tunnel protocol", "Protocol"), tip("protocol"), protocolValueTips));
  quick.append(segmented(t("home.families"), families, "setFamilies", setting("Families mode", "DNS families"), tip("families"), familiesValueTips));

  layout.append(primary, quick);
  grid.append(layout, killSwitchPanel(), metrics(), liveStatePanel(), outputPanel("Last command", state.lastAction, "rawOutput"));
  return grid;
}

function segmented(label, values, actionName, current, tipText = "", valueTips = null) {
  const wrap = el("div", "field-group");
  const tipAttr = tipText ? ` class="tip" data-tip="${escapeHtml(tipText)}" tabindex="0"` : "";
  wrap.innerHTML = `<label${tipAttr}>${label}</label>`;
  const row = el("div", "segmented");
  values.forEach((value) => {
    const button = el("button", current?.toLowerCase?.() === value.toLowerCase() ? "selected" : "", value);
    const tipKey = valueTips && (valueTips[value] || valueTips[String(value).toLowerCase()]);
    if (tipKey) applyTip(button, tipKey);
    button.onclick = () => {
      if (actionName === "setEnvironment") {
        action(value === "FedRAMP-High" ? "environmentFedramp" : "environmentNormal", undefined, undefined, true);
        return;
      }
      action(actionName, value);
    };
    row.append(button);
  });
  wrap.append(row);
  return wrap;
}

function metrics() {
  const tunnel = state.snapshot?.parsed?.tunnel || {};
  const dns = state.snapshot?.parsed?.dns || {};
  const items = [
    ["Mode", setting("Mode"), "mode"],
    ["Protocol", tunnel.protocol || setting("Tunnel protocol", "Protocol"), "protocol"],
    ["Latency", tunnel.latency || "Unknown", "handshake"],
    ["Traffic", tunnel.sent && tunnel.received ? `${tunnel.sent} up / ${tunnel.received} down` : "Unknown", "loss"],
    ["DNS", dns.success ? `${dns.success} success` : "Unknown", "dnsQueries"],
    ["Generated", state.snapshot ? new Date(state.snapshot.generatedAt).toLocaleTimeString() : "Pending", "liveStatus"]
  ];
  const row = el("section", "metrics-row");
  items.forEach(([label, value, tipKey]) => {
    row.append(el("div", "metric", `<span${tipMarkup(tipKey)}>${label}</span><strong>${escapeHtml(String(value)).slice(0, 80)}</strong>`));
  });
  return row;
}

function liveStatePanel() {
  const tunnel = state.snapshot?.parsed?.tunnel || {};
  const dns = state.snapshot?.parsed?.dns || {};
  const panel = el("section", "panel state-panel");
  panel.innerHTML = `
    <div class="panel-heading">
      <h3${tipMarkup("liveStatus")}>Current State</h3>
      <span>${state.live.lastEvent ? `event ${new Date(state.live.lastEvent).toLocaleTimeString()}` : "snapshot"}</span>
    </div>
    <div class="state-grid">
      ${stateDatum("Colo", tunnel.colo || "Unknown", "colo")}
      ${stateDatum("Handshake", tunnel.handshakeAge || "Unknown", "handshake")}
      ${stateDatum("Loss", tunnel.loss || "Unknown", "loss")}
      ${stateDatum("DNS queries", dns.queries || "Unknown", "dnsQueries")}
      ${stateDatum("DNS avg", dns.averageDuration || "Unknown", "dnsAvg")}
      ${stateDatum("Live event", state.live.lastLine || "Waiting", "liveStatus")}
      ${stateDatum("VNet", commandText("vnet"), "vnetMetric")}
    </div>
  `;
  return panel;
}

function stateDatum(label, value, tipKey = "") {
  return `<div class="${tipClass(tipKey, "state-datum")}"${tipDataAttrs(tipKey)}><span>${label}</span><strong>${escapeHtml(String(value)).slice(0, 96)}</strong></div>`;
}

function accountView() {
  const view = el("div", "view-stack account-view");
  const acct = state.account;
  view.append(pageTitle(t("account.title"), t("account.copy"), "pageAccount"));

  const path = resolveAccountPath(acct);
  const overview = el("section", "panel account-overview account-status-strip");
  overview.innerHTML = `
    <div class="panel-heading">
      <h3 class="tip" data-tip="${escapeHtml(tip("accountOverview"))}" tabindex="0">${t("account.overview")}</h3>
      <span class="${acct?.registered ? "ok" : "fail"}">${acct?.registered ? t("account.registered") : t("account.notRegistered")}</span>
    </div>
    <p class="account-lede">${escapeHtml(t("account.lede"))}</p>
  `;
  if (state.accountLoading && !acct) {
    overview.append(el("p", "muted", t("common.loading")));
  } else if (acct) {
    const typeLabel = acct.accountType
      ? String(acct.accountType)
      : acct.registered
        ? t("common.unknown")
        : t("account.none");
    const badgeClass = !acct.registered ? "badge warn" : acct.consumer ? "badge ok" : "badge zt";
    const grid = el("div", "state-grid account-status-grid");
    grid.innerHTML = `
      <div class="state-datum tip" data-tip="${escapeHtml(tip("accountOverview"))}" tabindex="0"><span>${t("account.accountType")}</span><strong><span class="${badgeClass}">${escapeHtml(typeLabel)}</span></strong></div>
      <div class="state-datum tip" data-tip="${escapeHtml(tip("zeroTrust"))}" tabindex="0"><span>${t("account.organization")}</span><strong>${escapeHtml(acct.organization || t("account.none"))}</strong></div>
      <div class="state-datum tip" data-tip="${escapeHtml(tip("deviceId"))}" tabindex="0"><span>${t("account.deviceId")}</span><strong>${escapeHtml(shortId(acct.deviceId))}</strong></div>
      <div class="state-datum tip" data-tip="${escapeHtml(tip("accountId"))}" tabindex="0"><span>${t("account.accountId")}</span><strong>${escapeHtml(shortId(acct.accountId))}</strong></div>
    `;
    overview.append(grid);
  }
  view.append(overview);

  const paths = el("div", "account-path-switch field-group");
  paths.innerHTML = `<label class="tip" data-tip="${escapeHtml(tip("accountOverview"))}" tabindex="0">${t("account.choosePath")}</label>`;
  const seg = el("div", "segmented account-paths");
  [
    ["free", t("account.pathFree"), tip("freePlan")],
    ["zerotrust", t("account.pathZeroTrust"), tip("zeroTrust")]
  ].forEach(([id, label, tipText]) => {
    const button = el("button", path === id ? "selected" : "", label);
    button.classList.add("tip");
    button.setAttribute("data-tip", tipText);
    button.tabIndex = 0;
    button.onclick = () => {
      state.accountPath = id;
      render();
    };
    seg.append(button);
  });
  paths.append(seg);
  view.append(paths);

  const workspace = el("div", "account-workspace");
  workspace.append(path === "zerotrust" ? zeroTrustPanel(acct) : freePlanPanel(acct));
  view.append(workspace);
  view.append(dangerPanel());

  const details = el("details", "account-raw");
  details.innerHTML = `<summary class="tip" data-tip="${escapeHtml(tip("rawOutput"))}" tabindex="0">${t("account.rawOutput")}</summary>`;
  details.append(outputPanel(t("account.registrationRaw"), state.snapshot?.commands?.registration || acct?.commands?.registration, "rawOutput"));
  details.append(outputPanel(t("account.organizationRaw"), state.snapshot?.commands?.organization || acct?.commands?.organization, "rawOutput"));
  details.append(outputPanel(t("account.devicesRaw"), state.snapshot?.commands?.devices || acct?.commands?.devices, "devices"));
  details.append(outputPanel(t("account.targetsRaw"), state.snapshot?.commands?.targets, "rawOutput"));
  view.append(details);
  return view;
}

function resolveAccountPath(acct) {
  if (state.accountPath === "free" || state.accountPath === "zerotrust") return state.accountPath;
  if (acct?.zeroTrust && !acct?.consumer) return "zerotrust";
  return "free";
}

function shortId(value) {
  if (!value) return t("account.none");
  const s = String(value);
  if (s.length <= 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function freePlanPanel(acct) {
  const panel = el("section", "panel account-section");
  panel.innerHTML = `
    <div class="panel-heading">
      <h3 class="tip" data-tip="${escapeHtml(tip("freePlan"))}" tabindex="0">${t("account.freeTitle")}</h3>
      <span>${t("account.freeHint")}</span>
    </div>
    <p class="muted">${escapeHtml(t("account.freeCopy"))}</p>
    <ol class="account-steps compact">
      <li>${escapeHtml(t("account.freeStep1"))}</li>
      <li>${escapeHtml(t("account.freeStep2"))}</li>
      <li>${escapeHtml(t("account.freeStep3"))}</li>
    </ol>
  `;

  const actions = el("div", "button-row");
  const registerBtn = el("button", "primary tip", t("account.registerFree"));
  registerBtn.setAttribute("data-tip", tip("registerFree"));
  registerBtn.onclick = () => action("register");
  actions.append(registerBtn);
  panel.append(actions);

  if (acct?.license) {
    const licenseBox = el("div", "license-box");
    const shown = state.revealLicense ? acct.license : maskLicense(acct.license);
    licenseBox.innerHTML = `
      <div class="panel-heading">
        <h4 class="tip" data-tip="${escapeHtml(tip("licenseKey"))}" tabindex="0">${t("account.yourLicense")}</h4>
        <span>${t("account.licenseHint")}</span>
      </div>
      <code class="license-value">${escapeHtml(shown)}</code>
    `;
    const row = el("div", "button-row");
    const reveal = el("button", "secondary", state.revealLicense ? t("account.hideLicense") : t("account.revealLicense"));
    reveal.onclick = () => {
      state.revealLicense = !state.revealLicense;
      render();
    };
    const copy = el("button", "secondary tip", t("account.copyLicense"));
    copy.setAttribute("data-tip", tip("copyLicense"));
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(acct.license);
        state.toast = t("account.licenseCopied");
        render();
      } catch {
        state.error = t("account.copyFailed");
        render();
      }
    };
    row.append(reveal, copy);
    licenseBox.append(row);
    panel.append(licenseBox);
  }

  const licenseForm = el("label", "input-row");
  licenseForm.innerHTML = `
    <span class="tip" data-tip="${escapeHtml(tip("applyLicense"))}" tabindex="0">${t("account.applyLicenseLabel")}</span>
    <input value="${escapeHtml(state.forms.licenseKey)}" placeholder="${escapeHtml(t("account.licensePlaceholder"))}" autocomplete="off" spellcheck="false" />
    <button class="secondary">${t("account.applyLicense")}</button>
  `;
  const licenseInput = licenseForm.querySelector("input");
  licenseInput.oninput = () => {
    state.forms.licenseKey = licenseInput.value;
  };
  licenseForm.querySelector("button").onclick = () => {
    if (!state.forms.licenseKey.trim()) return;
    action("applyLicense", state.forms.licenseKey.trim());
  };
  panel.append(licenseForm);

  if (acct?.consumer && Array.isArray(acct.devices)) {
    const devices = el("div", "devices-list");
    devices.innerHTML = `
      <div class="panel-heading">
        <h4 class="tip" data-tip="${escapeHtml(tip("devices"))}" tabindex="0">${t("account.devices")}</h4>
        <span>${acct.devices.length}</span>
      </div>
    `;
    if (!acct.devices.length) {
      devices.append(el("p", "muted", t("account.noDevices")));
    } else {
      const table = el("div", "device-table");
      acct.devices.forEach((device) => {
        const row = el("div", "device-row");
        const active = device.active ? t("account.active") : t("account.inactive");
        row.innerHTML = `
          <strong>${escapeHtml(device.name || device.model || t("account.unnamedDevice"))}</strong>
          <span>${escapeHtml(device.os || t("common.unknown"))}</span>
          <span class="${device.active ? "ok" : "muted"}">${escapeHtml(active)}</span>
          <code>${escapeHtml(shortId(device.deviceId))}</code>
        `;
        table.append(row);
      });
      devices.append(table);
    }
    panel.append(devices);
  }

  const docs = el("p", "account-docs muted");
  docs.innerHTML = `${escapeHtml(t("account.docsPrefix"))} <a href="https://developers.cloudflare.com/warp-client/get-started/linux/" target="_blank" rel="noopener noreferrer">${escapeHtml(t("account.docsLinux"))}</a>`;
  panel.append(docs);
  return panel;
}

function zeroTrustPanel(acct) {
  const panel = el("section", "panel account-section");
  panel.innerHTML = `
    <div class="panel-heading">
      <h3 class="tip" data-tip="${escapeHtml(tip("zeroTrust"))}" tabindex="0">${t("account.ztTitle")}</h3>
      <span>${t("account.ztHint")}</span>
    </div>
    <p class="muted">${escapeHtml(t("account.ztCopy"))}</p>
    <ol class="account-steps compact">
      <li>${escapeHtml(t("account.ztStep1"))}</li>
      <li>${escapeHtml(t("account.ztStep2"))}</li>
      <li>${escapeHtml(t("account.ztStep3"))}</li>
    </ol>
  `;

  const teamForm = el("label", "input-row");
  teamForm.innerHTML = `
    <span class="tip" data-tip="${escapeHtml(tip("teamName"))}" tabindex="0">${t("account.teamName")}</span>
    <input value="${escapeHtml(state.forms.organization)}" placeholder="${escapeHtml(t("account.teamPlaceholder"))}" autocomplete="off" spellcheck="false" />
    <button class="primary">${t("account.enrollTeam")}</button>
  `;
  const teamInput = teamForm.querySelector("input");
  teamInput.oninput = () => {
    state.forms.organization = teamInput.value;
  };
  teamForm.querySelector("button").onclick = () => {
    const team = state.forms.organization.trim().toLowerCase();
    if (!team) return;
    action("registerOrganization", team, null, true);
  };
  panel.append(teamForm);

  const portalRow = el("div", "button-row");
  const openPortal = el("button", "secondary tip", t("account.openPortal"));
  openPortal.setAttribute("data-tip", tip("openPortal"));
  openPortal.onclick = () => {
    const team = (acct?.organization || state.forms.organization || "").trim().toLowerCase();
    if (!team) {
      state.error = t("account.teamRequired");
      render();
      return;
    }
    window.open(`https://${encodeURIComponent(team)}.cloudflareaccess.com/warp`, "_blank", "noopener,noreferrer");
  };
  portalRow.append(openPortal);
  if (acct?.accessPortalUrl) {
    const link = el("a", "doc-link", acct.accessPortalUrl);
    link.href = acct.accessPortalUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    portalRow.append(link);
  }
  panel.append(portalRow);

  const tokenForm = el("label", "input-row token-row");
  tokenForm.innerHTML = `
    <span class="tip" data-tip="${escapeHtml(tip("authToken"))}" tabindex="0">${t("account.authToken")}</span>
    <input value="${escapeHtml(state.forms.authToken)}" placeholder="${escapeHtml(t("account.tokenPlaceholder"))}" autocomplete="off" spellcheck="false" />
    <button class="secondary">${t("account.completeToken")}</button>
  `;
  const tokenInput = tokenForm.querySelector("input");
  tokenInput.oninput = () => {
    state.forms.authToken = tokenInput.value;
  };
  tokenForm.querySelector("button").onclick = () => {
    if (!state.forms.authToken.trim()) return;
    action("registrationToken", state.forms.authToken.trim(), null, true);
  };
  panel.append(tokenForm);

  const docs = el("p", "account-docs muted");
  docs.innerHTML = `${escapeHtml(t("account.docsPrefix"))} <a href="https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/manual-deployment/" target="_blank" rel="noopener noreferrer">${escapeHtml(t("account.docsZt"))}</a>`;
  panel.append(docs);
  return panel;
}

function dangerPanel() {
  const panel = el("section", "panel account-section danger-zone");
  panel.innerHTML = `
    <div class="panel-heading">
      <h3 class="tip" data-tip="${escapeHtml(tip("dangerZone"))}" tabindex="0">${t("account.dangerTitle")}</h3>
      <span>${t("account.dangerHint")}</span>
    </div>
    <p class="muted">${escapeHtml(t("account.dangerCopy"))}</p>
  `;
  const row = el("div", "button-row");
  const rotate = el("button", "secondary tip", t("account.rotateKeys"));
  rotate.setAttribute("data-tip", tip("rotateKeys"));
  rotate.onclick = () => {
    if (!window.confirm(t("account.confirmRotate"))) return;
    action("rotateKeys");
  };
  const del = el("button", "secondary danger tip", t("account.deleteRegistration"));
  del.setAttribute("data-tip", tip("deleteRegistration"));
  del.onclick = () => {
    if (!window.confirm(t("account.confirmDelete"))) return;
    action("deleteRegistration");
  };
  row.append(rotate, del);
  panel.append(row);
  return panel;
}

function maskLicense(value) {
  const s = String(value || "");
  if (s.length < 8) return "••••••••";
  return `${s.slice(0, 4)}${"•".repeat(Math.min(12, s.length - 8))}${s.slice(-4)}`;
}

function gatewayView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Gateway DNS", "Control DNS mode, Families filtering, logging visibility, and Gateway status.", "pageGateway"));
  view.append(segmented("Families mode", families, "setFamilies", setting("Families mode"), tip("families"), familiesValueTips));
  view.append(formPanel("Gateway and fallback domains", [
    ["Gateway ID", "gatewayId", "Set Gateway ID", () => action("setGatewayId", state.forms.gatewayId, null, true), "gatewayId"],
    ["Fallback domain", "dnsFallback", "Add fallback", () => action("addDnsFallback", state.forms.dnsFallback), "dnsFallback"]
  ]));
  view.append(actionPanel("Gateway actions", [["Reset Gateway ID", "resetGatewayId", "resetGatewayId"]]));
  view.append(actionPanel("DNS logging", [
    ["Enable DNS log", "dnsLogEnable", "dnsLog"],
    ["Disable DNS log", "dnsLogDisable", "dnsLog"]
  ]));
  view.append(outputPanel("Fallback domains", state.snapshot?.commands?.dnsFallback, "dnsFallback"));
  view.append(outputPanel("DNS statistics", state.snapshot?.commands?.dnsStats, "dnsQueries"));
  view.append(outputPanel("Default fallbacks", state.snapshot?.commands?.dnsDefaultFallbacks, "dnsFallback"));
  view.append(outputPanel("Settings", state.snapshot?.commands?.settings, "pageSettings"));
  return view;
}

function tunnelView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Tunnel", "Switch WARP modes, tunnel protocols, proxy port, and virtual network.", "pageTunnel"));
  view.append(segmented("Operating mode", quickModes, "setMode", setting("Mode"), tip("mode"), modeValueTips));
  view.append(segmented("Preferred protocol", protocols, "setProtocol", setting("Tunnel protocol", "Protocol"), tip("protocol"), protocolValueTips));
  view.append(segmented("MASQUE options", masqueOptions, "setMasqueOptions", setting("HTTP Version", "MASQUE Protocol Settings"), tip("masque")));
  view.append(formPanel("Proxy and VNet", [
    ["SOCKS proxy port", "proxyPort", "Set proxy port", () => action("setProxyPort", state.forms.proxyPort), "proxyPort"],
    ["Virtual network", "vnet", "Set VNet", () => action("setVnet", state.forms.vnet), "vnet"],
    ["Endpoint IP:port", "endpoint", "Set endpoint", () => action("setEndpoint", state.forms.endpoint, null, true), "endpoint"]
  ]));
  view.append(actionPanel("Tunnel actions", [
    ["Reset protocol", "resetProtocol", "resetProtocol"],
    ["Reset MASQUE options", "resetMasqueOptions", "resetMasqueOptions"],
    ["Reset endpoint", "resetEndpoint", "resetEndpoint"]
  ]));
  view.append(outputPanel("Tunnel statistics", state.snapshot?.commands?.tunnelStats, "handshake"));
  return view;
}

function splitView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Split Tunnel", tip("splitTunnel"), "pageSplit"));
  view.append(formPanel("Routes", [
    ["IP or CIDR", "splitIp", "Add IP", () => action("addSplitIp", state.forms.splitIp), "splitIp"],
    ["Host name", "splitHost", "Add host", () => action("addSplitHost", state.forms.splitHost), "splitHost"]
  ]));
  view.append(actionPanel("Reset", [
    ["Reset IP routes", "resetSplitIps", "resetSplitIps"],
    ["Reset host routes", "resetSplitHosts", "resetSplitHosts"]
  ]));
  view.append(outputPanel("Routing dump", state.snapshot?.commands?.splitTunnelDump, "splitTunnel"));
  view.append(outputPanel("IP routes", state.snapshot?.commands?.splitTunnelIps, "splitIp"));
  view.append(outputPanel("Host routes", state.snapshot?.commands?.splitTunnelHosts, "splitHost"));
  return view;
}

function diagnosticsView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Diagnostics", "Inspect daemon health, WARP stats, network posture, and raw command output.", "pageDiagnostics"));
  view.append(metrics());
  view.append(outputPanel("Connection status", state.snapshot?.commands?.status, "liveStatus"));
  view.append(outputPanel("WARP stats", state.snapshot?.commands?.stats, "handshake"));
  view.append(outputPanel("Network", state.snapshot?.commands?.network, "networkDebug"));
  view.append(outputPanel("Posture", state.snapshot?.commands?.posture, "posture"));
  view.append(outputPanel("DEX", state.snapshot?.commands?.dex, "dex"));
  view.append(actionPanel("Identity and logs", [["Refresh Access auth", "accessReauth", "accessReauth"]]));
  view.append(outputPanel("Administrative override", state.snapshot?.commands?.override, "overrideShow"));
  view.append(outputPanel("Local network override", state.snapshot?.commands?.localNetworkOverride, "localNetworkOverride"));
  return view;
}

function settingsView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("WARP Settings", "General WARP client settings and administrative controls.", "pageSettings"));
  view.append(killSwitchPanel());
  view.append(segmented("Compliance environment", ["Normal", "FedRAMP-High"], "setEnvironment", setting("Compliance Environment"), tip("environment")));
  view.append(formPanel("Administrative override", [
    ["Override code", "overrideCode", "Apply code", () => action("overrideCode", state.forms.overrideCode, null, true), "overrideCode"],
    ["Unlock code", "overrideCode", "Unlock", () => action("overrideUnlock", state.forms.overrideCode, null, true), "overrideUnlock"]
  ]));
  view.append(actionPanel("Local network access", [
    ["Allow local network", "allowLocalNetwork", "allowLocalNetwork"],
    ["Stop local network override", "stopLocalNetworkOverride", "stopLocalNetworkOverride"]
  ]));
  view.append(actionPanel("General", [
    ["Reset environment", "environmentReset", "environmentReset"],
    ["Reset all settings", "resetSettings", "resetSettings"]
  ]));
  view.append(outputPanel("Settings list", state.snapshot?.commands?.settings, "pageSettings"));
  view.append(outputPanel("Support URL", state.snapshot?.commands?.supportUrl, "supportUrl"));
  view.append(outputPanel("Mode switch policy", state.snapshot?.commands?.modeSwitchAllowed, "modeSwitchAllowed"));
  view.append(outputPanel("MDM configs", state.snapshot?.commands?.mdm, "mdm"));
  view.append(outputPanel("Alternate network", state.snapshot?.commands?.alternateNetwork, "networkDebug"));
  return view;
}

function appView() {
  const view = el("div", "view-stack");
  view.append(pageTitle(t("app.title"), t("app.copy"), "pageApp"));

  const general = el("section", "panel");
  general.innerHTML = `<div class="panel-heading"><h3${tipMarkup("locale")}>${t("app.general")}</h3><span>locale</span></div>`;
  const localeRow = el("label", "input-row");
  localeRow.innerHTML = `<span class="tip" data-tip="${escapeHtml(tip("locale"))}" tabindex="0">${t("app.locale")}</span><select data-locale><option value="en">English</option></select><button class="secondary" data-save-locale>${t("common.save")}</button>`;
  localeRow.querySelector("[data-locale]").value = getLocale();
  localeRow.querySelector("[data-save-locale]").onclick = async () => {
    const next = localeRow.querySelector("[data-locale]").value;
    await fetch("/api/config/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { ui: { locale: next } } })
    });
    await loadLocale(next);
    render();
  };
  general.append(localeRow);

  const about = el("section", "panel");
  const version = state.version?.version || "…";
  const format = state.version?.installFormat || "…";
  about.innerHTML = `
    <div class="panel-heading"><h3${tipMarkup("pageApp")}>${t("app.about")}</h3><span>ThirdFlare One</span></div>
    <div class="state-grid">
      <div class="state-datum"><span>${t("app.currentVersion")}</span><strong>${escapeHtml(version)}</strong></div>
      <div class="state-datum"><span>${t("app.installFormat")}</span><strong>${escapeHtml(format)}</strong></div>
    </div>
  `;

  view.append(general, updatesPanel(), about);
  return view;
}

function updatesPanel() {
  const panel = el("section", "panel updates-panel");
  const channel = state.appConfig?.updates?.channel || "stable";
  const source = state.appConfig?.updates?.source || { owner: "oldrepublicwizard", repo: "thirdflare-one" };
  const owner = state.update.selectedOwner || source.owner;
  const repo = state.update.selectedRepo || source.repo;
  const result = state.update.result;
  const catalog = state.update.forks.length
    ? state.update.forks
    : [{ owner: source.owner, repo: source.repo, fullName: `${source.owner}/${source.repo}`, upstream: true, stars: null }];

  const owners = [...new Set(catalog.map((entry) => entry.owner).filter(Boolean))].sort((a, b) => {
    if (a === (state.update.upstream?.owner || source.owner)) return -1;
    if (b === (state.update.upstream?.owner || source.owner)) return 1;
    return a.localeCompare(b);
  });
  const reposForOwner = catalog
    .filter((entry) => entry.owner === owner)
    .sort((a, b) => {
      if (a.upstream) return -1;
      if (b.upstream) return 1;
      return (b.stars || 0) - (a.stars || 0) || a.repo.localeCompare(b.repo);
    });

  panel.innerHTML = `<div class="panel-heading"><h3 class="tip" data-tip="${escapeHtml(tip("checkUpdates"))}" tabindex="0">${t("app.updates")}</h3><span>${escapeHtml(`${owner}/${repo}`)}</span></div>`;

  const channelRow = el("div", "field-group");
  channelRow.innerHTML = `<label class="tip" data-tip="${escapeHtml(tip("channel"))}" tabindex="0">${t("app.channel")}</label>`;
  const channelSeg = el("div", "segmented");
  ["stable", "beta"].forEach((value) => {
    const button = el("button", channel === value ? "selected" : "", t(`app.${value}`));
    button.onclick = async () => {
      await saveUpdatePrefs({ channel: value });
      await runUpdateCheck();
    };
    channelSeg.append(button);
  });
  channelRow.append(channelSeg);

  const sourceGrid = el("div", "combo-grid");

  const ownerField = el("label", "combo-field");
  ownerField.innerHTML = `<span class="tip" data-tip="${escapeHtml(tip("sourceOwner"))}" tabindex="0">${t("app.sourceOwner")}</span>`;
  const ownerSelect = document.createElement("select");
  ownerSelect.className = "combo";
  ownerSelect.setAttribute("aria-label", t("app.sourceOwner"));
  owners.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === owner) option.selected = true;
    ownerSelect.append(option);
  });
  ownerSelect.onchange = async () => {
    state.update.selectedOwner = ownerSelect.value;
    const nextRepos = catalog.filter((entry) => entry.owner === ownerSelect.value);
    const preferred = nextRepos.find((entry) => entry.upstream) || nextRepos[0];
    state.update.selectedRepo = preferred?.repo || "";
    state.update.selectedTag = "";
    await applySelectedSource();
  };
  ownerField.append(ownerSelect);

  const repoField = el("label", "combo-field");
  repoField.innerHTML = `<span class="tip" data-tip="${escapeHtml(tip("sourceRepo"))}" tabindex="0">${t("app.sourceRepo")}</span>`;
  const repoSelect = document.createElement("select");
  repoSelect.className = "combo";
  repoSelect.setAttribute("aria-label", t("app.sourceRepo"));
  if (!reposForOwner.length) {
    const option = document.createElement("option");
    option.value = repo;
    option.textContent = repo;
    option.selected = true;
    repoSelect.append(option);
  } else {
    reposForOwner.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.repo;
      const star = entry.stars != null ? ` · ★${entry.stars}` : "";
      const mark = entry.upstream ? ` (${t("app.upstream")})` : "";
      option.textContent = `${entry.repo}${mark}${star}`;
      if (entry.repo === repo) option.selected = true;
      repoSelect.append(option);
    });
  }
  repoSelect.onchange = async () => {
    state.update.selectedRepo = repoSelect.value;
    state.update.selectedTag = "";
    await applySelectedSource();
  };
  repoField.append(repoSelect);

  const releaseField = el("label", "combo-field combo-field-wide");
  releaseField.innerHTML = `<span class="tip" data-tip="${escapeHtml(tip("release"))}" tabindex="0">${t("app.release")}</span>`;
  const releaseSelect = document.createElement("select");
  releaseSelect.className = "combo";
  releaseSelect.setAttribute("aria-label", t("app.release"));
  const channelDefault = document.createElement("option");
  channelDefault.value = "";
  channelDefault.textContent = t("app.channelDefault");
  if (!state.update.selectedTag) channelDefault.selected = true;
  releaseSelect.append(channelDefault);
  state.update.releases.forEach((release) => {
    const option = document.createElement("option");
    option.value = release.tag;
    const pre = release.prerelease ? ` · ${t("app.prerelease")}` : "";
    option.textContent = `${release.tag}${pre}`;
    if (release.tag === state.update.selectedTag) option.selected = true;
    releaseSelect.append(option);
  });
  releaseSelect.onchange = () => {
    state.update.selectedTag = releaseSelect.value;
    if (state.update.result && releaseSelect.value) {
      const release = state.update.releases.find((item) => item.tag === releaseSelect.value);
      if (release) {
        const latest = release.tag.replace(/^v/i, "");
        const current = state.update.result.current || "";
        const delta = compareLooseSemver(latest, current);
        state.update.result = {
          ...state.update.result,
          latest,
          release,
          downgrade: delta < 0,
          updateAvailable: delta > 0
        };
      }
    }
    render();
  };
  releaseField.append(releaseSelect);

  sourceGrid.append(ownerField, repoField, releaseField);

  const actions = el("div", "button-row");
  const refreshBtn = el("button", "secondary tip", t("common.refreshSources"));
  refreshBtn.setAttribute("data-tip", tip("refreshSources"));
  refreshBtn.tabIndex = 0;
  refreshBtn.onclick = () => loadUpdateCatalog({ force: true });
  const checkBtn = el("button", "primary tip", t("common.checkNow"));
  checkBtn.setAttribute("data-tip", tip("checkUpdates"));
  checkBtn.tabIndex = 0;
  checkBtn.onclick = () => runUpdateCheck();
  actions.append(refreshBtn, checkBtn);

  panel.append(channelRow, sourceGrid, actions);

  if (state.update.loadingCatalog || state.update.loadingReleases || state.update.checking) {
    panel.append(el("p", "muted", t("common.loading")));
  }

  if (result) {
    const card = el("div", "update-card");
    let statusText = t("app.upToDate");
    if (result.updateAvailable) statusText = t("app.updateAvailable", { version: result.latest });
    if (result.downgrade) statusText = t("app.downgradeWarn");
    card.innerHTML = `
      <strong>${escapeHtml(statusText)}</strong>
      <p class="update-source-line">${escapeHtml(`${result.source?.owner || owner}/${result.source?.repo || repo}`)}</p>
      <p>${escapeHtml(result.release?.name || result.latest || "")}</p>
      <pre class="release-notes">${escapeHtml((result.release?.body || "").slice(0, 1200) || t("app.releaseNotes"))}</pre>
    `;
    const cta = el("div", "button-row");
    if (result.installFormat === "appimage" && (result.updateAvailable || state.update.selectedTag)) {
      const applyBtn = el("button", "primary", t("common.apply"));
      applyBtn.onclick = () => {
        if (result.downgrade && !window.confirm("Selected release is older than the installed version. Continue?")) {
          return;
        }
        applySelectedUpdate();
      };
      cta.append(applyBtn);
    } else if (result.guidedCommands?.length) {
      const showBtn = el("button", "secondary", t("common.showCommands"));
      showBtn.onclick = () => {
        state.toast = result.guidedCommands.join("\n");
        render();
      };
      cta.append(showBtn);
    }
    card.append(cta);
    panel.append(card);
  }

  return panel;
}

function compareLooseSemver(a, b) {
  const pa = String(a).split(/[.+-]/).map((n) => Number(n) || 0);
  const pb = String(b).split(/[.+-]/).map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

async function applySelectedSource() {
  const owner = state.update.selectedOwner;
  const repo = state.update.selectedRepo;
  if (!owner || !repo) return;
  state.update.loadingReleases = true;
  state.error = null;
  render();
  try {
    const response = await fetch("/api/update/source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner, repo })
    });
    const body = await response.json();
    if (!response.ok || body.ok === false) {
      state.error = body.error || "Unable to set update source";
      state.update.loadingReleases = false;
      render();
      return;
    }
    state.appConfig = body.config;
    await loadReleases();
    await runUpdateCheck();
  } catch (error) {
    state.error = error.message;
    state.update.loadingReleases = false;
    render();
  }
}

async function saveUpdatePrefs(partial) {
  const response = await fetch("/api/config/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config: { updates: partial } })
  });
  const body = await response.json();
  state.appConfig = body.config;
}

async function loadUpdateCatalog({ force = false } = {}) {
  if (state.update.forks.length && !force) return;
  state.update.loadingCatalog = true;
  render();
  try {
    const response = await fetch("/api/update/forks");
    const body = await response.json();
    state.update.upstream = body.upstream || null;
    state.update.forks = body.forks || [];
    const source = state.appConfig?.updates?.source || body.upstream;
    state.update.selectedOwner = source?.owner || body.upstream?.owner || "";
    state.update.selectedRepo = source?.repo || body.upstream?.repo || "";
  } catch (error) {
    state.error = error.message;
  }
  state.update.loadingCatalog = false;
  render();
}

async function loadAppPanel() {
  try {
    const [versionRes, configRes] = await Promise.all([
      fetch("/api/version"),
      fetch("/api/config")
    ]);
    state.version = await versionRes.json();
    const configBody = await configRes.json();
    state.appConfig = configBody.config;
    const source = state.appConfig?.updates?.source;
    if (source) {
      state.update.selectedOwner = source.owner;
      state.update.selectedRepo = source.repo;
    }
  } catch (error) {
    state.error = error.message;
  }
  render();
  await loadUpdateCatalog();
  await loadReleases();
}

async function runUpdateCheck() {
  state.update.checking = true;
  state.error = null;
  render();
  try {
    const response = await fetch("/api/update/check");
    state.update.result = await response.json();
    if (state.update.result?.applyConfirmToken) {
      state.update.confirmToken = state.update.result.applyConfirmToken;
    }
    if (state.update.result?.source) {
      state.update.selectedOwner = state.update.result.source.owner;
      state.update.selectedRepo = state.update.result.source.repo;
    }
  } catch (error) {
    state.error = error.message;
  }
  state.update.checking = false;
  render();
}

async function loadForks() {
  await loadUpdateCatalog({ force: true });
}

async function loadReleases() {
  state.update.loadingReleases = true;
  try {
    const owner = state.update.selectedOwner;
    const repo = state.update.selectedRepo;
    const query = owner && repo ? `?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}` : "";
    const response = await fetch(`/api/update/releases${query}`);
    const body = await response.json();
    state.update.releases = body.releases || [];
  } catch (error) {
    state.error = error.message;
  }
  state.update.loadingReleases = false;
  render();
}

async function applySelectedUpdate() {
  state.busy = true;
  render();
  try {
    const tag = state.update.selectedTag || undefined;
    const prepRes = await fetch("/api/update/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag })
    });
    const prep = await prepRes.json();
    if (prep.ok === false) {
      state.error = prep.error || "Prepare failed";
      state.busy = false;
      render();
      return;
    }
    if (prep.mode === "guided") {
      state.toast = (prep.commands || []).join("\n");
      state.busy = false;
      render();
      return;
    }
    const response = await fetch("/api/update/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tag,
        confirmToken: prep.applyConfirmToken || state.update.confirmToken
      })
    });
    const body = await response.json();
    if (body.mode === "guided") {
      state.toast = (body.commands || []).join("\n");
    } else if (body.applied) {
      state.toast = t("app.restartRequired");
    } else if (body.error) {
      state.error = body.error;
    }
  } catch (error) {
    state.error = error.message;
  }
  state.busy = false;
  render();
}

async function maybeStartupUpdateCheck() {
  try {
    const configRes = await fetch("/api/config");
    const configBody = await configRes.json();
    state.appConfig = configBody.config;
    if (!configBody.config?.updates?.checkOnStartup) return;
    const response = await fetch("/api/update/check");
    const result = await response.json();
    if (result.updateAvailable) {
      state.toast = t("app.updateAvailable", { version: result.latest });
      state.update.result = result;
      render();
    }
  } catch {
    // non-blocking
  }
}

function trustedView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Trusted networks", "Automatically disable WARP on trusted Wi-Fi, Ethernet, and named SSIDs when supported by the account.", "pageTrusted"));
  view.append(formPanel("Trusted SSIDs", [
    ["SSID", "trustedSsid", "Add SSID", () => action("addTrustedSsid", state.forms.trustedSsid), "trustedSsid"]
  ], "trustedNetworks"));
  view.append(actionPanel("Network toggles", [
    ["Disable on Wi-Fi", "trustedWifiEnable", "trustedWifiEnable"],
    ["Keep on Wi-Fi", "trustedWifiDisable", "trustedWifiDisable"],
    ["Disable on Ethernet", "trustedEthernetEnable", "trustedEthernetEnable"],
    ["Keep on Ethernet", "trustedEthernetDisable", "trustedEthernetDisable"],
    ["Reset SSIDs", "resetTrustedSsids", "resetTrustedSsids"]
  ]));
  view.append(outputPanel("Trusted SSIDs", state.snapshot?.commands?.trustedSsids, "trustedSsid"));
  return view;
}

function advancedView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Advanced command center", "Run less common warp-cli commands without a shell and inspect raw output.", "pageAdvanced"));
  view.append(formPanel("Custom warp-cli arguments", [
    ["Arguments", "customCommand", "Run command", () => {
      if (!window.confirm(`Run warp-cli ${state.forms.customCommand}?`)) return;
      action("runCustom", state.forms.customCommand);
    }, "customCommand"]
  ]));
  view.append(outputPanel("Last command", state.lastAction, "rawOutput"));
  view.append(outputPanel("Certificates", state.snapshot?.commands?.certs, "certs"));
  view.append(outputPanel("Command coverage", {
    ok: true,
    code: 0,
    stdout: [
      "Mode: warp, doh, warp+doh, dot, warp+dot, proxy, tunnel_only",
      "Connection: connect, disconnect, status",
      "Registration: show, new, delete, organization, devices, license, token",
      "DNS: families, log, stats, default-fallbacks",
      "Tunnel: stats, dump, protocol, MASQUE options, endpoint, host/ip split tunnel, rotate-keys",
      "Zero Trust: vnet, MDM configs, support URL, mode switch policy, environment, overrides",
      "Trusted networks: Wi-Fi, Ethernet, SSID list/add/reset",
      "Diagnostics: stats, certs, network, posture, DEX, alternate network, Access reauth",
      "Use the custom arguments box for uncommon commands such as: debug speed-test, trusted ssid remove <name>, dns fallback remove <domain>"
    ].join("\\n")
  }, "pageAdvanced"));
  return view;
}

function parityView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Windows parity audit", "Track which Windows WARP app surfaces are covered by this Linux GUI and which still require native integration.", "pageParity"));
  view.append(parityPanel("Implemented GUI coverage", [
    ["Current connection state", "Live status stream, connect/disconnect, daemon health, tunnel/DNS metrics."],
    ["Account and registration", "Registration show/new/delete, organization, devices, license, token, key rotation."],
    ["Kill switch (nftables)", "ThirdFlare-managed output filter: lo + CloudflareWARP + Cloudflare bootstrap IPs; optional LAN allow. Uses nft/pkexec."],
    ["Gateway DNS", "Families mode, DNS logging, fallback domains, default fallbacks, Gateway ID override."],
    ["Tunnel controls", "Mode, tunnel protocol, MASQUE options, endpoint, proxy port, VNet, split tunnel routes."],
    ["Trusted networks", "SSID list/add/reset plus Wi-Fi and Ethernet disable toggles."],
    ["Zero Trust policy", "Compliance environment, MDM configs, support URL, mode-switch policy, overrides."],
    ["Diagnostics", "Stats, tunnel stats, DNS stats, certs, DEX, posture, network, alternate network."],
    ["Desktop integration", "Desktop launcher, menu entry, icon, installable web app manifest, shell cache."],
    ["Tray quick menu", "Optional yad tray menu for open, connect, disconnect, toggle, and status actions."],
    ["Notification center", "Daemon emits native desktop notifications on WARP connect/disconnect via notify-send (ui.notifications)."]
  ], "done"));
  view.append(parityPanel("Remaining native gaps", [
    ["First-class tray packaging", "The yad tray works when available; a bundled AppIndicator/Electron/Tauri tray still needs native packaging."],
    ["Native packaging", "Needs Electron, Tauri, WebKitGTK, or distro packages for a self-contained app."],
    ["Official Always On CLI", "Linux warp-cli has no public Always On / lock switch; ThirdFlare uses nftables instead of the Windows-native toggle."],
    ["Privileged flows", "Kill switch and some policy commands may need polkit/pkexec when the daemon is unprivileged."],
    ["Exact Windows visuals", "The shell is Windows-like, but not a pixel clone of the proprietary Windows client."]
  ], "gap"));
  return view;
}

function parityPanel(title, items, kind) {
  const panel = el("section", "panel parity-panel");
  panel.innerHTML = `<div class="panel-heading"><h3>${title}</h3><span>${items.length} items</span></div>`;
  const list = el("div", "parity-list");
  items.forEach(([label, copy]) => {
    list.append(el("div", `parity-item ${kind}`, `<span>${kind === "done" ? "✓" : "!"}</span><div><strong>${label}</strong><p>${copy}</p></div>`));
  });
  panel.append(list);
  return panel;
}

function actionPanel(title, actions, titleTipKey = "") {
  const panel = el("section", "panel action-panel");
  panel.innerHTML = `<div class="panel-heading"><h3${tipMarkup(titleTipKey)}>${title}</h3><span>warp-cli actions</span></div>`;
  const row = el("div", "button-row");
  actions.forEach(([label, actionName, tipKey]) => {
    const risky = /delete|reset|rotate|allow|stop|trusted|environment|unlock|override/i.test(actionName);
    const button = el("button", risky ? "secondary danger" : "secondary", label);
    if (tipKey) applyTip(button, tipKey);
    button.onclick = () => {
      if (risky && !window.confirm(`Run warp-cli action: ${label}?`)) return;
      action(actionName);
    };
    row.append(button);
  });
  panel.append(row);
  return panel;
}

function formPanel(title, fields, titleTipKey = "") {
  const panel = el("section", "panel form-panel");
  panel.innerHTML = `<div class="panel-heading"><h3${tipMarkup(titleTipKey)}>${title}</h3><span>editable values</span></div>`;
  fields.forEach(([label, key, buttonLabel, onSubmit, tipKey]) => {
    const row = el("label", "input-row");
    row.innerHTML = `<span${tipMarkup(tipKey)}>${label}</span><input value="${escapeHtml(state.forms[key])}" /><button class="secondary">${buttonLabel}</button>`;
    const input = row.querySelector("input");
    input.oninput = () => {
      state.forms[key] = input.value;
    };
    row.querySelector("button").onclick = onSubmit;
    panel.append(row);
  });
  return panel;
}

function outputPanel(title, result, tipKey = "") {
  const panel = el("section", "panel output-panel");
  const ok = result?.ok;
  const output = result ? (result.stdout || result.stderr || "No output.") : "No command has run yet.";
  panel.innerHTML = `
    <div class="panel-heading">
      <h3${tipMarkup(tipKey)}>${title}</h3>
      <span class="${ok ? "ok" : "fail"}">${result ? (ok ? "ok" : `exit ${result.code ?? "error"}`) : "waiting"}</span>
    </div>
    <pre>${escapeHtml(output)}</pre>
  `;
  return panel;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function contentScrollEl() {
  return app.querySelector(".content");
}

function captureScroll() {
  const content = contentScrollEl();
  return {
    contentTop: content ? content.scrollTop : 0,
    contentLeft: content ? content.scrollLeft : 0
  };
}

function restoreScroll(saved) {
  if (!saved) return;
  const apply = () => {
    const content = contentScrollEl();
    if (!content) return;
    content.scrollTop = saved.contentTop;
    content.scrollLeft = saved.contentLeft;
  };
  apply();
  requestAnimationFrame(apply);
}

function patchLiveChrome() {
  const pill = app.querySelector(".live-pill");
  if (pill) {
    pill.classList.toggle("online", state.live.connected);
    pill.classList.toggle("offline", !state.live.connected);
    const label = state.live.connected ? t("common.live") : t("common.polling");
    const textNode = [...pill.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = label;
    else {
      const span = pill.querySelector("span");
      pill.textContent = "";
      if (span) pill.append(span);
      pill.append(document.createTextNode(label));
    }
  }

  if (state.view !== "home" || !state.snapshot) return;

  const orb = app.querySelector(".status-orb");
  if (orb) orb.className = `status-orb ${statusKind()}`;

  const statusLabel = app.querySelector(".status-label");
  if (statusLabel) statusLabel.textContent = statusText();

  applyConnectionToggle(app.querySelector("[data-connection-toggle]"));

  const liveDatum = [...app.querySelectorAll(".state-datum")].find((node) => {
    const label = node.querySelector("span");
    return label && label.textContent === "Live event";
  });
  if (liveDatum) {
    const strong = liveDatum.querySelector("strong");
    if (strong) strong.textContent = String(state.live.lastLine || "Waiting").slice(0, 96);
  }

  const eventMeta = app.querySelector(".state-panel .panel-heading span");
  if (eventMeta && state.live.lastEvent) {
    eventMeta.textContent = `event ${new Date(state.live.lastEvent).toLocaleTimeString()}`;
  }
}

function statusFingerprint(status) {
  if (!status) return "";
  return [
    status.connected ? "1" : "0",
    status.connecting ? "1" : "0",
    status.disconnected ? "1" : "0",
    status.registrationMissing ? "1" : "0",
    status.label || ""
  ].join(":");
}

function render() {
  const scroll = captureScroll();
  const previousView = render.lastView;
  app.innerHTML = "";
  app.append(shell());
  if (state.busy) app.append(el("div", "busy", "Running warp-cli command..."));
  if (state.error) app.append(el("div", "toast", escapeHtml(state.error)));
  if (state.toast) {
    const toast = el("div", "toast info", `<pre>${escapeHtml(state.toast)}</pre><button class="ghost" data-dismiss>Dismiss</button>`);
    toast.querySelector("[data-dismiss]").onclick = () => {
      state.toast = null;
      render();
    };
    app.append(toast);
  }
  const stack = app.querySelector(".view-stack");
  if (stack && previousView !== state.view) {
    stack.classList.add("enter");
  }
  render.lastView = state.view;
  restoreScroll(scroll);
}
render.lastView = null;

async function boot() {
  let locale = "en";
  try {
    const configRes = await fetch("/api/config");
    const configBody = await configRes.json();
    state.appConfig = configBody.config;
    locale = configBody.config?.ui?.locale || "en";
  } catch {
    // defaults
  }
  await loadLocale(locale);
  state.killswitch.desired = Boolean(state.appConfig?.warp?.killSwitch);
  state.killswitch.allowLan = Boolean(state.appConfig?.warp?.killSwitchAllowLan);
  render();
  await refresh();
  connectLiveEvents();
  registerServiceWorker();
  setInterval(() => refresh({ silent: true }), 20000);
  maybeStartupUpdateCheck();
}

boot();

function connectLiveEvents() {
  if (!window.EventSource) {
    state.live.label = "Live status unavailable";
    return;
  }

  const events = new EventSource("/api/events");

  events.addEventListener("ready", () => {
    state.live.connected = true;
    state.live.label = "Live status connected";
    state.live.lastEvent = Date.now();
    patchLiveChrome();
  });

  events.addEventListener("warp", (event) => {
    const data = JSON.parse(event.data);
    const before = statusFingerprint(state.snapshot?.status);
    state.live.connected = true;
    state.live.lastEvent = Date.now();
    state.live.lastLine = data.line || "";
    if (
      data.status
      && state.snapshot
      && (data.status.connected || data.status.connecting || data.status.disconnected || data.status.registrationMissing)
    ) {
      state.snapshot.status = data.status;
    }
    const after = statusFingerprint(state.snapshot?.status);
    const statusChanged = before !== after;

    // Avoid full DOM rebuilds on every status line — those reset scroll / steal focus.
    if (statusChanged && state.view === "home" && !hasFocusedField()) {
      render();
    } else {
      patchLiveChrome();
    }

    if (statusChanged) {
      window.clearTimeout(connectLiveEvents.refreshTimer);
      connectLiveEvents.refreshTimer = window.setTimeout(() => refresh({ silent: true }), 2000);
    }
  });

  events.addEventListener("error", (event) => {
    state.live.failures += 1;
    state.live.connected = false;
    if (event.data) {
      try {
        const data = JSON.parse(event.data);
        state.live.lastLine = data.line || state.live.lastLine;
      } catch {
        state.live.lastLine = state.live.lastLine || "Live status stream error";
      }
    }
    patchLiveChrome();
  });

  events.addEventListener("closed", () => {
    state.live.connected = false;
    state.live.label = "Live status closed";
    patchLiveChrome();
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Service worker support is best-effort; warp-cli state still requires the local server.
    });
  });
}
