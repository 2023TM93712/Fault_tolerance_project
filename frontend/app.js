// ----------- CONFIG ----------- //

const AUTH_BASE = `http://${window.location.hostname}:9001`;
const GW_BASE = `http://${window.location.hostname}:9002`;

// thresholds (you can tune)
const TEMP_THRESHOLD = 30; // °C
const VIB_THRESHOLD = 50;  // arbitrary
const BATT_THRESHOLD = 20; // %

let dataLimit = 20; // default graph points
let selectedSensor = null;

// track if a sensor is currently in alert state
const sensorAlertStates = new Map();

// ----------- DOM HELPERS ----------- //

const $ = (id) => document.getElementById(id);

function showToast(message, type = "ok") {
  const container = $("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="dot"></div>
    <div>${message}</div>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => container.removeChild(el), 220);
  }, 2600);
}

function logLine(containerId, msg) {
  const log = $(containerId);
  if (!log) return;
  const line = document.createElement("div");
  line.className = "log-line";
  const t = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="time">[${t}]</span>${msg}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// ----------- SESSION ----------- //

function saveSession(user, role) {
  localStorage.setItem(
    "iot_session",
    JSON.stringify({ user, role, ts: Date.now() })
  );
}

function loadSession() {
  try {
    const raw = localStorage.getItem("iot_session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem("iot_session");
}

function updateTopbar(session) {
  const tb = $("topbar");
  const info = $("current-user-info");
  if (!session) {
    tb.classList.add("hidden");
    return;
  }
  tb.classList.remove("hidden");
  info.textContent = `${session.user} (${session.role})`;
}

// ----------- VIEW SWITCHING ----------- //

function showAuthView() {
  $("auth-view").classList.remove("hidden");
  $("user-view").classList.add("hidden");
  $("admin-view").classList.add("hidden");
  updateTopbar(null);
}

function showUserView(session) {
  $("auth-view").classList.add("hidden");
  $("user-view").classList.remove("hidden");
  $("admin-view").classList.add("hidden");
  updateTopbar(session);
}

function showAdminView(session) {
  $("auth-view").classList.add("hidden");
  $("user-view").classList.add("hidden");
  $("admin-view").classList.remove("hidden");
  updateTopbar(session);
}

// ----------- AUTH UI ----------- //

function initAuthUI() {
  const tabLogin = $("tab-login");
  const tabSignup = $("tab-signup");
  const loginForm = $("login-form");
  const signupForm = $("signup-form");

  function activate(tab) {
    if (tab === "login") {
      tabLogin.classList.add("active");
      tabSignup.classList.remove("active");
      loginForm.classList.add("active");
      signupForm.classList.remove("active");
    } else {
      tabSignup.classList.add("active");
      tabLogin.classList.remove("active");
      signupForm.classList.add("active");
      loginForm.classList.remove("active");
    }
  }

  tabLogin.onclick = () => activate("login");
  tabSignup.onclick = () => activate("signup");
  $("link-open-signup").onclick = (e) => {
    e.preventDefault();
    activate("signup");
  };
  $("link-open-login").onclick = (e) => {
    e.preventDefault();
    activate("login");
  };

  // Sensor-count slider
  const slider = $("sensor-count");
  const out = $("sensor-count-value");
  slider.addEventListener("input", () => {
    out.textContent = slider.value;
  });

  // LOGIN
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = $("login-username").value.trim();
    const password = $("login-password").value;

    if (!username || !password) return;

    try {
      const res = await fetch(`${AUTH_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast("Invalid credentials.", "error");
        return;
      }
      if (!data.approved) {
        showToast("Account pending approval. Contact admin.", "error");
        return;
      }

      saveSession(username, data.role);
      const session = loadSession();
      showToast(`Welcome back, ${username}.`);

      if (data.role === "admin") {
        showAdminView(session);
        refreshAdminUsers();
        refreshAdminSensors();
      } else {
        showUserView(session);
        refreshUserSensors();
      }
    } catch (err) {
      console.error(err);
      showToast("Login failed – backend not reachable?", "error");
    }
  });

  // SIGNUP
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = $("signup-username").value.trim();
    const password = $("signup-password").value;
    const count = parseInt($("sensor-count").value, 10) || 0;

    if (!username || !password || count <= 0) {
      showToast("Fill all fields and choose at least 1 sensor.", "error");
      return;
    }

    try {
      const res = await fetch(`${AUTH_BASE}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          sensor_count: count,
        }),
      });
      const text = await res.text();
      if (text === "OK") {
        showToast(
          "Account created. Wait for admin approval before logging in."
        );
        activate("login");
        $("login-username").value = username;
      } else if (text === "USER_EXISTS") {
        showToast("Username already exists.", "error");
      } else {
        showToast("Signup failed.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Signup failed – backend not reachable?", "error");
    }
  });

  // LOGOUT
  $("btn-logout").onclick = () => {
    clearSession();
    showAuthView();
  };
}

