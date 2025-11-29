// ========================================
// DASHBOARD.JS - FINAL FIXED (ALL DEVICES)
// Fitur: Support 'fingerprint' & 'esp32cam' naming
// ========================================

// 1. KONFIGURASI
const ESP32_IP = "192.168.18.185"; 

const MQTT_BROKER = "4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884;
const MQTT_ID = "admin_web_" + Math.random().toString(16).substr(2, 8);
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

// Topik
const TOPIC_AUTH = "smartdoor/auth";   
const TOPIC_PARAM = "smartdoor/param"; 
const TOPIC_CONTROL = "smartdoor/control";

// Variabel Data
let activeDevice = 'finger'; // Default ke Finger biar langsung kelihatan
const historyData = {
    cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
};

let charts = null;
let prevDelay = 0; 

// 2. INITIALIZATION
window.onload = function() {
    console.log("🚀 System Starting...");
    const logTable = document.getElementById('log-table-body');
    if(logTable) logTable.innerHTML = ''; 
    
    initCharts(); 
    connectMQTT(); 
    switchDevice('finger'); // Set awal ke Fingerprint
};

// 3. MQTT LOGIC
const mqtt = new MQTTClient(MQTT_BROKER, MQTT_PORT, MQTT_ID);

function connectMQTT() {
    mqtt.connect(MQTT_USER, MQTT_PASS, true);
}

mqtt.on('connect', () => {
    console.log("✅ MQTT Connected!");
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
        
        // --- BAGIAN INI YANG DIPERBAIKI ---
        // Menyamakan nama yang dikirim ESP32 dengan ID di HTML
        let devRaw = (data.device || 'rfid').toLowerCase();
        let dev = 'rfid'; // Default

        if (devRaw.includes('cam')) {
            dev = 'cam';
        } else if (devRaw.includes('finger')) { 
            // Menangkap 'finger' ATAU 'fingerprint'
            dev = 'finger'; 
        } else {
            dev = 'rfid';
        }
        // ----------------------------------

        // SKENARIO 1: DATA LOG (TABEL)
        if (topic === TOPIC_AUTH) {
            updateUserInfo(data);
            let sentTime = data.sentTime || arrivalTime;
            let realDelay = arrivalTime - sentTime; 
            if (realDelay < 0) realDelay = 0; 
            
            let info = data.message || data.status;
            let uid = data.userId || data.user_id || "Unknown";
            
            addLog(arrivalTime, dev, uid, info, realDelay, data.status);
        }

        // SKENARIO 2: DATA GRAFIK (CHART)
        else if (topic === TOPIC_PARAM) {
            let sentTime = data.sentTime || arrivalTime;
            let delay = arrivalTime - sentTime; 
            if (delay < 0) delay = Math.abs(delay) % 10; 

            let jitter = Math.abs(delay - prevDelay);
            prevDelay = delay;

            let size = data.messageSize || payload.length;
            let throughput = size * 8; 
            let loss = 0; 

            updateHistory(dev, delay, jitter, throughput, loss, size);

            if (dev === activeDevice) {
                updateDashboardCards(delay, jitter, throughput, loss, size);
                updateCharts(historyData[dev]);
            }
        }

    } catch (e) {
        console.error('❌ Error parsing JSON:', e);
    }
});

// 4. DATA MANAGEMENT
function updateHistory(dev, d, j, t, l, s) {
    if (!historyData[dev]) return;
    const h = historyData[dev];
    const timeNow = new Date().toLocaleTimeString();

    if (h.labels.length > 20) {
        h.labels.shift(); h.delay.shift(); h.jitter.shift();
        h.throu.shift(); h.loss.shift(); h.size.shift();
    }
    h.labels.push(timeNow);
    h.delay.push(d);
    h.jitter.push(j);
    h.throu.push(t);
    h.loss.push(l);
    h.size.push(s);
}

