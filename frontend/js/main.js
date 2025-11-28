// ========================================
// MAIN.JS - FINAL INTEGRATED LOGIC
// Menyatukan Logika QoS, MQTT Handling, UI Control, dan Backend Bridge.
// ========================================

window.BASE_URL = 'https://smartdoor-alkadir.onrender.com'; // Ganti ini jika server Anda berubah

const MQTT_CONFIG = {
    broker: '4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud',
    port: 8884,
    username: 'Alkadir',
    password: 'Alkadir123',
    topics: {
        auth: 'smartdoor/auth',
        param: 'smartdoor/param',
        control: 'smartdoor/control'
    }
};

// Variabel Global dan State
let mqttClient = null;
let chartManager = null;
let deviceManager = null;
let currentDevice = 'esp32cam';
const ESP32_IP = "192.168.1.15"; // IP Kamera Anda
const MAX_HISTORY = 15;

// State untuk menyimpan total dan rata-rata QoS per device
let realtimeStats = {
    esp32cam: { total: 0, success: 0, failed: 0, paramCount: 0, totalDelay: 0, totalThroughput: 0, totalMsgSize: 0, totalJitter: 0, totalPacketLoss: 0, avgDelay: 0, avgThroughput: 0, avgMsgSize: 0, avgJitter: 0, avgPacketLoss: 0 },
    rfid: { total: 0, success: 0, failed: 0, paramCount: 0, totalDelay: 0, totalThroughput: 0, totalMsgSize: 0, totalJitter: 0, totalPacketLoss: 0, avgDelay: 0, avgThroughput: 0, avgMsgSize: 0, avgJitter: 0, avgPacketLoss: 0 },
    fingerprint: { total: 0, success: 0, failed: 0, paramCount: 0, totalDelay: 0, totalThroughput: 0, totalMsgSize: 0, totalJitter: 0, totalPacketLoss: 0, avgDelay: 0, avgThroughput: 0, avgMsgSize: 0, avgJitter: 0, avgPacketLoss: 0 }
};

let lastDelayPerDevice = { esp32cam: null, rfid: null, fingerprint: null };

// ========================================
// INITIALIZATION & EVENT LISTENERS
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing Smart Door Dashboard...');
    
    const userName = sessionStorage.getItem('userName');
    if (!userName) {
        window.location.href = 'login.html'; 
        return;
    }
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = userName;
    
    // INIT MANAGERS (Asumsi Class sudah dimuat)
    if (typeof DeviceManager === 'function') deviceManager = new DeviceManager();
    if (typeof ChartManager === 'function') chartManager = new ChartManager();
    
    initMQTT();
    setupEventListeners();
    
    // Terapkan default view setelah semua dimuat
    switchDevice('dashboard'); 
    switchDevice('cam'); // Default aktif di ESP32-CAM
});

function setupEventListeners() {
    // 1. Device Switching
    document.querySelectorAll('.device-card').forEach(function(card) {
        card.addEventListener('click', function() {
            const device = this.getAttribute('data-device');
            // Logika switching ada di fungsi switchDevice
            switchDevice(device); 
        });
    });
    
    // 2. Control Buttons
    document.getElementById('btnBukaPintu').addEventListener('click', function() { handleDoorControl('open'); });
    document.getElementById('btnKunciPintu').addEventListener('click', function() { handleDoorControl('lock'); });
    document.getElementById('btnTambahUser').addEventListener('click', handleAddUser);
    
    // 3. Data Management Buttons
    document.getElementById('btnExportLogs').addEventListener('click', handleExportLogs);
    document.getElementById('btnClearAuthLogs').addEventListener('click', function() { handleClearLogs('auth'); });
    document.getElementById('btnClearParamLogs').addEventListener('click', function() { handleClearLogs('param'); });
    document.getElementById('btnClearAllLogs').addEventListener('click', handleClearAllLogs);
    document.getElementById('btnDownloadReport').addEventListener('click', handleDownloadReport);
    
    // 4. Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // 5. User Form Submit (Modal)
    var formAdd = document.getElementById('formAddUser');
    if (formAdd) formAdd.addEventListener('submit', handleSubmitUser);

    // 6. Modal Close
    var modal = document.getElementById('modalAddUser');
    if (modal) {
        var closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', function() { modal.classList.remove('show'); });
        window.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('show'); });
    }
}

