window.BASE_URL = 'https://smartdoor-alkadir.onrender.com';

// --- CONFIG ESP32 ---
// GANTI IP INI SETIAP KALI ESP32 RESTART (LIHAT SERIAL MONITOR)
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

document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 SYSTEM STARTED");
    initMQTT();
    setupEventListeners();
    
    // Init Charts if exist
    if(window.ChartManager) chartManager = new ChartManager();
});

function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);
    
    mqttClient.on('connect', function() {
        updateStatus(true);
        mqttClient.subscribe(MQTT_CONFIG.topics.auth);
        mqttClient.subscribe(MQTT_CONFIG.topics.param);
    });

    mqttClient.on('connectionLost', function() { updateStatus(false); });

    mqttClient.on('messageArrived', function(message) {
        const topic = message.destinationName;
        const payload = JSON.parse(message.payloadString);

        if (topic === MQTT_CONFIG.topics.auth) handleAuth(payload);
        if (topic === MQTT_CONFIG.topics.param) handleParam(payload);
    });

    mqttClient.connect(MQTT_CONFIG.username, MQTT_CONFIG.password, true);
}

function updateStatus(connected) {
    const el = document.getElementById('mqttStatus');
    const dot = el.querySelector('.status-dot');
    const text = el.querySelector('.status-text');
    if(connected) {
        dot.className = 'status-dot connected';
        text.textContent = 'SYSTEM ONLINE';
        el.style.borderColor = 'var(--success)';
    } else {
        dot.className = 'status-dot disconnected';
        text.textContent = 'SYSTEM OFFLINE';
    }
}

// --- LOGIC UTAMA: UPDATE DASHBOARD & AUTO CAPTURE ---
function handleAuth(data) {
    // 1. Update Teks
    document.getElementById('lastFaceName').textContent = data.userName || "Unknown";
    document.getElementById('lastFaceSimilarity').textContent = (data.similarity || 0).toFixed(2);
    document.getElementById('lastFaceStatus').textContent = data.status === 'success' ? "GRANTED" : "DENIED";
    document.getElementById('lastFaceStatus').className = data.status === 'success' ? "status-badge" : "status-badge warning";
    document.getElementById('lastFaceTime').textContent = new Date().toLocaleTimeString();

    // 2. AUTO CAPTURE FOTO (Mengambil dari ESP32)
    const imgUrl = `http://${ESP32_IP}/capture?t=${Date.now()}`;
    document.getElementById('lastFaceImage').src = imgUrl;
    document.getElementById('lastFaceImage').style.display = 'block';
    document.getElementById('noFacePlaceholder').style.display = 'none';

    // 3. Tambah Log
    addLog(data);
}

function handleParam(data) {
    document.getElementById('statDelay').textContent = data.delay || 0;
    // Update charts here if needed
}

function addLog(data) {
    const container = document.getElementById('activityLog');
    const item = document.createElement('div');
    item.className = `log-item ${data.status}`;
    item.innerHTML = `
        <span class="log-time">${new Date().toLocaleTimeString()}</span>
        <strong>${data.userName || 'Unknown'}</strong> - Access ${data.status}
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
        document.getElementById('streamVideo').src = ""; // Stop stream biar hemat kuota
    });

    // Tombol Pintu
    document.getElementById('btnBukaPintu').addEventListener('click', () => sendCommand('open'));
    document.getElementById('btnKunciPintu').addEventListener('click', () => sendCommand('lock'));
}

function sendCommand(action) {
    if(!mqttClient.isConnected) {
        alert("System Offline!"); return;
    }
    const payload = JSON.stringify({ device: 'esp32cam', action: action });
    mqttClient.publish(MQTT_CONFIG.topics.control, payload);
}