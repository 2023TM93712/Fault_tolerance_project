// frontend/app.js

const GATEWAY_BASE = "http://localhost:9002";

// Global state
let gSensors = [];
let gSelectedSensor = null;

let tempChart, vibChart, battChart;

document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initCharts();
  initButtons();
  loadSensors();
});

// ---------------------- HEADER ----------------------

function initHeader() {
  const user = localStorage.getItem("username") || "demo_user";
  const role = localStorage.getItem("role") || "user";

  const uEl = document.getElementById("header-username");
  const rEl = document.getElementById("header-role");

  if (uEl) uEl.textContent = user;
  if (rEl) {
    rEl.textContent = role;
    rEl.classList.toggle("pill-admin", role === "admin");
  }

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.clear();
      window.location.href = "index.html";
    });
  }
}

// ---------------------- CHARTS ----------------------

function makeLineChart(ctx, label) {
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label,
          data: [],
          tension: 0.2,
          pointRadius: 2,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { autoSkip: true, maxTicksLimit: 6 },
          grid: { display: false }
        },
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

function initCharts() {
  const tCtx = document.getElementById("tempChart").getContext("2d");
  const vCtx = document.getElementById("vibChart").getContext("2d");
  const bCtx = document.getElementById("battChart").getContext("2d");

  tempChart = makeLineChart(tCtx, "Temperature");
  vibChart = makeLineChart(vCtx, "Vibration");
  battChart = makeLineChart(bCtx, "Battery");
}

function clearCharts() {
  [tempChart, vibChart, battChart].forEach((chart) => {
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  });
}

// ---------------------- BUTTONS / COMMANDS ----------------------

function initButtons() {
  const refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", loadSensors);

  const btns = [
    { id: "btn-commission", action: () => commandNotWired("Commission") },
    { id: "btn-decommission", action: () => commandNotWired("Decommission") },
    { id: "btn-recover", action: () => commandNotWired("Recover") },
    { id: "btn-fault", action: () => commandNotWired("Inject fault") },
    { id: "btn-test-alert", action: () => commandNotWired("Test alert") }
  ];

  btns.forEach(({ id, action }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", action);
      el.disabled = true;
    }
  });
}

function commandNotWired(label) {
  setCommandStatus(
    `${label} clicked (backend REST not wired in this version).`,
    "info"
  );
}

