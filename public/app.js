import { loadLocale, t, tip, getLocale } from "./i18n.js";

const navItems = [
  ["home", "nav.home", "⌂"],
  ["account", "nav.account", "◎"],
  ["gateway", "nav.gateway", "◇"],
  ["tunnel", "nav.tunnel", "↔"],
  ["split", "nav.split", "⌁"],
  ["trusted", "nav.trusted", "⌁"],
  ["diagnostics", "nav.diagnostics", "◷"],
  ["settings", "nav.settings", "⚙"],
  ["app", "nav.app", "✦"],
  ["parity", "nav.parity", "✓"],
  ["advanced", "nav.advanced", "⌘"]
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
    customCommand: "status"
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

function el(tag, className, html = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.innerHTML = html;
  return node;
}

async function refresh() {
  state.error = null;
  render();
  try {
    const response = await fetch("/api/snapshot");
    state.snapshot = await response.json();
  } catch (error) {
    state.error = error.message;
  }
  render();
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
  navItems.forEach(([id, labelKey, icon]) => {
    const button = el("button", `nav-item ${state.view === id ? "active" : ""}`);
    button.innerHTML = `<span class="nav-icon">${icon}</span><span>${t(labelKey)}</span>`;
    button.onclick = () => {
      state.view = id;
      render();
      if (id === "app") loadAppPanel();
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

function pageTitle(title, copy) {
  return el("div", "page-title", `<h1>${title}</h1><p>${copy}</p>`);
}

function homeView() {
  const grid = el("div", "view-stack");
  grid.append(pageTitle(t("home.title"), t("home.copy")));

  const layout = el("div", "home-grid");
  const primary = el("section", "hero-panel panel");
  primary.innerHTML = `
    <div class="status-orb ${statusKind()}"><span></span></div>
    <div class="hero-copy">
      <div class="status-label">${statusText()}</div>
      <h2>${state.snapshot?.daemon?.available ? t("home.tunnelControls") : t("home.daemonMissing")}</h2>
      <p>${state.snapshot?.daemon?.message || t("common.loading")}</p>
    </div>
    <div class="hero-actions">
      <button class="primary tip" data-action="connect" data-tip="${escapeHtml(tip("connect"))}" tabindex="0">${t("common.connect")}</button>
      <button class="secondary tip" data-action="disconnect" data-tip="${escapeHtml(tip("disconnect"))}" tabindex="0">${t("common.disconnect")}</button>
    </div>
  `;
  primary.querySelector('[data-action="connect"]').onclick = () => action("connect");
  primary.querySelector('[data-action="disconnect"]').onclick = () => action("disconnect");

  const quick = el("section", "panel quick-panel");
  quick.innerHTML = `<div class="panel-heading"><h3>${t("home.quickSettings")}</h3><span>${t("home.quickHint")}</span></div>`;
  quick.append(segmented(t("home.mode"), quickModes, "setMode", setting("Mode"), tip("mode")));
  quick.append(segmented(t("home.protocol"), protocols, "setProtocol", setting("Tunnel protocol", "Protocol"), tip("protocol")));
  quick.append(segmented(t("home.families"), families, "setFamilies", setting("Families mode", "DNS families"), tip("families")));

  layout.append(primary, quick);
  grid.append(layout, metrics(), liveStatePanel(), outputPanel("Last command", state.lastAction));
  return grid;
}

function segmented(label, values, actionName, current, tipText = "") {
  const wrap = el("div", "field-group");
  const tipAttr = tipText ? ` class="tip" data-tip="${escapeHtml(tipText)}" tabindex="0"` : "";
  wrap.innerHTML = `<label${tipAttr}>${label}</label>`;
  const row = el("div", "segmented");
  values.forEach((value) => {
    const button = el("button", current?.toLowerCase?.() === value.toLowerCase() ? "selected" : "", value);
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
    ["Mode", setting("Mode")],
    ["Protocol", tunnel.protocol || setting("Tunnel protocol", "Protocol")],
    ["Latency", tunnel.latency || "Unknown"],
    ["Traffic", tunnel.sent && tunnel.received ? `${tunnel.sent} up / ${tunnel.received} down` : "Unknown"],
    ["DNS", dns.success ? `${dns.success} success` : "Unknown"],
    ["Generated", state.snapshot ? new Date(state.snapshot.generatedAt).toLocaleTimeString() : "Pending"]
  ];
  const row = el("section", "metrics-row");
  items.forEach(([label, value]) => {
    row.append(el("div", "metric", `<span>${label}</span><strong>${escapeHtml(String(value)).slice(0, 80)}</strong>`));
  });
  return row;
}

function liveStatePanel() {
  const tunnel = state.snapshot?.parsed?.tunnel || {};
  const dns = state.snapshot?.parsed?.dns || {};
  const panel = el("section", "panel state-panel");
  panel.innerHTML = `
    <div class="panel-heading">
      <h3>Current State</h3>
      <span>${state.live.lastEvent ? `event ${new Date(state.live.lastEvent).toLocaleTimeString()}` : "snapshot"}</span>
    </div>
    <div class="state-grid">
      ${stateDatum("Colo", tunnel.colo || "Unknown")}
      ${stateDatum("Handshake", tunnel.handshakeAge || "Unknown")}
      ${stateDatum("Loss", tunnel.loss || "Unknown")}
      ${stateDatum("DNS queries", dns.queries || "Unknown")}
      ${stateDatum("DNS avg", dns.averageDuration || "Unknown")}
      ${stateDatum("Live event", state.live.lastLine || "Waiting")}
      ${stateDatum("VNet", commandText("vnet"))}
    </div>
  `;
  return panel;
}

function stateDatum(label, value) {
  return `<div class="state-datum"><span>${label}</span><strong>${escapeHtml(String(value)).slice(0, 96)}</strong></div>`;
}

function accountView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Account and enrollment", "Register this device, inspect organization state, and manage account binding."));
  view.append(actionPanel("Registration", [
    ["Register device", "register"],
    ["Delete registration", "deleteRegistration"],
    ["Rotate tunnel keys", "rotateKeys"]
  ]));
  view.append(outputPanel("Registration", state.snapshot?.commands?.registration));
  view.append(outputPanel("Organization", state.snapshot?.commands?.organization));
  view.append(outputPanel("Targets", state.snapshot?.commands?.targets));
  return view;
}

function gatewayView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Gateway DNS", "Control DNS mode, Families filtering, logging visibility, and Gateway status."));
  view.append(segmented("Families mode", families, "setFamilies", setting("Families mode")));
  view.append(formPanel("Gateway and fallback domains", [
    ["Gateway ID", "gatewayId", "Set Gateway ID", () => action("setGatewayId", state.forms.gatewayId, null, true)],
    ["Fallback domain", "dnsFallback", "Add fallback", () => action("addDnsFallback", state.forms.dnsFallback)]
  ]));
  view.append(actionPanel("Gateway actions", [["Reset Gateway ID", "resetGatewayId"]]));
  view.append(actionPanel("DNS logging", [["Enable DNS log", "dnsLogEnable"], ["Disable DNS log", "dnsLogDisable"]]));
  view.append(outputPanel("Fallback domains", state.snapshot?.commands?.dnsFallback));
  view.append(outputPanel("DNS statistics", state.snapshot?.commands?.dnsStats));
  view.append(outputPanel("Default fallbacks", state.snapshot?.commands?.dnsDefaultFallbacks));
  view.append(outputPanel("Settings", state.snapshot?.commands?.settings));
  return view;
}

function tunnelView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Tunnel", "Switch WARP modes, tunnel protocols, proxy port, and virtual network."));
  view.append(segmented("Operating mode", quickModes, "setMode", setting("Mode"), tip("mode")));
  view.append(segmented("Preferred protocol", protocols, "setProtocol", setting("Tunnel protocol", "Protocol"), tip("protocol")));
  view.append(segmented("MASQUE options", masqueOptions, "setMasqueOptions", setting("HTTP Version", "MASQUE Protocol Settings"), tip("masque")));
  view.append(formPanel("Proxy and VNet", [
    ["SOCKS proxy port", "proxyPort", "Set proxy port", () => action("setProxyPort", state.forms.proxyPort)],
    ["Virtual network", "vnet", "Set VNet", () => action("setVnet", state.forms.vnet)],
    ["Endpoint IP:port", "endpoint", "Set endpoint", () => action("setEndpoint", state.forms.endpoint, null, true)]
  ]));
  view.append(actionPanel("Tunnel actions", [["Reset protocol", "resetProtocol"], ["Reset MASQUE options", "resetMasqueOptions"], ["Reset endpoint", "resetEndpoint"]]));
  view.append(outputPanel("Tunnel statistics", state.snapshot?.commands?.tunnelStats));
  return view;
}

function splitView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Split Tunnel", tip("splitTunnel")));
  view.append(formPanel("Routes", [
    ["IP or CIDR", "splitIp", "Add IP", () => action("addSplitIp", state.forms.splitIp)],
    ["Host name", "splitHost", "Add host", () => action("addSplitHost", state.forms.splitHost)]
  ]));
  view.append(actionPanel("Reset", [["Reset IP routes", "resetSplitIps"], ["Reset host routes", "resetSplitHosts"]]));
  view.append(outputPanel("Routing dump", state.snapshot?.commands?.splitTunnelDump));
  view.append(outputPanel("IP routes", state.snapshot?.commands?.splitTunnelIps));
  view.append(outputPanel("Host routes", state.snapshot?.commands?.splitTunnelHosts));
  return view;
}

function diagnosticsView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Diagnostics", "Inspect daemon health, WARP stats, network posture, and raw command output."));
  view.append(metrics());
  view.append(outputPanel("Connection status", state.snapshot?.commands?.status));
  view.append(outputPanel("WARP stats", state.snapshot?.commands?.stats));
  view.append(outputPanel("Network", state.snapshot?.commands?.network));
  view.append(outputPanel("Posture", state.snapshot?.commands?.posture));
  view.append(outputPanel("DEX", state.snapshot?.commands?.dex));
  view.append(actionPanel("Identity and logs", [["Refresh Access auth", "accessReauth"]]));
  view.append(outputPanel("Administrative override", state.snapshot?.commands?.override));
  view.append(outputPanel("Local network override", state.snapshot?.commands?.localNetworkOverride));
  return view;
}

function settingsView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("WARP Settings", "General WARP client settings and administrative controls."));
  view.append(segmented("Compliance environment", ["Normal", "FedRAMP-High"], "setEnvironment", setting("Compliance Environment")));
  view.append(formPanel("Administrative override", [
    ["Override code", "overrideCode", "Apply code", () => action("overrideCode", state.forms.overrideCode, null, true)],
    ["Unlock code", "overrideCode", "Unlock", () => action("overrideUnlock", state.forms.overrideCode, null, true)]
  ]));
  view.append(actionPanel("Local network access", [["Allow local network", "allowLocalNetwork"], ["Stop local network override", "stopLocalNetworkOverride"]]));
  view.append(actionPanel("General", [["Reset environment", "environmentReset"], ["Reset all settings", "resetSettings"]]));
  view.append(outputPanel("Settings list", state.snapshot?.commands?.settings));
  view.append(outputPanel("Support URL", state.snapshot?.commands?.supportUrl));
  view.append(outputPanel("Mode switch policy", state.snapshot?.commands?.modeSwitchAllowed));
  view.append(outputPanel("MDM configs", state.snapshot?.commands?.mdm));
  view.append(outputPanel("Alternate network", state.snapshot?.commands?.alternateNetwork));
  return view;
}