// ----------- USER TABS (telemetry / logs) ----------- //

function initUserTabs() {
  const buttons = document.querySelectorAll("[data-user-tab]");
  const tabs = {
    telemetry: $("user-tab-telemetry"),
    logs: $("user-tab-logs"),
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.userTab;
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      Object.values(tabs).forEach((el) => el.classList.remove("active"));
      if (tabs[key]) tabs[key].classList.add("active");
    });
  });
}

// ----------- USER DASHBOARD ----------- //

async function refreshUserSensors() {
  const session = loadSession();
  if (!session || session.role === "admin") return;

  const container = $("sensor-list");
  container.classList.remove("empty-state");
  container.textContent = "Loading sensors…";

  try {
    const res = await fetch(
      `${GW_BASE}/sensors?user=${encodeURIComponent(session.user)}&admin=0`
    );
    const data = await res.json();

    container.innerHTML = "";
    if (!data.length) {
      container.classList.add("empty-state");
      container.textContent =
        "No sensors allocated yet. Ask admin to allocate devices.";
      return;
    }

    data.forEach((s) => {
      const card = document.createElement("div");
      card.className = "sensor-card";
      card.dataset.uuid = s.uuid;

      let ledStatusClass;
      if (s.status === "fault") {
        ledStatusClass = "error";
      } else if (s.status === "commissioned") {
        ledStatusClass = "commissioned-blink";
      } else if (s.status === "decommissioned") {
        ledStatusClass = "decommissioned-blink";
      } else {
        ledStatusClass = "warn";
      }

      const adv = s.advertising_interval_sec || 0;

      card.innerHTML = `
        <div class="sensor-main">
          <div class="sensor-id">${s.uuid}</div>
          <div class="sensor-meta">
            Status: ${s.status || "unknown"} · Adv: ${adv}s
          </div>
        </div>
        <div class="sensor-actions">
          <div class="led ${ledStatusClass}"></div>
          <div style="display:flex; gap:4px;" class="dynamic-action-buttons">
            <button class="btn-chip btn-chip-primary btn-sel">Select</button>
          </div>
        </div>
      `;

      const uuid = s.uuid;
      const dynamicButtonContainer = card.querySelector(
        ".dynamic-action-buttons"
      );

      // second button: commission / decommission / recommission
      let actionButton;
      if (s.status === "commissioned") {
        actionButton = document.createElement("button");
        actionButton.className = "btn-chip btn-chip-danger";
        actionButton.textContent = "De-commission";
        actionButton.onclick = (ev) => {
          ev.stopPropagation();
          decommissionSensor(uuid);
        };
      } else if (s.status === "decommissioned") {
        actionButton = document.createElement("button");
        actionButton.className = "btn-chip btn-chip-warn";
        actionButton.textContent = "Re-commission";
        actionButton.onclick = (ev) => {
          ev.stopPropagation();
          recommissionSensor(uuid);
        };
      } else {
        actionButton = document.createElement("button");
        actionButton.className = "btn-chip btn-chip-primary";
        actionButton.textContent = "Commission";
        actionButton.onclick = (ev) => {
          ev.stopPropagation();
          commissionSensor(uuid);
        };
      }
      if (actionButton) dynamicButtonContainer.appendChild(actionButton);

      card.querySelector(".btn-sel").onclick = (ev) => {
        ev.stopPropagation();
        selectSensor(uuid);
      };

      card.onclick = () => selectSensor(uuid);

      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.classList.add("empty-state");
    container.textContent = "Failed to load sensors.";
    showToast("Failed to load sensors.", "error");
  }
}

async function selectSensor(uuid) {
  selectedSensor = uuid;
  $("selected-sensor-label").textContent = uuid;
  logLine("user-log", `Selected sensor ${uuid}`);
  await refreshChartsForSensor(uuid);
}

// graph resolution selector
function updateDataLimitAndRefreshCharts() {
  const selectElement = $("data-points-select");
  if (!selectElement) return;
  dataLimit = parseInt(selectElement.value, 10) || 20;
  if (selectedSensor) {
    refreshChartsForSensor(selectedSensor);
  }
}

// simple line chart renderer
function drawSimpleLineChart(canvasId, points, color, threshold = null) {
  const canvas = $(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(0.5, 0.5);

  // border
  ctx.strokeStyle = "rgba(30, 64, 175, 0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w - 1, h - 1);

  if (!points.length) {
    ctx.restore();
    return;
  }

  const ys = points;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;

  ctx.beginPath();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = color;

  points.forEach((y, i) => {
    const xp = (i / Math.max(points.length - 1, 1)) * (w - 10) + 5;
    const yp = h - 4 - ((y - minY) / span) * (h - 10);
    if (i === 0) ctx.moveTo(xp, yp);
    else ctx.lineTo(xp, yp);
  });

  ctx.stroke();
  ctx.restore();

  // threshold line
  if (threshold !== null) {
    const tY =
      threshold <= minY
        ? h - 4
        : threshold >= maxY
        ? 2
        : h - 4 - ((threshold - minY) / span) * (h - 10);

    ctx.save();
    ctx.strokeStyle = "rgba(239,68,68,0.8)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(2, tY);
    ctx.lineTo(w - 2, tY);
    ctx.stroke();
    ctx.restore();
  }
}

async function refreshChartsForSensor(uuid) {
  try {
    const res = await fetch(
      `${GW_BASE}/readings?uuid=${encodeURIComponent(uuid)}`
    );
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) {
      drawSimpleLineChart("chart-temp", [], "rgba(248, 250, 252, 0.96)");
      drawSimpleLineChart("chart-vib", [], "rgba(56, 189, 248, 0.95)");
      drawSimpleLineChart("chart-batt", [], "rgba(34, 197, 94, 0.98)");
      drawSimpleLineChart("chart-alert", [], "rgba(255,99,132,0.9)");
      return;
    }

    const slice = arr.slice(-dataLimit);
    const temps = slice.map((r) => r.temp ?? r.temperature ?? 0);
    const vibs = slice.map((r) => r.vib ?? r.vibration ?? 0);
    const batts = slice.map((r) => r.batt ?? r.battery ?? 0);
    const alertsData = slice.map((r) => {
      const t = r.temp ?? r.temperature ?? 0;
      const v = r.vib ?? r.vibration ?? 0;
      const b = r.batt ?? r.battery ?? 100;
      return t > TEMP_THRESHOLD || v > VIB_THRESHOLD || b < BATT_THRESHOLD
        ? 1
        : 0;
    });

    drawSimpleLineChart(
      "chart-temp",
      temps,
      "rgba(248, 250, 252, 0.96)",
      TEMP_THRESHOLD
    );
    drawSimpleLineChart(
      "chart-vib",
      vibs,
      "rgba(56, 189, 248, 0.95)",
      VIB_THRESHOLD
    );
    drawSimpleLineChart(
      "chart-batt",
      batts,
      "rgba(34, 197, 94, 0.98)",
      BATT_THRESHOLD
    );
    drawSimpleLineChart(
      "chart-alert",
      alertsData,
      "rgba(255, 99, 132, 0.9)"
    );

    logLine(
      "user-log",
      `Updated charts for ${uuid} (${slice.length} points)`
    );

    // threshold checks for latest point
    const latest = slice[slice.length - 1];
    if (latest) {
      const latestTemp = latest.temp ?? latest.temperature ?? 0;
      const latestVib = latest.vib ?? latest.vibration ?? 0;
      const latestBatt = latest.batt ?? latest.battery ?? 100;

      let isAlerting = false;
      const alerts = [];

      if (latestTemp > TEMP_THRESHOLD) {
        alerts.push(
          `Temp ${latestTemp.toFixed(1)}°C > ${TEMP_THRESHOLD}°C`
        );
        isAlerting = true;
      }
      if (latestVib > VIB_THRESHOLD) {
        alerts.push(`Vib ${latestVib.toFixed(1)} > ${VIB_THRESHOLD}`);
        isAlerting = true;
      }
      if (latestBatt < BATT_THRESHOLD) {
        alerts.push(`Batt ${latestBatt}% < ${BATT_THRESHOLD}%`);
        isAlerting = true;
      }

      const sensorCard = document.querySelector(
        `.sensor-card[data-uuid="${uuid}"]`
      );
      if (sensorCard) {
        const led = sensorCard.querySelector(".led");
        const wasAlerting = sensorAlertStates.get(uuid) || false;

        if (isAlerting && !wasAlerting) {
          led.classList.add("error");
          showToast(`Sensor ${uuid}: ${alerts.join(", ")}`, "error");
          sensorAlertStates.set(uuid, true);
        } else if (!isAlerting && wasAlerting) {
          led.classList.remove("error");
          sensorAlertStates.set(uuid, false);
          showToast(`Sensor ${uuid}: back within limits.`, "ok");
        }
      }
    }
  } catch (err) {
    console.error(err);
    showToast("Failed to load readings.", "error");
  }
}

// ----------- SENSOR CONTROL (real GW endpoints) ----------- //

async function commissionSensor(uuid) {
  const interval = prompt(
    `Commission ${uuid}\nAdvertising interval (seconds):`,
    "5"
  );
  if (interval === null) return;
  const iv = parseInt(interval, 10);
  if (!iv || iv <= 0) {
    showToast("Invalid interval.", "error");
    return;
  }

  try {
    const res = await fetch(`${GW_BASE}/commission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid, interval_sec: iv }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Commissioned ${uuid} @ ${iv}s.`);
      logLine("user-log", `Commissioned ${uuid} (adv=${iv}s)`);
      await applyTemporaryBlink(uuid, "commissioned-blink", "ok");
      if (selectedSensor === uuid) {
        selectSensor(uuid);
      }
    } else {
      showToast("Commission failed.", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("Commission failed – gateway offline?", "error");
  }
}

async function decommissionSensor(uuid) {
  if (!confirm(`De-commission sensor ${uuid}?`)) return;
  try {
    const res = await fetch(`${GW_BASE}/decommission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`De-commissioned ${uuid}.`);
      logLine("user-log", `De-commissioned ${uuid}`);
      sensorAlertStates.delete(uuid);
      await applyTemporaryBlink(uuid, "decommissioned-blink", "warn");
    } else {
      showToast("De-commission failed.", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("De-commission failed – gateway offline?", "error");
  }
}

async function recommissionSensor(uuid) {
  try {
    const res = await fetch(`${GW_BASE}/recommission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Re-commissioned ${uuid}.`);
      logLine("user-log", `Re-commissioned ${uuid}`);
      await applyTemporaryBlink(uuid, "commissioned-blink", "ok");
    } else {
      showToast("Re-commission failed.", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("Re-commission failed – gateway offline?", "error");
  }
}

async function changeAdvInterval(uuid, current) {
  const interval = prompt(
    `Set advertising interval for ${uuid} (seconds):`,
    current || "5"
  );
  if (interval === null) return;
  const iv = parseInt(interval, 10);
  if (!iv || iv <= 0) {
    showToast("Invalid interval.", "error");
    return;
  }

  try {
    const res = await fetch(`${GW_BASE}/set_adv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid, interval_sec: iv }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Updated adv interval for ${uuid} → ${iv}s.`);
      logLine("user-log", `Set adv interval ${uuid} = ${iv}s`);
      refreshUserSensors();
    } else {
      showToast("Failed to set interval.", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("Failed to set interval – gateway offline?", "error");
  }
}

// LED blink helper (reuse for commission / decommission)

async function applyTemporaryBlink(uuid, blinkClass, normalClass) {
  const sensorCard = document.querySelector(
    `.sensor-card[data-uuid="${uuid}"]`
  );
  if (sensorCard) {
    const led = sensorCard.querySelector(".led");
    led.classList.remove(
      "ok",
      "warn",
      "error",
      "commissioned-blink",
      "decommissioned-blink"
    );
    led.classList.add(blinkClass);

    setTimeout(() => {
      led.classList.remove(blinkClass);
      led.classList.add(normalClass);
      refreshUserSensors();
      if (selectedSensor === uuid) {
        refreshChartsForSensor(uuid);
      }
    }, 3000);
  } else {
    refreshUserSensors();
  }
}

// ----------- ADMIN CONSOLE ----------- //

async function refreshAdminUsers() {
  const container = $("admin-users-body");
  container.innerHTML =
    '<tr><td colspan="4" class="text-center tiny">Loading…</td></tr>';
  try {
    const res = await fetch(`${AUTH_BASE}/users`);
    const data = await res.json();
    container.innerHTML = "";

    data.forEach((u) => {
      const tr = document.createElement("tr");
      const approved = !!u.approved;
      const statusClass = approved ? "ok" : "unapproved";
      const statusText = approved ? "Approved" : "Pending";

      tr.innerHTML = `
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>
          <span class="badge-status ${statusClass}">${statusText}</span>
        </td>
        <td>
          <button class="btn-chip btn-chip-primary btn-approve-user"
                  ${approved ? "disabled" : ""}>
            ${approved ? "Approved" : "Approve"}
          </button>
        </td>
      `;

      const btnApprove = tr.querySelector(".btn-approve-user");
      btnApprove.onclick = async () => {
        try {
          const res2 = await fetch(`${AUTH_BASE}/approve_user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u.username }),
          });
          const txt = await res2.text();
          if (txt === "OK") {
            showToast(`Approved ${u.username}.`);
            logLine("admin-log", `Approved user ${u.username}`);
            refreshAdminUsers();
          } else {
            showToast(`Failed to approve ${u.username}.`, "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Approve failed.", "error");
        }
      };

      container.appendChild(tr);
    });

    if (!data.length) {
      container.innerHTML = `
        <tr>
          <td colspan="4" class="text-center tiny">
            No users found.
          </td>
        </tr>`;
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <tr>
        <td colspan="4" class="text-center tiny">
          Failed to load users.
        </td>
      </tr>`;
    showToast("Failed to load users.", "error");
  }
}

async function refreshAdminSensors() {
  const container = $("admin-sensor-list");
  container.textContent = "Loading sensors…";
  container.classList.add("empty-state");

  try {
    const res = await fetch(`${GW_BASE}/sensors?user=_&admin=1`);
    const data = await res.json();
    container.classList.remove("empty-state");
    container.innerHTML = "";

    if (!data.length) {
      container.classList.add("empty-state");
      container.textContent = "No sensors in system.";
      return;
    }

    data.forEach((s) => {
      const card = document.createElement("div");
      card.className = "sensor-card";
      const ledStatus =
        s.status === "fault"
          ? "error"
          : s.status === "commissioned"
          ? "commissioned-blink"
          : s.status === "decommissioned"
          ? "decommissioned-blink"
          : "warn";

      card.innerHTML = `
        <div class="sensor-main">
          <div class="sensor-id">${s.uuid}</div>
          <div class="sensor-meta">
            Owner: ${s.owner || "-"} · Status: ${s.status || "unknown"}
          </div>
        </div>
        <div class="sensor-actions">
          <div class="led ${ledStatus}"></div>
          <div style="display:flex; gap:4px;" class="dynamic-action-buttons"></div>
        </div>
      `;

      const uuid = s.uuid;
      const dynamicButtonContainer = card.querySelector(
        ".dynamic-action-buttons"
      );
      let actionButton;

      if (s.status === "commissioned") {
        actionButton = document.createElement("button");
        actionButton.className = "btn-chip btn-chip-danger";
        actionButton.textContent = "De-commission";
        actionButton.onclick = (ev) => {
          ev.stopPropagation();
          decommissionSensor(uuid);
        };
      } else if (s.status === "decommissioned") {
        actionButton = document.createElement("button");
        actionButton.className = "btn-chip btn-chip-warn";
        actionButton.textContent = "Re-commission";
        actionButton.onclick = (ev) => {
          ev.stopPropagation();
          recommissionSensor(uuid);
        };
      } else {
        actionButton = document.createElement("button");
        actionButton.className = "btn-chip btn-chip-primary";
        actionButton.textContent = "Commission";
        actionButton.onclick = (ev) => {
          ev.stopPropagation();
          commissionSensor(uuid);
        };
      }
      if (actionButton) dynamicButtonContainer.appendChild(actionButton);

      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.textContent = "Failed to load sensors.";
  }
}

async function refreshAdminAlerts() {
  const container = $("admin-alerts-panel");
  container.textContent = "Fetching alerts…";
  try {
    const res = await fetch(`${GW_BASE}/alerts`);
    const data = await res.json();

    if (!data || !data.length) {
      container.innerHTML =
        "<div class='log-line muted tiny'>No active alerts.</div>";
      return;
    }

    container.innerHTML = "";
    data.forEach((alert) => {
      const line = document.createElement("div");
      line.className = "log-line alert-line";
      const t = new Date(alert.timestamp || Date.now()).toLocaleTimeString();
      line.innerHTML = `<span class="time">[${t}]</span> <span class="alert-uuid">${
        alert.uuid || alert.sensor_uuid || "-"
      }:</span> ${alert.message || JSON.stringify(alert)}`;
      container.appendChild(line);
    });

    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class='log-line error-line'>Failed to load alerts: ${err.message}</div>`;
    showToast("Failed to load admin alerts.", "error");
  }
}