function enableCommandButtons(enabled) {
  [
    "btn-commission",
    "btn-decommission",
    "btn-recover",
    "btn-fault",
    "btn-test-alert"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

function setCommandStatus(msg, level = "info") {
  const el = document.getElementById("command-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "command-status";
  el.classList.add(`command-status-${level}`);
}

// ---------------------- SENSORS ----------------------

async function loadSensors() {
  const errorEl = document.getElementById("sensor-error");
  const listEl = document.getElementById("sensor-list");
  const countEl = document.getElementById("sensor-count");
  const activeEl = document.getElementById("summary-active");
  const faultsEl = document.getElementById("summary-faults");

  if (errorEl) errorEl.style.display = "none";
  if (listEl) listEl.innerHTML = "<div class='loading-row'>Loading…</div>";
  if (countEl) countEl.textContent = "Loading sensors…";

  const user = localStorage.getItem("username") || "demo_user";
  const role = localStorage.getItem("role") || "user";
  const isAdmin = role === "admin";

  try {
    const params = new URLSearchParams({ user });
    if (isAdmin) params.append("admin", "1");

    const resp = await fetch(
      `${GATEWAY_BASE}/sensors?${params.toString()}`
    );

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    gSensors = Array.isArray(data) ? data : [];

    renderSensorList();

    if (countEl) countEl.textContent = `${gSensors.length} sensors`;
    const active = gSensors.filter((s) => s.status === "commissioned").length;
    const faults = gSensors.filter((s) => s.status === "fault").length;
    if (activeEl) activeEl.textContent = active;
    if (faultsEl) faultsEl.textContent = faults;

    // auto-select first sensor
    if (gSensors.length > 0) {
      selectSensor(gSensors[0].uuid);
    } else {
      gSelectedSensor = null;
      clearCharts();
      updateChartInfoNoSensor();
    }
  } catch (err) {
    console.error("Failed to load sensors", err);
    if (errorEl) errorEl.style.display = "block";
    if (listEl) {
      listEl.innerHTML =
        "<div class='error-row'>Failed to load sensors from gateway.</div>";
    }
    if (countEl) countEl.textContent = "0 sensors";
    gSensors = [];
    gSelectedSensor = null;
    clearCharts();
    updateChartInfoNoSensor();
  }
}

function renderSensorList() {
  const listEl = document.getElementById("sensor-list");
  if (!listEl) return;

  if (gSensors.length === 0) {
    listEl.innerHTML =
      "<div class='empty-row'>No sensors available for this user.</div>";
    return;
  }

  listEl.innerHTML = "";

  gSensors.forEach((s) => {
    const card = document.createElement("button");
    card.className = "sensor-card";

    if (gSelectedSensor === s.uuid) {
      card.classList.add("sensor-card-selected");
    }

    const status = s.status || "unknown";
    const alert = s.alert || 0;
    const adv = s.adv ?? s.advertising_interval_sec ?? "-";

    const statusClass =
      status === "commissioned"
        ? "status-pill-ok"
        : status === "fault"
        ? "status-pill-fault"
        : "status-pill-pending";

    const alertBadge =
      alert && Number(alert) > 0
        ? `<span class="badge badge-alert">ALERT</span>`
        : "";

    card.innerHTML = `
      <div class="sensor-card-main">
        <div class="sensor-id">${s.uuid}</div>
        <div class="sensor-sub">
          <span class="status-pill ${statusClass}">${status}</span>
          ${alertBadge}
        </div>
      </div>
      <div class="sensor-card-meta">
        <span>Adv: ${adv}s</span>
        <span>Config: ${
          s.config_time ? new Date(s.config_time * 1000).toLocaleTimeString() : "-"
        }</span>
      </div>
    `;

    card.addEventListener("click", () => {
      selectSensor(s.uuid);
    });

    listEl.appendChild(card);
  });
}

function selectSensor(uuid) {
  gSelectedSensor = uuid;

  // highlight selection
  const cards = document.querySelectorAll(".sensor-card");
  cards.forEach((c) => {
    if (c.querySelector(".sensor-id")?.textContent === uuid) {
      c.classList.add("sensor-card-selected");
    } else {
      c.classList.remove("sensor-card-selected");
    }
  });

  const label = document.getElementById("selected-sensor-label");
  if (label) label.textContent = `Selected: ${uuid}`;

  const chartLabel = document.getElementById("chart-sensor-label");
  if (chartLabel) chartLabel.textContent = `Telemetry for ${uuid}`;

  enableCommandButtons(true);
  setCommandStatus("", "info");

  loadReadings(uuid);
}

// ---------------------- READINGS / CHART DATA ----------------------

async function loadReadings(uuid) {
  if (!uuid) return;

  clearCharts();
  updateChartInfoLoading(uuid);

  try {
    const resp = await fetch(
      `${GATEWAY_BASE}/readings?uuid=${encodeURIComponent(uuid)}`
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    const readings = Array.isArray(data) ? data : [];

    if (readings.length === 0) {
      updateChartInfoNoData(uuid);
      updateSummaryFromReadings(null);
      return;
    }

    const labels = [];
    const temps = [];
    const vibs = [];
    const batts = [];

    readings.forEach((r) => {
      const ts = r.timestamp ?? r.ts;
      const t = r.temperature ?? r.temp;
      const v = r.vibration ?? r.vib;
      const b = r.battery ?? r.batt;

      labels.push(
        ts ? new Date(ts * 1000).toLocaleTimeString() : labels.length + 1
      );
      temps.push(typeof t === "number" ? t : null);
      vibs.push(typeof v === "number" ? v : null);
      batts.push(typeof b === "number" ? b : null);
    });

    updateLineChart(tempChart, labels, temps);
    updateLineChart(vibChart, labels, vibs);
    updateLineChart(battChart, labels, batts);

    updateChartInfoOk(uuid, readings);
    updateSummaryFromReadings(readings[0]);
  } catch (err) {
    console.error("Failed to load readings", err);
    updateChartInfoError(uuid);
    updateSummaryFromReadings(null);
  }
}

function updateLineChart(chart, labels, data) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

function updateSummaryFromReadings(latest) {
  const tEl = document.getElementById("summary-temp");
  const bEl = document.getElementById("summary-batt");

  if (!latest) {
    if (tEl) tEl.textContent = "-";
    if (bEl) bEl.textContent = "-";
    return;
  }

  const t = latest.temperature ?? latest.temp;
  const b = latest.battery ?? latest.batt;

  if (tEl) tEl.textContent = t != null ? `${t.toFixed(1)} °C` : "-";
  if (bEl) bEl.textContent = b != null ? `${b}%` : "-";
}

// ---------------------- CHART INFO MESSAGES ----------------------

function updateChartInfoNoSensor() {
  const el = document.getElementById("chart-info");
  if (!el) return;
  el.innerHTML =
    "<div class='chart-info-empty'>No sensors available. Once sensors are provisioned for your account, they will appear here.</div>";
}

function updateChartInfoLoading(uuid) {
  const el = document.getElementById("chart-info");
  if (!el) return;
  el.innerHTML = `<div class='chart-info-loading'>Loading telemetry for <strong>${uuid}</strong>…</div>`;
}

function updateChartInfoNoData(uuid) {
  const el = document.getElementById("chart-info");
  if (!el) return;

  // Try to resolve sensor status
  const s = gSensors.find((x) => x.uuid === uuid);
  const status = s?.status || "unknown";

  if (status !== "commissioned") {
    el.innerHTML = `
      <div class="chart-info-warning">
        <div class="chart-info-title">Sensor not commissioned yet</div>
        <div class="chart-info-body">
          The selected sensor <strong>${uuid}</strong> has not been commissioned or has no data yet.<br/>
          Use the <strong>Commission</strong> button on the left panel to activate it, then wait for telemetry.
        </div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="chart-info-warning">
        <div class="chart-info-title">No readings yet</div>
        <div class="chart-info-body">
          The sensor is commissioned, but no readings have been stored yet. Please wait a few seconds and hit <strong>Refresh</strong>.
        </div>
      </div>
    `;
  }
}

function updateChartInfoOk(uuid, readings) {
  const el = document.getElementById("chart-info");
  if (!el) return;

  const latest = readings[0];
  const ts = latest.timestamp ?? latest.ts;
  const when = ts ? new Date(ts * 1000).toLocaleString() : "recent";

  el.innerHTML = `
    <div class="chart-info-ok">
      Streaming latest telemetry for <strong>${uuid}</strong>.<br/>
      Last sample at <strong>${when}</strong>.
    </div>
  `;
}

function updateChartInfoError(uuid) {
  const el = document.getElementById("chart-info");
  if (!el) return;
  el.innerHTML = `
    <div class="chart-info-error">
      Failed to load readings for <strong>${uuid}</strong>. Please verify the gateway is running and reachable on port 9002.
    </div>
  `;
}
