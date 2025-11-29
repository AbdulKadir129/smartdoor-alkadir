// ========================================
// DASHBOARD.JS - Real-time MQTT Dashboard
// ========================================

// 1. KONFIGURASI (Ganti sesuai IP dan kredensial MQTT)
const ESP32_IP = "192.168.18.185";

const MQTT_BROKER = "4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884;
const MQTT_ID = "admin_web_" + Math.random().toString(16).substr(2, 8);
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

const TOPIC_AUTH = "smartdoor/auth";
const TOPIC_PARAM = "smartdoor/param";
const TOPIC_CONTROL = "smartdoor/control";

let activeDevice = 'finger';
let historyData = {
    cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
};
let logHistory = [];
let charts = null;
let prevDelay = 0;

// MQTT Client instance (gunakan library MQTT kompatibel)
const mqtt = new MQTTClient(MQTT_BROKER, MQTT_PORT, MQTT_ID);

function connectMQTT() {
    mqtt.connect(MQTT_USER, MQTT_PASS, true);
}

mqtt.on('connect', () => {
    document.getElementById('mqtt-status').innerText = "Online";
    document.getElementById('mqtt-status').className = "badge bg-success";
    mqtt.subscribe(TOPIC_AUTH);
    mqtt.subscribe(TOPIC_PARAM);
});

mqtt.on('messageArrived', (msg) => {
    const topic = msg.destinationName;
    const payload = msg.payloadString;
    const arrivalTime = Date.now();

    try {
        const data = JSON.parse(payload);
        let devRaw = (data.device || 'rfid').toLowerCase();
        let dev = 'rfid';
        if (devRaw.includes('cam')) dev = 'cam';
        else if (devRaw.includes('finger')) dev = 'finger';

        if (topic === TOPIC_AUTH) {
            updateUserInfo(data);
            let sentTime = Number(data.sentTime) || arrivalTime;
            let realDelay = arrivalTime - sentTime;
            if (realDelay < 0) realDelay = 0;
            console.log(`DEBUG AUTH - sentTime: ${sentTime}, arrivalTime: ${arrivalTime}, delay: ${realDelay}`);

            let info = data.message || data.status;
            let uid = data.userId || data.user_id || "Unknown";
            addLog(arrivalTime, dev, uid, info, realDelay, 0, 0, data.status);
        }
        else if (topic === TOPIC_PARAM) {
            let sentTime = Number(data.sentTime) || arrivalTime;
            let delay = arrivalTime - sentTime;
            if (delay < 0) delay = 0;
            let jitter = Math.abs(delay - prevDelay);
            prevDelay = delay;
            let size = data.messageSize || payload.length;
            let throughput = size * 8;
            let loss = 0;

            console.log(`DEBUG PARAM - sentTime: ${sentTime}, arrivalTime: ${arrivalTime}, delay: ${delay}, jitter: ${jitter}`);

            updateHistory(dev, delay, jitter, throughput, loss, size);
            addLog(arrivalTime, dev, "-", "QoS Report", delay, jitter, throughput, "INFO");
            if (dev === activeDevice) {
                updateDashboardCards(delay, jitter, throughput, loss, size);
                updateCharts(historyData[dev]);
            }
        }
        saveDataToLocal();
    } catch (e) {
        console.error('❌ Error parsing JSON:', e);
    }
});

// Data Persistence
function saveDataToLocal() {
    localStorage.setItem('smartdoor_charts', JSON.stringify(historyData));
    localStorage.setItem('smartdoor_logs', JSON.stringify(logHistory));
    localStorage.setItem('smartdoor_active', activeDevice);
}

function loadDataFromLocal() {
    const savedCharts = localStorage.getItem('smartdoor_charts');
    if (savedCharts) historyData = JSON.parse(savedCharts);
    const savedActive = localStorage.getItem('smartdoor_active');
    if (savedActive) activeDevice = savedActive;
    const savedLogs = localStorage.getItem('smartdoor_logs');
    if (savedLogs) {
        logHistory = JSON.parse(savedLogs);
        const table = document.getElementById("log-table-body");
        if (table) {
            table.innerHTML = "";
            logHistory.slice(0, 50).forEach(log => renderRow(log));
        }
    }
    updateCharts(historyData[activeDevice]);
}