function initAdminTabs() {
  const tabs = document.querySelectorAll(".admin-tab");
  const bodies = document.querySelectorAll(".admin-tab-body");
  let alertsInterval = null;

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;

      tabs.forEach((b) => b.classList.remove("active"));
      bodies.forEach((sec) => sec.classList.remove("active"));
      btn.classList.add("active");
      $(targetId).classList.add("active");

      // stop alerts polling when leaving alerts tab
      if (alertsInterval) {
        clearInterval(alertsInterval);
        alertsInterval = null;
      }
      if (targetId === "admin-alerts") {
        refreshAdminAlerts();
        alertsInterval = setInterval(refreshAdminAlerts, 5000);
      }
    });
  });

  $("btn-refresh-users").onclick = refreshAdminUsers;
  $("btn-admin-refresh-sensors").onclick = refreshAdminSensors;
}

// ----------- INIT ----------- //

window.addEventListener("DOMContentLoaded", () => {
  initAuthUI();
  initUserTabs();
  initAdminTabs();

  $("btn-refresh-sensors").onclick = refreshUserSensors;

  const dps = $("data-points-select");
  if (dps) {
    dps.addEventListener("change", updateDataLimitAndRefreshCharts);
  }

  const session = loadSession();
  if (!session) {
    showAuthView();
  } else if (session.role === "admin") {
    showAdminView(session);
    refreshAdminUsers();
    refreshAdminSensors();
  } else {
    showUserView(session);
    refreshUserSensors();
  }
});
