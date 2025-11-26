// ----------- CONFIG ----------- //

const AUTH_BASE = `http://${window.location.hostname}:9001`;
const GW_BASE = `http://${window.location.hostname}:9002`;

// Thresholds for alerts
const TEMP_THRESHOLD = 30; // degrees Celsius
const VIB_THRESHOLD = 50; // arbitrary unit
const BATT_THRESHOLD = 20; // percentage

// To keep track of which sensors are currently in an alert state
const sensorAlertStates = new Map();

let dataLimit = 10; // Default data limit for graphs

function updateDataLimitAndRefreshCharts() {
  const selectElement = $("data-points-select");
  dataLimit = parseInt(selectElement.value, 10);
  if (selectedSensor) {
    refreshChartsForSensor(selectedSensor);
  }
}

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

  // LOGIN SUBMIT
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

  // SIGNUP SUBMIT
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

// ----------- USER DASHBOARD ----------- //

let selectedSensor = null;

async function refreshUserSensors() {
  const session = loadSession();
  if (!session || session.role === "admin") return;

  const container = $("sensor-list");
  container.classList.remove("empty-state");
  container.textContent = "Loading sensors…";

  try {
    const res = await fetch(
      `${GW_BASE}/sensors?user=${encodeURIComponent(
        session.user
      )}&admin=0`
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

      let ledStatusClass = "";
      if (s.status === "fault") {
        ledStatusClass = "error"; // Already blinks from style.css
      } else if (s.status === "commissioned") {
        ledStatusClass = "commissioned-blink"; // New class for blinking
      } else if (s.status === "decommissioned") {
        ledStatusClass = "decommissioned-blink"; // New class for blinking
      } else {
        ledStatusClass = "warn"; // Default for uncommissioned or unknown
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
            <!-- Dynamic button will be inserted here -->
          </div>
        </div>
      `;

      const uuid = s.uuid;

      const dynamicButtonContainer = card.querySelector(".dynamic-action-buttons");
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
      } else { // Assuming 'uncommissioned' or any other non-commissioned state
        actionButton = document.createElement("button");
        actionButton.className = "btn-chip btn-chip-primary";
        actionButton.textContent = "Commission";
        actionButton.onclick = (ev) => {
          ev.stopPropagation();
          commissionSensor(uuid);
        };
      }
      if (actionButton) {
        dynamicButtonContainer.appendChild(actionButton);
      }

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
  logLine("user-log", "Selected sensor " + uuid);
  await refreshChartsForSensor(uuid);
}

// Simple line chart

function drawSimpleLineChart(canvasId, points, color, threshold = null) {
  const canvas = $(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(0.5, 0.5);

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

  // Draw threshold line if provided
  if (threshold !== null) {
    ctx.save();
    ctx.strokeStyle = "red";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]); // Dashed line
    ctx.beginPath();
    // Calculate the y-position for the threshold relative to the graph's min/max and height
    // Ensure the threshold line is drawn correctly even if the threshold is outside the current min/max of the points.
    const effectiveMinY = Math.min(minY, threshold);
    const effectiveMaxY = Math.max(maxY, threshold);
    const effectiveSpan = effectiveMaxY - effectiveMinY || 1;

    const thresholdYp = h - 4 - ((threshold - effectiveMinY) / effectiveSpan) * (h - 10);
    ctx.moveTo(5, thresholdYp);
    ctx.lineTo(w - 5, thresholdYp);
    ctx.stroke();
    ctx.restore();
  }
}

async function refreshChartsForSensor(uuid) {
  if (!uuid) return;
  try {
    const res = await fetch(
      `${GW_BASE}/readings?uuid=${encodeURIComponent(uuid)}`
    );
    const data = await res.json();
    const arr = data.slice(-dataLimit); // Apply dataLimit here

    const temps = arr.map((r) => r.temp ?? r.temperature);
    const vibs = arr.map((r) => r.vib ?? r.vibration);
    const batts = arr.map((r) => r.batt ?? r.battery);
    
    // Generate alerts data for the chart
    const alertsData = arr.map((r) => {
      const isTempAlert = (r.temp ?? r.temperature) > TEMP_THRESHOLD;
      const isVibAlert = (r.vib ?? r.vibration) > VIB_THRESHOLD;
      const isBattAlert = (r.batt ?? r.battery) < BATT_THRESHOLD;
      return (isTempAlert || isVibAlert || isBattAlert) ? 1 : 0;
    });

    drawSimpleLineChart("chart-temp", temps, "rgba(248, 250, 252, 0.96)");
    drawSimpleLineChart("chart-vib", vibs, "rgba(56, 189, 248, 0.95)");
    drawSimpleLineChart("chart-batt", batts, "rgba(34, 197, 94, 0.98)");
    drawSimpleLineChart("chart-alert", alertsData, "rgba(255, 99, 132, 0.9)"); // Red for alerts

    logLine("user-log", `Updated charts for ${uuid} (${arr.length} points)`);

    // --- Threshold checking and alerts ---
    let isAlerting = false;
    const latestReading = arr[arr.length - 1]; // Get the latest reading
    if (latestReading) {
      const latestTemp = latestReading.temp ?? latestReading.temperature;
      const latestVib = latestReading.vib ?? latestReading.vibration;
      const latestBatt = latestReading.batt ?? latestReading.battery;

      const alerts = [];
      if (latestTemp > TEMP_THRESHOLD) {
        alerts.push(`Temperature (${latestTemp}°C) exceeded threshold (${TEMP_THRESHOLD}°C)`);
        isAlerting = true;
      }
      if (latestVib > VIB_THRESHOLD) {
        alerts.push(`Vibration (${latestVib}) exceeded threshold (${VIB_THRESHOLD})`);
        isAlerting = true;
      }
      if (latestBatt < BATT_THRESHOLD) { // Battery is low if below threshold
        alerts.push(`Battery (${latestBatt}%) is below threshold (${BATT_THRESHOLD}%)`);
        isAlerting = true;
      }

      const sensorCard = document.querySelector(`.sensor-card[data-uuid="${uuid}"]`);
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
          showToast(`Sensor ${uuid}: All clear.`, "ok");
        }
      }
    }
    // --- End threshold checking ---
  } catch (err) {
    console.error(err);
    showToast("Failed to load readings.", "error");
  }
}

// ----------- SENSOR CONTROL → REAL GW ENDPOINTS ----------- //

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
      // refreshUserSensors() is called inside applyTemporaryBlink
      if (selectedSensor === uuid) {
        selectSensor(uuid); // Re-select to refresh charts with new interval
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
      sensorAlertStates.delete(uuid); // Clear alert state for decommissioned sensor
      await applyTemporaryBlink(uuid, "decommissioned-blink", "warn");
      // refreshUserSensors() is called inside applyTemporaryBlink
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
      // refreshUserSensors() is called inside applyTemporaryBlink
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

// Helper for temporary blinking of sensor LEDs
async function applyTemporaryBlink(uuid, blinkClass, normalClass) {
  const sensorCard = document.querySelector(`.sensor-card[data-uuid="${uuid}"]`);
  if (sensorCard) {
    const led = sensorCard.querySelector(".led");
    const currentClasses = Array.from(led.classList);
    const originalDynamicClasses = currentClasses.filter(c => 
      !c.startsWith('led') && !c.endsWith('-blink') && c !== 'error' && c !== 'ok' && c !== 'warn'
    );
    
    // Clear all existing specific status classes before applying blink
    led.classList.remove('ok', 'warn', 'error', 'commissioned-blink', 'decommissioned-blink');
    led.classList.add(blinkClass);

    setTimeout(() => {
      // Remove blink class and apply the intended normal class
      led.classList.remove(blinkClass);
      led.classList.add(normalClass);
      originalDynamicClasses.forEach(c => led.classList.add(c));
      refreshUserSensors(); // Refresh the list to get the actual status from backend
      if (selectedSensor === uuid) {
        refreshChartsForSensor(uuid); // Refresh charts if this is the selected sensor
      }
    }, 3000); // Blink for 3 seconds
  } else {
      refreshUserSensors(); // If card not found, just refresh
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
          <div style="display:flex; gap:6px;">
            <button class="btn-approve btn-approve-user"
                    ${approved ? "disabled" : ""}>
              ${approved ? "Approved" : "Approve"}
            </button>
          </div>
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
          <div style="display:flex; gap:4px;" class="dynamic-action-buttons">
            <!-- Dynamic button will be inserted here -->
          </div>
        </div>
      `;

      const uuid = s.uuid;

      const dynamicButtonContainer = card.querySelector(".dynamic-action-buttons");
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
      } else { // Assuming 'uncommissioned' or any other non-commissioned state
        actionButton = document.createElement("button");
        actionButton.className = "btn-chip btn-chip-primary";
        actionButton.textContent = "Commission";
        actionButton.onclick = (ev) => {
          ev.stopPropagation();
          commissionSensor(uuid);
        };
      }
      if (actionButton) {
        dynamicButtonContainer.appendChild(actionButton);
      }
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.textContent = "Failed to load sensors.";
  }
}


async function refreshAdminAlerts() {
  const container = $("admin-alerts-panel");
  container.innerHTML = "Fetching alerts…";
  try {
    const res = await fetch(`${GW_BASE}/alerts`); // Assuming a new /alerts endpoint
    const data = await res.json(); // Assuming data is an array of alert objects

    if (!data || data.length === 0) {
      container.innerHTML = "<div class='log-line muted tiny'>No active alerts.</div>";
      return;
    }

    container.innerHTML = "";
    data.forEach(alert => {
      // Assuming alert object has 'timestamp', 'uuid', 'message'
      const line = document.createElement("div");
      line.className = "log-line alert-line";
      const t = new Date(alert.timestamp).toLocaleTimeString();
      line.innerHTML = `<span class="time">[${t}]</span> <span class="alert-uuid">${alert.uuid}:</span> ${alert.message}`;
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
  let adminAlertsInterval = null;

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      tabs.forEach((b) => b.classList.remove("active"));
      bodies.forEach((sec) => sec.classList.remove("active"));
      btn.classList.add("active");
      $(target).classList.add("active");

      // Clear any existing interval when switching tabs
      if (adminAlertsInterval) {
        clearInterval(adminAlertsInterval);
        adminAlertsInterval = null;
      }

      if (target === "admin-alerts") {
        refreshAdminAlerts();
        adminAlertsInterval = setInterval(refreshAdminAlerts, 5000); // Refresh every 5 seconds
      }
    });
  });

  $("btn-refresh-users").onclick = refreshAdminUsers;
  $("btn-admin-refresh-sensors").onclick = refreshAdminSensors;
}


// ----------- INIT ----------- //

window.addEventListener("DOMContentLoaded", () => {
  initAuthUI();
  initAdminTabs();

  $("btn-refresh-sensors").onclick = refreshUserSensors;

  const session = loadSession();
  if (!session) {
    showAuthView();
  } else {
    if (session.role === "admin") {
      showAdminView(session);
      refreshAdminUsers();
      refreshAdminSensors();
    } else {
      showUserView(session);
      refreshUserSensors();
    }
  }
});
