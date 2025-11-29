// ========================================
// DASHBOARD.JS - FINAL FIXED FOR YOUR DEVICE
// Perbaikan: Menyesuaikan Topic dengan Console (auth & param)
// ========================================

// --- 1. KONFIGURASI ---
const ESP32_IP = "192.168.18.185"; 

// Konfigurasi MQTT
const MQTT_BROKER = "4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884;
const MQTT_ID = "admin_web_" + Math.random().toString(16).substr(2, 8);
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

// --- TOPIK YANG DISESUAIKAN DENGAN CONSOLE ANDA ---
const TOPIC_AUTH = "smartdoor/auth";   // Untuk Log & Info User
const TOPIC_PARAM = "smartdoor/param"; // Untuk Grafik & QoS
const TOPIC_CONTROL = "smartdoor/control";

// Variabel Global
let activeDevice = 'rfid'; // Default ke RFID dulu biar langsung kelihatan
const historyData = {
    cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
};

let charts = null;

// --- 2. INISIALISASI ---
window.onload = function() {
    console.log("🚀 System Starting...");
    
    // 1. BERSIHKAN DATA LAMA (PENTING!)
    const logTable = document.getElementById('log-table-body');
    if(logTable) logTable.innerHTML = ''; 

    // 2. Siapkan Grafik & MQTT
    initCharts(); 
    connectMQTT(); 
    
    // 3. Set tampilan awal
    switchDevice('rfid');
};

// --- 3. MQTT LOGIC (JANTUNG SISTEM) ---
const mqtt = new MQTTClient(MQTT_BROKER, MQTT_PORT, MQTT_ID);

function connectMQTT() {
    mqtt.connect(MQTT_USER, MQTT_PASS, true);
}

mqtt.on('connect', () => {
    console.log("✅ MQTT Connected! Subscribe to real topics...");
    document.getElementById('mqtt-status').innerText = "Online";
    document.getElementById('mqtt-status').className = "badge bg-success";
    
    // Subscribe ke topik yang BENAR
    mqtt.subscribe(TOPIC_AUTH);
    mqtt.subscribe(TOPIC_PARAM);
});

mqtt.on('messageArrived', (msg) => {
    const topic = msg.destinationName;
    const payload = msg.payloadString;
    
    console.log(`📩 IN [${topic}]:`, payload); // Debug di console

    try {
        const data = JSON.parse(payload);
        // Ambil nama device dari JSON (rfid, finger, atau cam)
        // Jika di JSON tulisannya "esp32cam", kita ubah jadi 'cam' biar cocok
        let dev = (data.device || 'rfid').toLowerCase();
        if (dev.includes('cam')) dev = 'cam';

        // --- SKENARIO 1: DATA AUTH (Untuk Log & Info User) ---
        if (topic === TOPIC_AUTH) {
            updateUserInfo(data);
            
            // Tambah ke tabel log
            let info = data.message || data.status;
            let uid = data.userId || data.user_id || "Unknown";
            // Jika data.authDelay tidak ada, pakai 0
            let delay = data.authDelay || 0; 
            
            addLog(Date.now(), dev, uid, info, delay, data.status);
        }

        // --- SKENARIO 2: DATA PARAM (Untuk Grafik & QoS) ---
        else if (topic === TOPIC_PARAM) {
            // Ambil data QoS
            let delay = data.delay || 0;
            let jitter = data.jitter || 0;
            let throughput = data.throughput || 0;
            let loss = 0; // Default 0 jika tidak dikirim alat
            let size = data.messageSize || 0;

            // Simpan ke history
            updateHistory(dev, delay, jitter, throughput, loss, size);

            // Update Tampilan HANYA jika device ini sedang dibuka
            if (dev === activeDevice) {
                updateDashboardCards(delay, jitter, throughput, loss, size);
                updateCharts(historyData[dev]);
            }
        }

    } catch (e) {
        console.error('❌ Error parsing JSON:', e);
    }
});

// --- 4. MANAJEMEN DATA & GRAFIK ---

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

function initCharts() {
    if (charts) return;
    const createChart = (id, label, color) => {
        const ctx = document.getElementById(id);
        if (!ctx) return null;
        return new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: label, data: [], borderColor: color, tension: 0.3, borderWidth: 2 }] },
            options: { animation: false, responsive: true, maintainAspectRatio: false, scales: { x: { display: false } } }
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

// --- 5. UI UPDATES ---

function switchDevice(dev) {
    activeDevice = dev;
    
    // Update Tab Button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('btn-' + dev);
    if(btn) btn.classList.add('active');

    // Update View
    document.querySelectorAll('.dev-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + dev);
    if(view) view.classList.add('active');

    document.getElementById('active-device-label').innerText = dev.toUpperCase();

    // Load history chart device ini
    updateCharts(historyData[dev]);
}

function updateUserInfo(data) {
    document.getElementById('user-id').innerText = data.userId || "-";
    document.getElementById('user-name').innerText = data.userName || "User " + (data.userId || "?");
    
    const statusEl = document.getElementById('auth-status');
    const iconEl = document.getElementById('user-icon');
    let status = (data.status || "").toLowerCase();

    if (status.includes("success") || status.includes("granted")) {
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

function addLog(time, dev, id, msg, delay, status) {
    const table = document.getElementById("log-table-body");
    if (!table) return;

    const row = table.insertRow(0);
    const tStr = new Date(time).toLocaleTimeString();
    
    let badgeColor = "bg-secondary";
    if (dev === 'cam') badgeColor = "bg-primary";
    else if (dev === 'rfid') badgeColor = "bg-warning text-dark";
    else if (dev === 'finger') badgeColor = "bg-success";

    let statusBadge = (status && status.includes('success')) ? 
        '<span class="badge bg-success">SUCCESS</span>' : 
        '<span class="badge bg-danger">FAILED</span>';

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
    
    // Handle chart resize
    if(page === 'network') setTimeout(() => { if(charts && charts.delay) charts.delay.resize(); }, 100);
}