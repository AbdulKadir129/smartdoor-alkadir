// ========================================
// DASHBOARD.JS - FINAL COMPLETE VERSION
// Fitur: Persistent Data, Delete API, Control Panel Logic, FIX Live Stream
// ========================================

// 1. KONFIGURASI (PENTING: GANTI INI DENGAN IP ANDA YANG SEKARANG)
const ESP32_IP = "192.168.18.185"; 

// Konfigurasi MQTT HiveMQ
const MQTT_BROKER = "4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884;
const MQTT_ID = "admin_web_" + Math.random().toString(16).substr(2, 8);
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

// Topik MQTT
const TOPIC_AUTH = "smartdoor/auth";   
const TOPIC_PARAM = "smartdoor/param"; 
const TOPIC_CONTROL = "smartdoor/control";

// Variabel Global
let activeDevice = 'finger'; 
let historyData = {
    cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
};
let logHistory = [];
let charts = null;
let prevDelay = 0; 

// INITIALIZATION
window.onload = function() {
    console.log("🚀 System Starting...");
    initCharts(); 
    loadDataFromLocal(); 
    connectMQTT(); 
    switchDevice('finger'); 
    refreshCam(); // Nyalakan kamera saat start
};

// MQTT LOGIC
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

            // Pakai sentTime dari alat, tapi dipaksa Number
            let sentTime = Number(data.sentTime) || arrivalTime;
            let realDelay = arrivalTime - sentTime;
            if (realDelay < 0) realDelay = 0;

            console.log('DEBUG AUTH', { sentTime, arrivalTime, realDelay });

            let info = data.message || data.status;
            let uid  = data.userId || data.user_id || "Unknown";
            addLog(arrivalTime, dev, uid, info, realDelay, 0, 0, data.status);
        } else if (topic === TOPIC_PARAM) {
            let sentTime = Number(data.sentTime) || arrivalTime;
            let delay    = arrivalTime - sentTime;
            if (delay < 0) delay = 0;

            let jitter = Math.abs(delay - prevDelay);
            prevDelay  = delay;
            let size       = data.messageSize || payload.length;
            let throughput = size * 8;
            let loss       = 0;

            console.log('DEBUG PARAM', { sentTime, arrivalTime, delay, jitter });

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

// DATA PERSISTENCE
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
        if(table) {
            table.innerHTML = "";
            logHistory.slice(0, 50).forEach(log => renderRow(log));
        }
    }
    updateCharts(historyData[activeDevice]);
}

// ========================================
// 3. LOGIKA KAMERA (LIVE STREAM FIX)
// ========================================
function refreshCam() {
    const img = document.getElementById('cam-feed');
    if(!img) return;

    // Masalah utama adalah HTTPS Render vs HTTP ESP32.
    // Kita harus menggunakan IP, dan browser harus di-set "Allow Insecure Content".
    // Kita tambahkan ?t= untuk menghindari cache browser yang menyimpan gambar rusak.
    const url = `http://${ESP32_IP}:80/stream`; 
    
    img.src = url;
    
    // Jika stream error/putus, coba sambung lagi
    img.onerror = function() {
        console.warn("⚠️ Stream terputus atau diblokir. Mencoba reconnect...");
        setTimeout(() => {
            img.src = url + "?t=" + new Date().getTime();
        }, 3000);
    };
}

// ========================================
// 4. CONTROL PANEL LOGIC (Kunci/Buka/Enroll/Delete)
// ========================================
function kirimPerintah(cmd) {
    if (!mqtt.isConnected) { alert("MQTT Disconnected"); return; }
    const payload = JSON.stringify({ cmd: cmd });
    mqtt.publish(TOPIC_CONTROL, payload);
    alert("Perintah Terkirim: " + cmd.toUpperCase());
}

function submitEnroll() {
    const device = document.getElementById('enrollDevice').value;
    const id = document.getElementById('enrollID').value;

    if (!id) { alert("Harap isi ID User!"); return; }
    if (!mqtt.isConnected) { alert("MQTT Disconnected"); return; }

    const payload = JSON.stringify({
        cmd: "enroll",
        type: device,
        id: parseInt(id)
    });

    mqtt.publish(TOPIC_CONTROL, payload);
    alert(`Perintah REKAM dikirim ke ${device.toUpperCase()} untuk ID: ${id}`);
    
    const modalEl = document.getElementById('enrollModal');
    if(modalEl) {
        try {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if(modal) modal.hide();
        } catch(e) {
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
            const backdrop = document.querySelector('.modal-backdrop');
            if(backdrop) backdrop.remove();
        }
    }
}

