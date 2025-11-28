window.BASE_URL = 'https://smartdoor-alkadir.onrender.com';

// --- GANTI IP INI SESUAI SERIAL MONITOR ---
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
    // Cek Login
    if(!sessionStorage.getItem('userName')) {
        window.location.href = 'login.html';
        return;
    }
    document.getElementById('userName').textContent = sessionStorage.getItem('userName');

    if(window.ChartManager) chartManager = new ChartManager();
    initMQTT();
    setupEventListeners();
});

function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);
    
    mqttClient.on('connect', function() {
        document.querySelector('#mqttStatus .text').textContent = "SYSTEM ONLINE";
        document.querySelector('#mqttStatus .dot').className = "dot connected";
        
        mqttClient.subscribe(MQTT_CONFIG.topics.auth);
        mqttClient.subscribe(MQTT_CONFIG.topics.param);
    });

    mqttClient.on('connectionLost', function() {
        document.querySelector('#mqttStatus .text').textContent = "OFFLINE";
        document.querySelector('#mqttStatus .dot').className = "dot disconnected";
    });

    mqttClient.on('messageArrived', function(message) {
        const topic = message.destinationName;
        try {
            const payload = JSON.parse(message.payloadString);
            if (topic === MQTT_CONFIG.topics.auth) handleAuth(payload);
            if (topic === MQTT_CONFIG.topics.param) handleParam(payload);
        } catch(e) {}
    });

    mqttClient.connect(MQTT_CONFIG.username, MQTT_CONFIG.password, true);
}

function handleAuth(data) {
    // 1. Update Teks Dashboard
    document.getElementById('lastFaceName').textContent = data.userName || "Unknown";
    
    const statusEl = document.getElementById('lastFaceStatus');
    statusEl.textContent = data.status === 'success' ? "GRANTED" : "DENIED";
    statusEl.style.background = data.status === 'success' ? "#dcfce7" : "#fee2e2";
    statusEl.style.color = data.status === 'success' ? "#166534" : "#991b1b";

    // 2. AUTO CAPTURE FOTO DARI ESP32
    const imgUrl = `http://${ESP32_IP}/capture?t=${Date.now()}`;
    const imgEl = document.getElementById('lastFaceImage');
    imgEl.src = imgUrl;
    imgEl.style.display = 'block';
    document.getElementById('noFacePlaceholder').style.display = 'none';

    // 3. Log
    addLog(data);
}

function handleParam(data) {
    // Statistik
    document.getElementById('statDelay').textContent = (data.delay || 0) + " ms";
    document.getElementById('statPacketLoss').textContent = (data.packetLoss || 0) + " %";
    document.getElementById('statJitter').textContent = (data.jitter || 0) + " ms";
    
    // Update Grafik
    if(chartManager) chartManager.updateChart(Date.now(), data.delay, data.throughput, data.messageSize, data.jitter, data.packetLoss);
    
    // Update Data Teknis
    document.getElementById('paramTopic').textContent = "Topic: " + (data.topic || "-");
    document.getElementById('paramSize').textContent = "Size: " + (data.messageSize || 0) + " B";
    document.getElementById('paramQos').textContent = "QoS: " + (data.qos || 0);
}

function addLog(data) {
    const container = document.getElementById('activityLog');
    const item = document.createElement('div');
    item.className = 'log-item';
    item.style.borderLeft = data.status === 'success' ? "3px solid #10b981" : "3px solid #ef4444";
    item.innerHTML = `
        <small>${new Date().toLocaleTimeString()}</small><br>
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
        document.getElementById('streamVideo').src = "";
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    // MQTT Control
    const send = (act) => {
        if(mqttClient.isConnected) mqttClient.publish(MQTT_CONFIG.topics.control, JSON.stringify({device:'esp32cam', action:act}));
    };
    
    document.getElementById('btnBukaPintu').addEventListener('click', () => send('open'));
    document.getElementById('btnKunciPintu').addEventListener('click', () => send('lock'));
}