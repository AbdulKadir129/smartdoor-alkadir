window.BASE_URL = 'https://smartdoor-alkadir.onrender.com';

// GANTI IP INI SESUAI SERIAL MONITOR (PENTING!)
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
    initMQTT();
    setupEventListeners();
    if(window.ChartManager) chartManager = new ChartManager();
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
    });

    mqttClient.on('connectionLost', function() {
        const el = document.getElementById('mqttStatus');
        el.querySelector('.status-dot').className = 'status-dot disconnected';
        el.querySelector('.status-text').textContent = 'OFFLINE';
    });

    mqttClient.on('messageArrived', function(message) {
        const topic = message.destinationName;
        const payload = JSON.parse(message.payloadString);
        if (topic === MQTT_CONFIG.topics.auth) handleAuth(payload);
        if (topic === MQTT_CONFIG.topics.param) handleParam(payload);
    });

    mqttClient.connect(MQTT_CONFIG.username, MQTT_CONFIG.password, true);
}

function handleAuth(data) {
    // Update Teks Dashboard
    document.getElementById('lastFaceName').textContent = data.userName || "Unknown";
    document.getElementById('lastFaceSimilarity').textContent = (data.similarity || 0).toFixed(2);
    
    const statusEl = document.getElementById('lastFaceStatus');
    statusEl.textContent = data.status === 'success' ? "GRANTED" : "DENIED";
    statusEl.className = data.status === 'success' ? "status-badge" : "status-badge warning";
    
    document.getElementById('lastFaceTime').textContent = new Date().toLocaleTimeString();

    // Update Statistik
    document.getElementById('statTotal').innerText++;
    if(data.status === 'success') document.getElementById('statSuccess').innerText++;
    else document.getElementById('statFailed').innerText++;

    // AUTO UPDATE FOTO DARI ESP32
    // Menggunakan timestamp agar tidak cache
    const imgUrl = `http://${ESP32_IP}/capture?t=${Date.now()}`;
    const imgEl = document.getElementById('lastFaceImage');
    imgEl.src = imgUrl;
    imgEl.style.display = 'block';
    document.getElementById('noFacePlaceholder').style.display = 'none';

    // Tambah Log
    const container = document.getElementById('activityLog');
    const item = document.createElement('div');
    item.className = `log-item ${data.status}`;
    item.innerHTML = `<strong>${data.userName || 'Unknown'}</strong> <br> <span style="font-size:9px">${new Date().toLocaleTimeString()}</span>`;
    container.prepend(item);
}

function handleParam(data) {
    document.getElementById('statDelay').textContent = data.delay || 0;
    document.getElementById('statThroughput').textContent = data.throughput + " bps";
    document.getElementById('statJitter').textContent = data.jitter + " ms";
    document.getElementById('statPacketLoss').textContent = data.packetLoss + " %";
    
    if(chartManager) chartManager.updateChart(Date.now(), data.delay, data.throughput, data.messageSize, data.jitter, data.packetLoss);
}

function setupEventListeners() {
    // Tombol Stream
    document.getElementById('btnOpenStream').addEventListener('click', () => {
        document.getElementById('streamModal').classList.add('show');
        document.getElementById('streamVideo').src = `http://${ESP32_IP}/stream`;
    });

    document.getElementById('closeStreamModal').addEventListener('click', () => {
        document.getElementById('streamModal').classList.remove('show');
        document.getElementById('streamVideo').src = ""; // Stop stream
    });

    // Tombol Kontrol
    const send = (action) => {
        if(!mqttClient.isConnected) return alert("Offline!");
        mqttClient.publish(MQTT_CONFIG.topics.control, JSON.stringify({ device: 'esp32cam', action: action }));
    };

    document.getElementById('btnBukaPintu').addEventListener('click', () => send('open'));
    document.getElementById('btnKunciPintu').addEventListener('click', () => send('lock'));
}