function appView() {
  const view = el("div", "view-stack");
  view.append(pageTitle(t("app.title"), t("app.copy")));

  const general = el("section", "panel");
  general.innerHTML = `<div class="panel-heading"><h3>${t("app.general")}</h3><span>locale</span></div>`;
  const localeRow = el("label", "input-row");
  localeRow.innerHTML = `<span>${t("app.locale")}</span><select data-locale><option value="en">English</option></select><button class="secondary" data-save-locale>${t("common.save")}</button>`;
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
    <div class="panel-heading"><h3>${t("app.about")}</h3><span>ThirdFlare One</span></div>
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

  panel.innerHTML = `<div class="panel-heading"><h3>${t("app.updates")}</h3><span>${escapeHtml(`${owner}/${repo}`)}</span></div>`;

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
  view.append(pageTitle("Trusted networks", "Automatically disable WARP on trusted Wi-Fi, Ethernet, and named SSIDs when supported by the account."));
  view.append(formPanel("Trusted SSIDs", [
    ["SSID", "trustedSsid", "Add SSID", () => action("addTrustedSsid", state.forms.trustedSsid)]
  ]));
  view.append(actionPanel("Network toggles", [
    ["Disable on Wi-Fi", "trustedWifiEnable"],
    ["Keep on Wi-Fi", "trustedWifiDisable"],
    ["Disable on Ethernet", "trustedEthernetEnable"],
    ["Keep on Ethernet", "trustedEthernetDisable"],
    ["Reset SSIDs", "resetTrustedSsids"]
  ]));
  view.append(outputPanel("Trusted SSIDs", state.snapshot?.commands?.trustedSsids));
  return view;
}

