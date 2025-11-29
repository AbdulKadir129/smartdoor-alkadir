// ========================================
// DASHBOARD.JS - ULTIMATE FIX
// Fitur: Simpan Data Permanen di Browser & Reset Total
// ========================================

// 1. KONFIGURASI
const ESP32_IP = "192.168.18.185"; 

const MQTT_BROKER = "4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884;
const MQTT_ID = "admin_web_" + Math.random().toString(16).substr(2, 8);
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

const TOPIC_AUTH = "smartdoor/auth";   
const TOPIC_PARAM = "smartdoor/param"; 
const TOPIC_CONTROL = "smartdoor/control";

// Variabel Data
let activeDevice = 'finger'; 

// Struktur Data Grafik (Default Kosong)
let historyData = {
    cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
};

let logHistory = []; // Simpan data tabel
let charts = null;
let prevDelay = 0; 

// ==================================================
// 2. INITIALIZATION
// ==================================================
window.onload = function() {
    console.log("🚀 System Starting...");
    
    // 1. Siapkan Grafik Dulu
    initCharts(); 

    // 2. Ambil Data Lama dari Memori Browser
    loadDataFromLocal();

    // 3. Konek MQTT
    connectMQTT(); 
    
    // 4. Tampilkan device terakhir
    switchDevice(activeDevice);
};

// ==================================================
// 3. MQTT LOGIC
// ==================================================
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
        
        let devRaw = (data.device || 'rfid').toLowerCase();
        let dev = 'rfid';
        if (devRaw.includes('cam')) dev = 'cam';
        else if (devRaw.includes('finger')) dev = 'finger';

        // LOGIKA TABEL (AUTH)
        if (topic === TOPIC_AUTH) {
            updateUserInfo(data);
            let sentTime = data.sentTime || arrivalTime;
            let realDelay = arrivalTime - sentTime;
            if (realDelay < 0) realDelay = 0;
            
            let info = data.message || data.status;
            let uid = data.userId || data.user_id || "Unknown";
            
            addLog(arrivalTime, dev, uid, info, realDelay, 0, 0, data.status);
        }

        // LOGIKA GRAFIK (PARAM)
        else if (topic === TOPIC_PARAM) {
            let sentTime = data.sentTime || arrivalTime;
            let delay = arrivalTime - sentTime; 
            if (delay < 0) delay = Math.abs(delay) % 10; 

            let jitter = Math.abs(delay - prevDelay);
            prevDelay = delay;

            let size = data.messageSize || payload.length;
            let throughput = size * 8; 
            let loss = 0; 

            // Masukkan ke Array Grafik
            updateHistory(dev, delay, jitter, throughput, loss, size);

            // Masukkan ke Tabel juga sebagai info
            addLog(arrivalTime, dev, "-", "QoS Report", delay, jitter, throughput, "INFO");

            // Update Tampilan jika sedang aktif
            if (dev === activeDevice) {
                updateDashboardCards(delay, jitter, throughput, loss, size);
                updateCharts(historyData[dev]);
            }
        }
        
        // SIMPAN SETIAP ADA DATA BARU
        saveDataToLocal();

    } catch (e) {
        console.error('❌ Error parsing JSON:', e);
    }
});

// ==================================================
// 4. DATA SAVING & LOADING (LOCAL STORAGE)
// ==================================================

function saveDataToLocal() {
    // Simpan Grafik
    localStorage.setItem('smartdoor_charts', JSON.stringify(historyData));
    // Simpan Tabel
    localStorage.setItem('smartdoor_logs', JSON.stringify(logHistory));
    // Simpan Device Terakhir yang dibuka
    localStorage.setItem('smartdoor_active', activeDevice);
}