// ========================================
// MQTT & QOS HANDLERS
// ========================================

function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);
    mqttClient.on('connect', onMqttConnect);
    mqttClient.on('connectionLost', onMqttConnectionLost);
    mqttClient.on('messageArrived', onMqttMessageArrived);
    mqttClient.connect(MQTT_CONFIG.username, MQTT_CONFIG.password, true);
}

function onMqttConnect() {
    updateMQTTStatus(true);
    mqttClient.subscribe(MQTT_CONFIG.topics.auth, 1);
    mqttClient.subscribe(MQTT_CONFIG.topics.param, 1);
    showToast('✅ Connected to HiveMQ Cloud', 'success');
}

function onMqttConnectionLost(response) {
    updateMQTTStatus(false);
    showToast('❌ MQTT Connection Lost', 'error');
}

function onMqttMessageArrived(message) {
    const topic = message.destinationName;
    const payload = message.payloadString;
    const arrivalTime = Date.now();
    const size = payload.length;

    let sourceDev = getSourceDevice(topic);
    if (!sourceDev) return; 

    try {
        const data = JSON.parse(payload);
        const sentTime = data.sentTime || arrivalTime;
        
        // --- QOS CALCULATION ---
        let delay = Math.abs(arrivalTime - sentTime); if (delay < 0) delay = 0;
        let jitter = 0;
        if (lastDelayPerDevice[sourceDev] !== null) {
            jitter = Math.abs(delay - lastDelayPerDevice[sourceDev]);
        }
        lastDelayPerDevice[sourceDev] = delay;
        
        // Perluas data untuk logging
        data.device = sourceDev;
        data.delay = Math.round(delay);
        data.jitter = Math.round(jitter);
        data.throughput = Math.round(size * 8); // Bps
        data.messageSize = size;
        data.packetLoss = data.packetLoss || 0; // Ambil dari backend jika ada
        data.sequenceNumber = data.sequenceNumber || 0;
        
        // --- 1. HANDLE AUTHENTICATION MESSAGE ---
        if (topic === MQTT_CONFIG.topics.auth) {
            handleAuthMessage(data); 
        } 
        // --- 2. HANDLE PARAMETER/QOS MESSAGE ---
        else if (topic === MQTT_CONFIG.topics.param) {
            handleParamMessage(data); 
        }
        
        // --- 3. UI UPDATE & HISTORY ---
        if (sourceDev === currentDevice) {
            updateParamDisplay(data); 
            updateUserInfo(data); 
            if (chartManager) chartManager.updateChart(arrivalTime, data.delay, data.throughput, data.messageSize, data.jitter, data.packetLoss);
            if (sourceDev === 'esp32cam') refreshCamImage(); 
        }
        
        // --- 4. LOG & SAVE TO DB ---
        let displayData = (sourceDev === 'esp32cam') ? (data.similarity ? data.similarity.toFixed(2) : '0.00') : (data.uid || 'Tap');
        addLog(data.sequenceNumber, sentTime, sourceDev, data.userId || data.uid, displayData, data.delay);
        saveLogToDatabase(data, sourceDev, topic); 

    } catch (error) {
        console.error('❌ Error processing MQTT payload:', error);
    }
}

async function handleAuthMessage(data) {
    // Dipanggil saat pesan dari smartdoor/auth masuk
    const device = data.device || 'esp32cam';
    
    // [Perlu fetch untuk update realtimeStats dari DB]
    
    // updateLastFacePanel(data); // Update panel wajah
    // updateStatisticsDisplay(device); // Update kartu statistik
    
    // Kirim Log ke Backend
    saveLogToDatabase(data, device, 'auth');
    addActivityLogItem(data);
}

async function handleParamMessage(data) {
    // Dipanggil saat pesan dari smartdoor/param masuk
    const device = data.device || 'esp32cam';
    
    // [Perlu fetch untuk update realtimeStats dari DB]
    
    // Kirim Log ke Backend
    saveLogToDatabase(data, device, 'param');
}

// ========================================
// API BRIDGE & UI HELPER FUNCTIONS
// ========================================