// 5. CHART JS SETUP
function initCharts() {
    if (charts) return;
    const createChart = (id, label, color) => {
        const ctx = document.getElementById(id);
        if (!ctx) return null;
        return new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: label, data: [], borderColor: color, tension: 0.3, borderWidth: 2, pointRadius: 3 }] },
            options: { animation: false, responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { beginAtZero: true } } }
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
    if (!charts) return;
    const update = (c, d) => { if(c) { c.data.labels = dataObj.labels; c.data.datasets[0].data = d; c.update(); } };
    update(charts.delay, dataObj.delay);
    update(charts.jitter, dataObj.jitter);
    update(charts.throu, dataObj.throu);
    update(charts.loss, dataObj.loss);
    update(charts.size, dataObj.size);
}

// 6. UI INTERACTION
function switchDevice(dev) {
    activeDevice = dev;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if(document.getElementById('btn-' + dev)) document.getElementById('btn-' + dev).classList.add('active');

    document.querySelectorAll('.dev-view').forEach(v => v.classList.remove('active'));
    if(document.getElementById('view-' + dev)) document.getElementById('view-' + dev).classList.add('active');

    document.getElementById('active-device-label').innerText = dev.toUpperCase();
    
    resetUserInfo();
    updateCharts(historyData[dev]);
    updateDashboardCards(0,0,0,0,0);
}

function updateUserInfo(data) {
    let uid = data.userId || data.user_id || "-";
    // Jika uid adalah "unknown" (string), ubah jadi text biasa
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

function resetUserInfo() {
    document.getElementById('user-id').innerText = "-";
    document.getElementById('user-name').innerText = "-";
    document.getElementById('auth-status').innerText = "-";
    document.getElementById('auth-time').innerText = "-";
    document.getElementById('user-icon').className = "fas fa-user fa-4x text-secondary";
}

function updateDashboardCards(d, j, t, l, s) {
    document.getElementById('val-delay').innerText = parseFloat(d).toFixed(0) + " ms";
    document.getElementById('val-jitter').innerText = parseFloat(j).toFixed(0) + " ms";
    document.getElementById('val-throughput').innerText = parseFloat(t).toFixed(0) + " bps";
    document.getElementById('val-loss').innerText = parseFloat(l).toFixed(2) + " %";
    document.getElementById('val-size').innerText = s + " B";
}

function addLog(time, dev, id, msg, delay, status) {
    const table = document.getElementById("log-table-body");
    if (!table) return;

    const row = table.insertRow(0);
    const tStr = new Date(time).toLocaleTimeString();
    
    let badgeColor = "bg-secondary";
    if (dev === 'cam') badgeColor = "bg-primary";
    else if (dev === 'rfid') badgeColor = "bg-warning text-dark";
    else if (dev === 'finger') badgeColor = "bg-success";

    let statusBadge = (status && (status.includes('success') || status.includes('grant'))) ? 
        '<span class="badge bg-success">SUCCESS</span>' : '<span class="badge bg-danger">FAILED</span>';

    row.innerHTML = `
        <td><small>${tStr}</small></td>
        <td><span class="badge ${badgeColor}">${dev.toUpperCase()}</span></td>
        <td class="fw-bold">${id}</td>
        <td>${msg}</td>
        <td>${parseFloat(delay).toFixed(0)} ms</td>
        <td>${statusBadge}</td>
    `;
    
    if (table.rows.length > 15) table.deleteRow(15);
}

function kirimPerintah(cmd) {
    if (mqtt.isConnected) {
        mqtt.publish(TOPIC_CONTROL, cmd);
        alert("Perintah " + cmd + " dikirim!");
    } else alert("MQTT Disconnected");
}

function switchPage(page) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    
    const navs = document.querySelectorAll('.nav-item');
    if(page === 'dashboard') navs[1].classList.add('active'); 
    else if(page === 'network') navs[2].classList.add('active');
    
    if(page === 'network' && charts && charts.delay) charts.delay.resize();
}