function advancedView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Advanced command center", "Run less common warp-cli commands without a shell and inspect raw output."));
  view.append(formPanel("Custom warp-cli arguments", [
    ["Arguments", "customCommand", "Run command", () => {
      if (!window.confirm(`Run warp-cli ${state.forms.customCommand}?`)) return;
      action("runCustom", state.forms.customCommand);
    }]
  ]));
  view.append(outputPanel("Last command", state.lastAction));
  view.append(outputPanel("Certificates", state.snapshot?.commands?.certs));
  view.append(outputPanel("Command coverage", {
    ok: true,
    code: 0,
    stdout: [
      "Mode: warp, doh, warp+doh, dot, warp+dot, proxy, tunnel_only",
      "Connection: connect, disconnect, status",
      "Registration: show, new, delete, organization, targets",
      "DNS: families, log, stats, default-fallbacks",
      "Tunnel: stats, dump, protocol, MASQUE options, endpoint, host/ip split tunnel, rotate-keys",
      "Zero Trust: vnet, MDM configs, support URL, mode switch policy, environment, overrides",
      "Trusted networks: Wi-Fi, Ethernet, SSID list/add/reset",
      "Diagnostics: stats, certs, network, posture, DEX, alternate network, Access reauth",
      "Use the custom arguments box for uncommon commands such as: debug speed-test, trusted ssid remove <name>, dns fallback remove <domain>"
    ].join("\\n")
  }));
  return view;
}