function saveLogToDatabase(data, device, type) {
    const API_ENDPOINT = `${window.BASE_URL}/api/${type}/log`; 
    
    const logData = {
        deviceId: device,
        userId: data.userId || data.uid || 'N/A',
        status: data.status || (data.userId > 0 ? "GRANTED" : "DENIED"),
        // Data QoS
        delay: data.delay || 0,
        jitter: data.jitter || 0,
        packetLoss: data.packetLoss || 0,
        messageSize: data.messageSize || 0,
        timestamp: new Date(data.sentTime).toISOString(),
        similarity: data.similarity || 0,
    };
    
    fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData)
    })
    .then(response => {
        if (!response.ok) console.error(`Error saving ${type} log to DB: ${response.status}`);
    })
    .catch(error => {
        console.error("Fetch API Error:", error);
    });
}


function updateMQTTStatus(connected) {
    const statusEl = document.getElementById('mqttStatus');
    if (!statusEl) return;
    const dotEl = statusEl.querySelector('.status-dot');
    const textEl = statusEl.querySelector('.status-text');
    if (connected) {
        dotEl.classList.remove('disconnected');
        dotEl.classList.add('connected');
        textEl.textContent = 'Connected to HiveMQ Cloud';
    } else {
        dotEl.classList.remove('connected');
        dotEl.classList.add('disconnected');
        textEl.textContent = 'Disconnected from MQTT Broker';
    }
}

function getSourceDevice(topic) {
    if (topic.includes('cam')) return 'esp32cam';
    if (topic.includes('rfid')) return 'rfid';
    if (topic.includes('finger')) return 'fingerprint';
    return null;
}

function refreshCamImage() {
    const url = `http://${ESP32_IP}/capture?t=${new Date().getTime()}`;
    const imgEl = document.getElementById('cam-feed');
    const placeholder = document.getElementById('noFacePlaceholder');
    if (imgEl) {
        imgEl.src = url;
        imgEl.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    }
}

function addLog(seq, time, dev, id, score, d) {
    const table = document.getElementById("log-table-body");
    if (!table) return;
    let row = table.insertRow(0);
    let tStr = new Date(time).toLocaleTimeString();
    
    let badgeColor = "bg-secondary"; let devIcon = "fa-microchip";
    if(dev === 'esp32cam') { badgeColor = "bg-primary"; devIcon = "fa-camera"; }
    else if(dev === 'rfid') { badgeColor = "bg-warning text-dark"; devIcon = "fa-id-card"; }
    else if(dev === 'fingerprint') { badgeColor = "bg-success"; devIcon = "fa-fingerprint"; }

    row.innerHTML = `
        <td><small class="text-muted">${tStr}</small></td>
        <td><span class="badge ${badgeColor}"><i class="fas ${devIcon} me-1"></i>${dev.toUpperCase()}</span></td>
        <td class="fw-bold">${id}</td>
        <td>${score ? score : '-'}</td>
        <td>${d} ms</td>
        <td><span class="badge bg-light text-dark border">Success</span></td>
    `;
    if(table.rows.length > 15) table.deleteRow(15);
}

// ========================================
// FUNGSI LAINNYA (Perlu ada definisi penuh di file ini)
// ========================================
function setupEventListeners() {
    // ... (Logika event listener dari kode Anda) ...
}

function updateUserInfo(data) {
    // ... (Logika update Last Authenticated panel) ...
}

function updateParamDisplay(data) {
    // ... (Logika update kartu QoS) ...
}

function updateStatisticsDisplay(device) {
    // ... (Logika update kartu Statistics Overview) ...
}

function updateDeviceBadgeCount(device, count) {
    // ... (Logika update badge di kartu device) ...
}

function addActivityLogItem(data) {
    // ... (Logika update Activity Log) ...
}

function handleDoorControl(action) {
    // ... (Logika kirim perintah MQTT) ...
}

function handleAddUser() {
    // ... (Logika buka modal tambah user) ...
}

function handleExportLogs() {
    // ... (Logika export CSV) ...
}

function handleClearLogs(type) {
    // ... (Logika clear log) ...
}

function handleClearAllLogs() {
    // ... (Logika clear semua log) ...
}

function handleDownloadReport() {
    // ... (Logika download report) ...
}

function handleLogout() {
    // ... (Logika logout) ...
}

function showToast(message, type) {
    // ... (Logika notifikasi toast) ...
}