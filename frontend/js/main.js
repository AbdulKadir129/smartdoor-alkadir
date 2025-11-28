window.BASE_URL = 'https://smartdoor-alkadir.onrender.com';
const ESP32_IP = "192.168.18.185"; // GANTI SESUAI SERIAL MONITOR

const MQTT_CONFIG = {
    broker: '4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud',
    port: 8884,
    username: 'Alkadir', password: 'Alkadir123',
    topics: { auth: 'smartdoor/auth', control: 'smartdoor/control', param: 'smartdoor/param' }
};

let mqttClient, chartManager, deviceManager;

document.addEventListener('DOMContentLoaded', () => {
    if(!sessionStorage.getItem('userName')) { window.location.href = 'login.html'; return; }
    document.getElementById('userName').textContent = sessionStorage.getItem('userName');

    if(window.ChartManager) chartManager = new ChartManager();
    if(window.DeviceManager) deviceManager = new DeviceManager();

    initMQTT();
    setupEventListeners();
});

function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);
    mqttClient.on('connect', () => {
        document.querySelector('#mqttStatus .text').textContent = "SYSTEM ONLINE";
        document.querySelector('#mqttStatus .dot').className = "dot connected";
        mqttClient.subscribe(MQTT_CONFIG.topics.auth);
        mqttClient.subscribe(MQTT_CONFIG.topics.param);
    });
    mqttClient.on('connectionLost', () => {
        document.querySelector('#mqttStatus .text').textContent = "OFFLINE";
        document.querySelector('#mqttStatus .dot').className = "dot disconnected";
    });
    mqttClient.on('messageArrived', (msg) => {
        try {
            const data = JSON.parse(msg.payloadString);
            if (msg.destinationName === MQTT_CONFIG.topics.auth) handleAuth(data);
            if (msg.destinationName === MQTT_CONFIG.topics.param) handleParam(data);
        } catch(e){}
    });
    mqttClient.connect();
}

async function handleAuth(data) {
    document.getElementById('lastFaceName').textContent = data.userName || "Unknown";
    document.getElementById('lastFaceStatus').textContent = data.status === 'success' ? "GRANTED" : "DENIED";
    document.getElementById('lastFaceTime').textContent = new Date().toLocaleTimeString();
    document.getElementById('lastFaceSimilarity').textContent = (data.similarity || 0).toFixed(2);
    
    // Auto Capture
    const img = document.getElementById('lastFaceImage');
    img.src = `http://${ESP32_IP}/capture?t=${Date.now()}`;
    img.style.display = 'block';
    document.getElementById('noFacePlaceholder').style.display = 'none';

    // Stats & Log
    document.getElementById('statTotal').innerText++;
    if(data.status === 'success') document.getElementById('statSuccess').innerText++;
    else document.getElementById('statFailed').innerText++;

    addLog(data);

    // Simpan ke DB
    await fetch(window.BASE_URL + '/api/auth/log', { method: 'POST', body: JSON.stringify(data), headers: {'Content-Type': 'application/json'} });
}

async function handleParam(data) {
    document.getElementById('statDelay').textContent = data.delay || 0;
    document.getElementById('statThroughput').textContent = (data.throughput || 0) + " bps";
    document.getElementById('statMsgSize').textContent = (data.messageSize || 0) + " B";
    document.getElementById('statJitter').textContent = (data.jitter || 0) + " ms";
    document.getElementById('statPacketLoss').textContent = (data.packetLoss || 0) + " %";
    document.getElementById('statDelayHeader').textContent = data.delay || 0;

    document.getElementById('paramTopic').textContent = data.topic;
    document.getElementById('paramQos').textContent = data.qos;
    let pl = data.payload || "-";
    if(pl.length > 25) pl = pl.substring(0, 25) + "...";
    document.getElementById('paramPayload').textContent = pl;

    if(chartManager) chartManager.updateChart(Date.now(), data.delay, data.throughput, data.messageSize, data.jitter, data.packetLoss);

    // Simpan ke DB
    const logData = { device: data.device, payload: data.payload, topic: data.topic, messageSize: data.messageSize, qos: data.qos, sequenceNumber: data.sequenceNumber, delay: data.delay, throughput: data.throughput, jitter: data.jitter, packetLoss: data.packetLoss };
    await fetch(window.BASE_URL + '/api/param/log', { method: 'POST', body: JSON.stringify(logData), headers: {'Content-Type': 'application/json'} });
}

function addLog(data) {
    const container = document.getElementById('activityLog');
    const item = document.createElement('div');
    item.className = `log-item`;
    item.innerHTML = `<strong>${data.userName || 'Unknown'}</strong> - ${data.status.toUpperCase()} <span style="float:right; font-size:10px; color:#888;">${new Date().toLocaleTimeString()}</span>`;
    container.prepend(item);
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
    document.getElementById('logoutBtn').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });
    
    const send = (act) => { if(mqttClient.isConnected) mqttClient.publish(MQTT_CONFIG.topics.control, JSON.stringify({device:'esp32cam', action:act})); };
    document.getElementById('btnBukaPintu').addEventListener('click', () => send('open'));
    document.getElementById('btnKunciPintu').addEventListener('click', () => send('lock'));
}