// Chart Initialization (Chart.js)
function initCharts() {
    if (charts) return;

    const createChart = (id, label, color) => {
        const ctx = document.getElementById(id);
        if (!ctx) return null;
        return new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: { 
                labels: [], 
                datasets: [{ 
                    label: label, 
                    data: [], 
                    borderColor: color, 
                    tension: 0.3, 
                    borderWidth: 2, 
                    pointRadius: 3 
                }] 
            },
            options: { 
                animation: false, 
                responsive: true, 
                maintainAspectRatio: false,
                scales: { 
                    x: { display: false }, 
                    y: { beginAtZero: true }
                } 
            }
        });
    };

    charts = {
        delay: createChart('chartDelay', 'Delay (ms)', '#e74a3b'),
        jitter: createChart('chartJitter', 'Jitter (ms)', '#f6c23e'),
        throu: createChart('chartThroughput', 'Throughput (bps)', '#4e73df'),
        loss: createChart('chartLoss', 'Loss (%)', '#36b9cc'),
        size: createChart('chartSize', 'Size (Bytes)', '#1cc88a')
    };
}

function updateCharts(dataObj) {
    if (!charts || !dataObj) return;
    const update = (c, d) => { if (c) { c.data.labels = dataObj.labels; c.data.datasets[0].data = d; c.update(); } };
    update(charts.delay, dataObj.delay);
    update(charts.jitter, dataObj.jitter);
    update(charts.throu, dataObj.throu);
    update(charts.loss, dataObj.loss);
    update(charts.size, dataObj.size);
}

function updateHistory(dev, d, j, t, l, s) {
    if (!historyData[dev]) return;
    const h = historyData[dev];
    const timeNow = new Date().toLocaleTimeString();
    if (h.labels.length > 20) {
        h.labels.shift(); h.delay.shift(); h.jitter.shift();
        h.throu.shift(); h.loss.shift(); h.size.shift();
    }
    h.labels.push(timeNow);
    h.delay.push(d); h.jitter.push(j); h.throu.push(t); h.loss.push(l); h.size.push(s);
}

function addLog(time, dev, id, msg, delay, jitter, throu, status) {
    const logData = { 
        time, 
        dev, 
        id, 
        msg, 
        delay: parseFloat(delay).toFixed(0), 
        jitter: parseFloat(jitter).toFixed(0), 
        throu: parseFloat(throu).toFixed(0), 
        status 
    };
    logHistory.unshift(logData);
    if (logHistory.length > 100) logHistory.pop();
    renderRow(logData);
}

function renderRow(log) {
    const table = document.getElementById("log-table-body");
    if (!table) return;
    const row = table.insertRow(0);
    const tStr = new Date(log.time).toLocaleTimeString();
    let badgeColor = "bg-secondary";
    if (log.dev === 'cam') badgeColor = "bg-primary";
    else if (log.dev === 'rfid') badgeColor = "bg-warning text-dark";
    else if (log.dev === 'finger') badgeColor = "bg-success";

    let statusBadge = `<span class="badge bg-info text-dark">${log.status}</span>`;
    if (log.status.toLowerCase().includes('success')) statusBadge = '<span class="badge bg-success">SUCCESS</span>';
    else if (log.status.toLowerCase().includes('fail')) statusBadge = '<span class="badge bg-danger">FAILED</span>';

    row.innerHTML = `<td><small>${tStr}</small></td><td><span class="badge ${badgeColor}">${log.dev.toUpperCase()}</span></td><td class="fw-bold">${log.id}</td><td>${log.msg}</td><td>${log.delay} ms</td><td>${log.jitter} ms</td><td>${log.throu} bps</td><td>${statusBadge}</td>`;
    if (table.rows.length > 50) table.deleteRow(50);
}

function updateUserInfo(data) {
    let uid = data.userId || data.user_id || "-";
    if (uid.toString().toLowerCase() === "unknown") uid = "Unknown";
    document.getElementById('user-id').innerText = uid;
    document.getElementById('user-name').innerText = data.userName || "User " + uid;
    const statusEl = document.getElementById('auth-status');
    const iconEl = document.getElementById('user-icon');
    let status = (data.status || "").toLowerCase();
    if (status.includes("success") || status.includes("grant")) {
        statusEl.innerText = "GRANTED"; 
        statusEl.className = "fw-bold text-success"; 
        iconEl.className = "fas fa-user-check fa-4x text-success";
    } else {
        statusEl.innerText = "DENIED"; 
        statusEl.className = "fw-bold text-danger"; 
        iconEl.className = "fas fa-user-times fa-4x text-danger";
    }
    document.getElementById('auth-time').innerText = new Date().toLocaleTimeString();
}

function updateDashboardCards(d, j, t, l, s) {
    document.getElementById('val-delay').innerText = parseFloat(d).toFixed(0) + " ms";
    document.getElementById('val-jitter').innerText = parseFloat(j).toFixed(0) + " ms";
    document.getElementById('val-throughput').innerText = parseFloat(t).toFixed(0) + " bps";
    document.getElementById('val-loss').innerText = parseFloat(l).toFixed(2) + " %";
    document.getElementById('val-size').innerText = s + " B";
}

window.onload = function() {
    console.log("🚀 System Starting...");
    initCharts();
    loadDataFromLocal();
    connectMQTT();
};
