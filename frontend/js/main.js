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
    if(window.ChartManager) chartManager = new ChartManager();
    initMQTT();
    setupEventListeners();
});

function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);
    
    mqttClient.on('connect', function() {
        const el = document.querySelector('#mqttStatus .status-text');
        el.textContent = "SYSTEM ONLINE";
        document.querySelector('#mqttStatus .dot').className = "dot connected";
        
        mqttClient.subscribe(MQTT_CONFIG.topics.auth);
        mqttClient.subscribe(MQTT_CONFIG.topics.param);
    });

    mqttClient.on('connectionLost', function() {
        document.querySelector('#mqttStatus .status-text').textContent = "OFFLINE";
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
    document.getElementById('lastFaceName').textContent = data.userName || "Unknown";
    document.getElementById('lastFaceStatus').textContent = data.status;
    
    // Auto Capture
    const imgUrl = `http://${ESP32_IP}/capture?t=${Date.now()}`;
    const imgEl = document.getElementById('lastFaceImage');
    imgEl.src = imgUrl;
    imgEl.style.display = 'block';
    document.getElementById('noFacePlaceholder').style.display = 'none';

    // Log
    const logDiv = document.getElementById('activityLog');
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `<strong>${new Date().toLocaleTimeString()}</strong> - ${data.userName} (${data.status})`;
    logDiv.prepend(item);
}

function handleParam(data) {
    document.getElementById('statDelay').textContent = (data.delay || 0) + " ms";
    document.getElementById('statPacketLoss').textContent = (data.packetLoss || 0) + " %";
    document.getElementById('statJitter').textContent = (data.jitter || 0) + " ms";
    
    if(chartManager) chartManager.updateChart(Date.now(), data.delay, data.throughput, data.messageSize, data.jitter, data.packetLoss);
    
    // Update Table
    document.getElementById('paramTopic').textContent = data.topic;
    document.getElementById('paramSize').textContent = data.messageSize;
    document.getElementById('paramQos').textContent = data.qos;
}

function setupEventListeners() {
    document.getElementById('btnOpenStream').addEventListener('click', () => {
        document.getElementById('streamModal').classList.add('show');
        document.getElementById('streamVideo').src = `http://${ESP32_IP}/stream`;
    });
    document.getElementById('closeStreamModal').addEventListener('click', () => {
        document.getElementById('streamModal').classList.remove('show');
        document.getElementById('streamVideo').src = "";
    });

    const send = (act) => {
        if(mqttClient.isConnected) mqttClient.publish(MQTT_CONFIG.topics.control, JSON.stringify({device:'esp32cam', action:act}));
    };
    
    document.getElementById('btnBukaPintu').addEventListener('click', () => send('open'));
    document.getElementById('btnKunciPintu').addEventListener('click', () => send('lock'));
}