function parityView() {
  const view = el("div", "view-stack");
  view.append(pageTitle("Windows parity audit", "Track which Windows WARP app surfaces are covered by this Linux GUI and which still require native integration."));
  view.append(parityPanel("Implemented GUI coverage", [
    ["Current connection state", "Live status stream, connect/disconnect, daemon health, tunnel/DNS metrics."],
    ["Account and registration", "Registration show/new/delete, organization, target listing, key rotation."],
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
    ["Privileged flows", "Endpoint and policy-changing commands may need a privilege broker/polkit flow."],
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

function actionPanel(title, actions) {
  const panel = el("section", "panel action-panel");
  panel.innerHTML = `<div class="panel-heading"><h3>${title}</h3><span>warp-cli actions</span></div>`;
  const row = el("div", "button-row");
  actions.forEach(([label, actionName]) => {
    const risky = /delete|reset|rotate|allow|stop|trusted|environment|unlock|override/i.test(actionName);
    const button = el("button", risky ? "secondary danger" : "secondary", label);
    button.onclick = () => {
      if (risky && !window.confirm(`Run warp-cli action: ${label}?`)) return;
      action(actionName);
    };
    row.append(button);
  });
  panel.append(row);
  return panel;
}

function formPanel(title, fields) {
  const panel = el("section", "panel form-panel");
  panel.innerHTML = `<div class="panel-heading"><h3>${title}</h3><span>editable values</span></div>`;
  fields.forEach(([label, key, buttonLabel, onSubmit]) => {
    const row = el("label", "input-row");
    row.innerHTML = `<span>${label}</span><input value="${escapeHtml(state.forms[key])}" /><button class="secondary">${buttonLabel}</button>`;
    const input = row.querySelector("input");
    input.oninput = () => {
      state.forms[key] = input.value;
    };
    row.querySelector("button").onclick = onSubmit;
    panel.append(row);
  });
  return panel;
}

function outputPanel(title, result) {
  const panel = el("section", "panel output-panel");
  const ok = result?.ok;
  const output = result ? (result.stdout || result.stderr || "No output.") : "No command has run yet.";
  panel.innerHTML = `
    <div class="panel-heading">
      <h3>${title}</h3>
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

function render() {
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
}

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
  render();
  await refresh();
  connectLiveEvents();
  registerServiceWorker();
  setInterval(refresh, 20000);
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
    render();
  });

  events.addEventListener("warp", (event) => {
    const data = JSON.parse(event.data);
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
    render();
    window.clearTimeout(connectLiveEvents.refreshTimer);
    connectLiveEvents.refreshTimer = window.setTimeout(refresh, 750);
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
    render();
  });

  events.addEventListener("closed", () => {
    state.live.connected = false;
    state.live.label = "Live status closed";
    render();
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