function confirmDeleteUser() {
    const device = document.getElementById('deleteDevice').value;
    const id = document.getElementById('deleteID').value;

    if (!id || parseInt(id) <= 0) { alert("Harap masukkan ID User (angka positif) yang valid."); return; }
    if (!mqtt.isConnected) { alert("MQTT Disconnected! Server tidak bisa mengirim perintah."); return; }

    if (!confirm(`⚠️ PERINGATAN! Anda akan menghapus User ID ${id} dari perangkat ${device.toUpperCase()} secara PERMANEN. Lanjutkan?`)) { return; }

    const payload = JSON.stringify({ cmd: "delete", type: device, id: parseInt(id) });
    mqtt.publish(TOPIC_CONTROL, payload);
    alert(`Perintah HAPUS dikirim ke ${device.toUpperCase()} untuk ID: ${id}.`);
}

// DELETE DATABASE LOGIC
async function clearQoSDB() {
    if(!confirm("⚠️ PERINGATAN KERAS!\n\nAnda akan menghapus SELURUH data Network QoS di MongoDB Atlas secara PERMANEN.\nData tidak bisa dikembalikan!")) return;
    const btn = document.getElementById('btn-hapus-db');
    if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menghapus...'; btn.disabled = true; }
    try {
        const response = await fetch('/api/clear-qos', { method: 'DELETE' });
        if (response.status === 404) throw new Error("Backend belum diupdate (404)");
        const result = await response.json();
        if (result.success) {
            alert("✅ Sukses! Database MongoDB Atlas sudah bersih.");
            resetAllData(); 
        } else { throw new Error(result.error); }
    } catch (error) {
        console.error(error);
        alert("❌ GAGAL: " + error.message);
    } finally {
        if(btn) { btn.innerHTML = '<i class="fas fa-trash-alt me-2"></i> HAPUS DATA DATABASE'; btn.disabled = false; }
    }
}

function resetAllData() {
    historyData = {
        cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
        rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
        finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
    };
    logHistory = [];
    localStorage.removeItem('smartdoor_charts');
    localStorage.removeItem('smartdoor_logs');
    localStorage.removeItem('smartdoor_active');
    if(document.getElementById('log-table-body')) document.getElementById('log-table-body').innerHTML = '';
    if(charts) {
        ['delay', 'jitter', 'throu', 'loss', 'size'].forEach(key => {
            if (charts[key]) {
                charts[key].data.labels = [];
                charts[key].data.datasets[0].data = [];
                charts[key].update();
            }
        });
    }
    updateDashboardCards(0,0,0,0,0);
    resetUserInfo();
}

// UI HELPERS (Chart, Data, Navigation)
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

function addLog(time, dev, id, msg, delay, jitter, throu, status) {
    const logData = { time, dev, id, msg, delay: parseFloat(delay).toFixed(0), jitter: parseFloat(jitter).toFixed(0), throu: parseFloat(throu).toFixed(0), status };
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

// NAVIGATION & TABS
function switchPage(page) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    
    const navs = document.querySelectorAll('.nav-item');
    if(page === 'dashboard' && navs[0]) navs[0].classList.add('active'); 
    else if(page === 'network' && navs[1]) navs[1].classList.add('active');
    else if(page === 'control' && navs[2]) navs[2].classList.add('active');
    else if(page === 'data' && navs[3]) navs[3].classList.add('active');

    const tabContainer = document.querySelector('.device-tabs');
    if(tabContainer) {
        if (page === 'control' || page === 'data') tabContainer.style.display = 'none';
        else tabContainer.style.display = 'flex';
    }
    
    if(page === 'network' && charts && charts.delay) charts.delay.resize();
}

function switchDevice(dev) {
    activeDevice = dev;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if(document.getElementById('btn-' + dev)) document.getElementById('btn-' + dev).classList.add('active');
    document.querySelectorAll('.dev-view').forEach(v => v.classList.remove('active'));
    if(document.getElementById('view-' + dev)) document.getElementById('view-' + dev).classList.add('active');
    document.getElementById('active-device-label').innerText = dev.toUpperCase();
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
        statusEl.innerText = "GRANTED"; statusEl.className = "fw-bold text-success"; iconEl.className = "fas fa-user-check fa-4x text-success";
    } else {
        statusEl.innerText = "DENIED"; statusEl.className = "fw-bold text-danger"; iconEl.className = "fas fa-user-times fa-4x text-danger";
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