window.BASE_URL = 'https://smartdoor-alkadir.onrender.com';

// --- CONFIG ESP32 (GANTI SESUAI SERIAL MONITOR) ---
const ESP32_IP = "192.168.18.185"; 

const MQTT_CONFIG = {
    broker: '4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud',
    port: 8884,
    username: 'Alkadir',
    password: 'Alkadir123',
    topics: {
        auth: 'smartdoor/auth',
        control: 'smartdoor/control',
        param: 'smartdoor/param'
    }
};

let mqttClient = null;
let chartManager = null;
let deviceManager = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 SYSTEM STARTUP");
    
    // Cek Login
    if(!sessionStorage.getItem('userName')) {
        window.location.href = 'login.html';
        return;
    }
    document.getElementById('userName').textContent = sessionStorage.getItem('userName');

    // Init Modules
    if(window.DeviceManager) deviceManager = new DeviceManager();
    if(window.ChartManager) chartManager = new ChartManager();
    
    initMQTT();
    setupEventListeners();
});

function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);
    
    mqttClient.on('connect', function() {
        const el = document.getElementById('mqttStatus');
        el.querySelector('.status-dot').className = 'status-dot connected';
        el.querySelector('.status-text').textContent = 'SYSTEM ONLINE';
        el.style.borderColor = 'var(--success)';
        
        mqttClient.subscribe(MQTT_CONFIG.topics.auth);
        mqttClient.subscribe(MQTT_CONFIG.topics.param);
        
        console.log("✅ MQTT Connected!");
    });

    mqttClient.on('connectionLost', function() {
        const el = document.getElementById('mqttStatus');
        el.querySelector('.status-dot').className = 'status-dot disconnected';
        el.querySelector('.status-text').textContent = 'SYSTEM OFFLINE';
        console.log("❌ MQTT Disconnected");
    });

    mqttClient.on('messageArrived', function(message) {
        const topic = message.destinationName;
        try {
            const payload = JSON.parse(message.payloadString);
            if (topic === MQTT_CONFIG.topics.auth) handleAuth(payload);
            if (topic === MQTT_CONFIG.topics.param) handleParam(payload);
        } catch (e) { console.error("JSON Error", e); }
    });

    mqttClient.connect(MQTT_CONFIG.username, MQTT_CONFIG.password, true);
}

function handleAuth(data) {
    // 1. Update UI Kartu Wajah
    document.getElementById('lastFaceName').textContent = data.userName || "Unknown";
    document.getElementById('lastFaceSimilarity').textContent = (data.similarity || 0).toFixed(2);
    
    const statusEl = document.getElementById('lastFaceStatus');
    statusEl.textContent = data.status === 'success' ? "GRANTED" : "DENIED";
    statusEl.className = data.status === 'success' ? "status-badge" : "status-badge warning";
    
    document.getElementById('lastFaceTime').textContent = new Date().toLocaleTimeString();

    // 2. AUTO CAPTURE FOTO DARI ESP32
    // Tambah timestamp (?t=...) agar browser tidak menyimpan cache foto lama
    const imgUrl = `http://${ESP32_IP}/capture?t=${Date.now()}`;
    const imgEl = document.getElementById('lastFaceImage');
    imgEl.src = imgUrl;
    imgEl.style.display = 'block';
    document.getElementById('noFacePlaceholder').style.display = 'none';

    // 3. Update Stats
    document.getElementById('statTotal').innerText++;
    if(data.status === 'success') document.getElementById('statSuccess').innerText++;
    else document.getElementById('statFailed').innerText++;

    // 4. Log Activity
    addLog(data);

    // 5. Kirim ke Backend (Opsional)
    // fetch(window.BASE_URL + '/api/auth/log', { method: 'POST', body: JSON.stringify(data), headers: {'Content-Type': 'application/json'} });
}

function handleParam(data) {
    // Update Angka Utama
    document.getElementById('statDelay').textContent = data.delay || 0;
    
    // Update Grafik
    if(chartManager) {
        chartManager.updateChart(
            Date.now(), 
            data.delay, 
            data.throughput, 
            data.messageSize, 
            data.jitter, 
            data.packetLoss
        );
    }

    // Update Tabel Network Details
    document.getElementById('mqttTopic').textContent = data.topic || MQTT_CONFIG.topics.param;
    document.getElementById('mqttSize').textContent = (data.messageSize || 0) + " Bytes";
    document.getElementById('mqttQos').textContent = data.qos || 1;
    
    let payloadShort = data.payload || "-";
    if(payloadShort.length > 30) payloadShort = payloadShort.substring(0, 30) + "...";
    document.getElementById('mqttPayload').textContent = payloadShort;
}

function addLog(data) {
    const container = document.getElementById('activityLog');
    const item = document.createElement('div');
    item.className = `log-item ${data.status}`;
    item.innerHTML = `
        <span class="log-time">${new Date().toLocaleTimeString()}</span>
        <strong>${data.userName || 'Unknown'}</strong> - ${data.status.toUpperCase()}
    `;
    container.prepend(item);
}

function setupEventListeners() {
    // Tombol Stream
    document.getElementById('btnOpenStream').addEventListener('click', () => {
        document.getElementById('streamModal').classList.add('show');
        document.getElementById('streamVideo').src = `http://${ESP32_IP}/stream`;
    });

    document.getElementById('closeStreamModal').addEventListener('click', () => {
        document.getElementById('streamModal').classList.remove('show');
        document.getElementById('streamVideo').src = "";
    });

    // Tombol Kontrol Pintu
    const send = (action) => {
        if(!mqttClient || !mqttClient.isConnected) return alert("System Offline!");
        const payload = JSON.stringify({ device: 'esp32cam', action: action });
        mqttClient.publish(MQTT_CONFIG.topics.control, payload);
    };

    document.getElementById('btnBukaPintu').addEventListener('click', () => send('open'));
    document.getElementById('btnKunciPintu').addEventListener('click', () => send('lock'));
    
    // Tombol Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = 'login.html';
    });
    
    // Modal User
    const modalUser = document.getElementById('modalAddUser');
    document.getElementById('btnTambahUser').addEventListener('click', () => modalUser.classList.add('show'));
    document.getElementById('closeUserModal').addEventListener('click', () => modalUser.classList.remove('show'));
}