function loadDataFromLocal() {
    // Load Grafik
    const savedCharts = localStorage.getItem('smartdoor_charts');
    if (savedCharts) {
        historyData = JSON.parse(savedCharts);
    }

    // Load Device Terakhir
    const savedActive = localStorage.getItem('smartdoor_active');
    if (savedActive) {
        activeDevice = savedActive;
    }

    // Load Tabel
    const savedLogs = localStorage.getItem('smartdoor_logs');
    if (savedLogs) {
        logHistory = JSON.parse(savedLogs);
        const table = document.getElementById("log-table-body");
        if(table) {
            table.innerHTML = "";
            logHistory.slice(0, 50).forEach(log => renderRow(log));
        }
    }
    
    // PENTING: Update Grafik di Layar setelah data di-load!
    updateCharts(historyData[activeDevice]);
}

// ==================================================
// 5. FUNGSI HAPUS TOTAL (RESET)
// ==================================================
function resetAllData() {
    if(!confirm("Yakin ingin menghapus SEMUA data tabel dan grafik?")) return;

    // 1. Reset Variabel Lokal
    historyData = {
        cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
        rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
        finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
    };
    logHistory = [];

    // 2. Hapus Memori Browser
    localStorage.removeItem('smartdoor_charts');
    localStorage.removeItem('smartdoor_logs');
    localStorage.removeItem('smartdoor_active');

    // 3. Bersihkan Tampilan Tabel
    document.getElementById('log-table-body').innerHTML = '';

    // 4. Bersihkan Tampilan Grafik (PENTING)
    if (charts) {
        ['delay', 'jitter', 'throu', 'loss', 'size'].forEach(key => {
            if (charts[key]) {
                charts[key].data.labels = [];
                charts[key].data.datasets[0].data = [];
                charts[key].update();
            }
        });
    }

    // 5. Reset Kartu Angka
    updateDashboardCards(0,0,0,0,0);
    resetUserInfo();

    alert("Semua data berhasil di-reset!");
}

// ==================================================
// 6. CHART MANAGEMENT
// ==================================================
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
    if (!charts || !dataObj) return;
    const update = (c, d) => { if(c) { c.data.labels = dataObj.labels; c.data.datasets[0].data = d; c.update(); } };
    update(charts.delay, dataObj.delay);
    update(charts.jitter, dataObj.jitter);
    update(charts.throu, dataObj.throu);
    update(charts.loss, dataObj.loss);
    update(charts.size, dataObj.size);
}

// ==================================================
// 7. UI HELPER
// ==================================================
function addLog(time, dev, id, msg, delay, jitter, throu, status) {
    const logData = {
        time: time,
        dev: dev,
        id: id,
        msg: msg,
        delay: parseFloat(delay).toFixed(0),
        jitter: parseFloat(jitter).toFixed(0),
        throu: parseFloat(throu).toFixed(0),
        status: status
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

    let statusBadge = log.status;
    if (log.status.toLowerCase().includes('success') || log.status.toLowerCase().includes('grant')) {
        statusBadge = '<span class="badge bg-success">SUCCESS</span>';
    } else if (log.status.toLowerCase().includes('fail') || log.status.toLowerCase().includes('denied')) {
        statusBadge = '<span class="badge bg-danger">FAILED</span>';
    } else if (log.status === 'INFO') {
        statusBadge = '<span class="badge bg-info text-dark">INFO</span>';
    }

    row.innerHTML = `
        <td><small>${tStr}</small></td>
        <td><span class="badge ${badgeColor}">${log.dev.toUpperCase()}</span></td>
        <td class="fw-bold">${log.id}</td>
        <td>${log.msg}</td>
        <td>${log.delay} ms</td>
        <td>${log.jitter} ms</td>
        <td>${log.throu} bps</td>
        <td>${statusBadge}</td>
    `;
    if (table.rows.length > 50) table.deleteRow(50);
}

function switchDevice(dev) {
    activeDevice = dev;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if(document.getElementById('btn-' + dev)) document.getElementById('btn-' + dev).classList.add('active');

    document.querySelectorAll('.dev-view').forEach(v => v.classList.remove('active'));
    if(document.getElementById('view-' + dev)) document.getElementById('view-' + dev).classList.add('active');

    document.getElementById('active-device-label').innerText = dev.toUpperCase();
    
    // Restore Grafik saat pindah tab
    if(historyData[dev]) updateCharts(historyData[dev]);
    
    resetUserInfo();
    updateDashboardCards(0,0,0,0,0);
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