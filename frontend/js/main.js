// ========================================
// MAIN.JS - SMART DOOR DASHBOARD
// 100% Real MQTT Data + Render Backend
// Untuk Skripsi Analisis Jaringan MQTT QoS
// ========================================

window.BASE_URL = 'https://smartdoor-alkadir.onrender.com';

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

// Global state
let mqttClient = null;
let chartManager = null;
let deviceManager = null;
let currentDevice = 'esp32cam';
let faceHistoryLog = [];
const MAX_HISTORY = 15;

let realtimeStats = {
    esp32cam: { total: 0, success: 0, failed: 0, paramCount: 0, avgDelay: 0, avgThroughput: 0, avgMsgSize: 0, avgJitter: 0, avgPacketLoss: 0 },
    rfid: { total: 0, success: 0, failed: 0, paramCount: 0, avgDelay: 0, avgThroughput: 0, avgMsgSize: 0, avgJitter: 0, avgPacketLoss: 0 },
    fingerprint: { total: 0, success: 0, failed: 0, paramCount: 0, avgDelay: 0, avgThroughput: 0, avgMsgSize: 0, avgJitter: 0, avgPacketLoss: 0 }
};

let lastDelayPerDevice = {
    esp32cam: null,
    rfid: null,
    fingerprint: null
};

// ESP32-CAM IP (GANTI SESUAI IP KAMU)
const CAM_IP = '192.168.1.100';

// ========================================
// MQTT CLIENT CLASS
// ========================================
class MQTTClient {
    constructor(broker, port) {
        this.broker = `wss://${broker}:${port}/mqtt`;
        this.client = new Paho.MQTT.Client(this.broker, 'smartdoor-web-' + Math.random().toString(16).substr(2, 8));
        this.client.onMessageArrived = this.onMessageArrived.bind(this);
        this.callbacks = {};
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    connect(username, password, cleanSession) {
        this.client.connect({
            onSuccess: () => {
                if (this.callbacks.connect) this.callbacks.connect();
            },
            onFailure: (e) => {
                console.error('MQTT connect failed:', e);
                setTimeout(() => this.connect(username, password, cleanSession), 5000);
            },
            userName: username,
            password: password,
            useSSL: true,
            cleanSession: cleanSession
        });
    }

    subscribe(topic, qos) {
        this.client.subscribe(topic, { qos: qos });
    }

    publish(topic, message, qos) {
        const payload = new Paho.MQTT.Message(message);
        payload.destinationName = topic;
        payload.qos = qos;
        this.client.send(payload);
    }

    disconnect() {
        this.client.disconnect();
    }

    isConnected() {
        return this.client.isConnected();
    }
}

// ========================================
// CHART MANAGER
// ========================================
class ChartManager {
    constructor() {
        this.charts = {};
        this.dataHistory = {
            delay: [], throughput: [], jitter: [], packetLoss: []
        };
        this.initCharts();
    }

    initCharts() {
        const charts = ['chartDelay', 'chartThroughput', 'chartJitter', 'chartPacketLoss'];
        charts.forEach(id => {
            const ctx = document.getElementById(id)?.getContext('2d');
            if (ctx) {
                this.charts[id] = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: id.replace('chart', ''),
                            data: [],
                            borderColor: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.1)',
                            tension: 0.4,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: { y: { beginAtZero: true } },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        });
    }

    updateChart(delay, throughput, msgSize, jitter, packetLoss) {
        const time = new Date().toLocaleTimeString();
        
        // Keep max 50 points
        if (this.dataHistory.delay.length >= 50) {
            this.dataHistory.delay.shift();
            this.dataHistory.throughput.shift();
            this.dataHistory.jitter.shift();
            this.dataHistory.packetLoss.shift();
        }

        this.dataHistory.delay.push(delay);
        this.dataHistory.throughput.push(throughput);
        this.dataHistory.jitter.push(jitter);
        this.dataHistory.packetLoss.push(packetLoss);

        // Update all charts
        Object.keys(this.charts).forEach(key => {
            const dataKey = key.replace('chart', '').toLowerCase();
            this.charts[key].data.labels = this.dataHistory.delay.map((_, i) => 
                new Date(Date.now() - (this.dataHistory.delay.length - i) * 2000).toLocaleTimeString());
            this.charts[key].data.datasets[0].data = this.dataHistory[dataKey];
            this.charts[key].update('none');
        });
    }
}

// ========================================
// DEVICE MANAGER
// ========================================
class DeviceManager {
    switchDevice(device) {
        currentDevice = device;
        document.querySelectorAll('.device-card').forEach(card => 
            card.classList.toggle('active', card.dataset.device === device));
        
        // Update stats display
        updateStatisticsDisplay(device);
    }
}

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Smart Door Dashboard Initialized');
    
    // Check login
    const userName = sessionStorage.getItem('userName');
    if (!userName) {
        window.location.href = 'login.html';
        return;
    }
    document.getElementById('userName').textContent = userName;
    
    // Init managers
    deviceManager = new DeviceManager();
    chartManager = new ChartManager();
    
    // Start MQTT + load initial stats
    initMQTT();
    setupEventListeners();
    deviceManager.switchDevice('esp32cam');
    setupHistoryModal();
    updateTimestamp();
    setInterval(updateTimestamp, 1000);
});

// ========================================
// MQTT SETUP
// ========================================
function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);
    
    mqttClient.on('connect', function() {
        updateMQTTStatus(true);
        mqttClient.subscribe(MQTT_CONFIG.topics.auth, 1);
        mqttClient.subscribe(MQTT_CONFIG.topics.param, 1);
        showToast('✅ MQTT Connected to HiveMQ Cloud', 'success');
    });
    
    mqttClient.on('connectionLost', function() {
        updateMQTTStatus(false);
        showToast('❌ MQTT Disconnected', 'error');
    });
    
    mqttClient.on('messageArrived', function(message) {
        handleMQTTMessage(message);
    });
    
    mqttClient.connect(MQTT_CONFIG.username, MQTT_CONFIG.password, true);
}

function updateMQTTStatus(connected) {
    const statusEl = document.getElementById('mqttStatus');
    const dotEl = statusEl?.querySelector('.status-dot');
    const textEl = statusEl?.querySelector('.status-text');
    
    if (connected) {
        dotEl?.classList.add('connected');
        dotEl?.classList.remove('disconnected');
        textEl.textContent = 'Connected';
    } else {
        dotEl?.classList.add('disconnected');
        dotEl?.classList.remove('connected');
        textEl.textContent = 'Disconnected';
    }
}

// ========================================
// MQTT MESSAGE HANDLER
// ========================================
function handleMQTTMessage(message) {
    const topic = message.destinationName;
    const payload = message.payloadString;
    
    try {
        const data = JSON.parse(payload);
        
        if (topic === MQTT_CONFIG.topics.auth) {
            handleAuthMessage(data);
        } else if (topic === MQTT_CONFIG.topics.param) {
            handleParamMessage(data);
        }
    } catch (error) {
        console.error('❌ MQTT parse error:', error);
    }
}

// ========================================
// AUTH HANDLER
// ========================================
async function handleAuthMessage(data) {
    const device = data.device || 'esp32cam';
    
    realtimeStats[device].total++;
    if (data.status === 'success') realtimeStats[device].success++;
    else realtimeStats[device].failed++;
    
    updateDeviceBadgeCount(device, realtimeStats[device].total);
    
    // Face recognition history
    if (device === 'esp32cam' && data.image) {
        faceHistoryLog.unshift({
            time: new Date().toLocaleString('id-ID'),
            userName: data.userName || '-',
            userId: data.userId || '-',
            image: data.image,
            status: data.status
        });
        if (faceHistoryLog.length > MAX_HISTORY) faceHistoryLog.pop();
        updateLastFacePanel(data);
    }
    
    // Update display + send to backend
    if (device === currentDevice) {
        updateStatisticsDisplay(device);
        addActivityLogItem(data);
    }
    
    // Save to backend
    try {
        await fetch(`${window.BASE_URL}/api/auth/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        showToast(`✅ ${device.toUpperCase()}: ${data.status}`, data.status === 'success' ? 'success' : 'error');
    } catch (e) {
        console.error('Backend save error:', e);
    }
}

// ========================================
// PARAM HANDLER - 100% REAL QOS
// ========================================
async function handleParamMessage(data) {
    const device = data.device || 'esp32cam';
    const browserReceiveTime = Date.now();
    const espSentTime = data.sentTime || null;
    const msgSize = parseInt(data.messageSize) || 0;
    
    // Real QoS calculation
    const networkDelay = espSentTime ? Math.max(0, browserReceiveTime - espSentTime) : 0;
    const throughput = networkDelay > 0 ? Math.round((msgSize * 8 * 1000) / networkDelay) : 0;
    const jitter = lastDelayPerDevice[device] !== null ? Math.abs(networkDelay - lastDelayPerDevice[device]) : 0;
    
    lastDelayPerDevice[device] = networkDelay;
    
    // Update data
    data.delay = Math.round(networkDelay);
    data.throughput = throughput;
    data.jitter = Math.round(jitter);
    data.packetLoss = 0;
    
    // Update stats
    realtimeStats[device].paramCount++;
    realtimeStats[device].avgDelay = (realtimeStats[device].avgDelay * (realtimeStats[device].paramCount - 1) + networkDelay) / realtimeStats[device].paramCount;
    realtimeStats[device].avgThroughput = (realtimeStats[device].avgThroughput * (realtimeStats[device].paramCount - 1) + throughput) / realtimeStats[device].paramCount;
    
    // Update UI
    if (device === currentDevice) {
        updateParamDisplay(data);
        if (chartManager) {
            chartManager.updateChart(networkDelay, throughput, msgSize, jitter, 0);
        }
        updateStatisticsDisplay(device);
    }
    
    // Send to backend for packet loss calculation
    const logData = {
        device, payload: data.payload || 'MQTT Data', messageSize: msgSize,
        sentTime: espSentTime, receiveTime: browserReceiveTime,
        delay: networkDelay, throughput, jitter, sequenceNumber: data.sequenceNumber || 0
    };
    
    try {
        const response = await fetch(`${window.BASE_URL}/api/param/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logData)
        });
        const result = await response.json();
        
        if (result.success && device === currentDevice) {
            data.packetLoss = result.data?.packetLoss || 0;
            realtimeStats[device].avgPacketLoss = (realtimeStats[device].avgPacketLoss * (realtimeStats[device].paramCount - 1) + data.packetLoss) / realtimeStats[device].paramCount;
            updateParamDisplay(data);
            if (chartManager) chartManager.updateChart(networkDelay, throughput, msgSize, jitter, data.packetLoss);
        }
    } catch (e) {
        console.error('Backend param error:', e);
    }
}

// ========================================
// UI UPDATE FUNCTIONS
// ========================================
function updateStatisticsDisplay(device) {
    const stats = realtimeStats[device];
    const elements = {
        statTotal: stats.total,
        statSuccess: stats.success,
        statFailed: stats.failed,
        statDelay: stats.avgDelay?.toFixed(1) + ' ms',
        statThroughput: stats.avgThroughput?.toFixed(0),
        statMsgSize: (stats.avgThroughput * (stats.avgDelay / 8000))?.toFixed(0) || 0 + ' B'
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
            el.style.transform = 'scale(1.1)';
            setTimeout(() => el.style.transform = 'scale(1)', 200);
        }
    });
}

function updateDeviceBadgeCount(device, count) {
    const badgeId = `badge${device.charAt(0).toUpperCase() + device.slice(1)}`;
    const badge = document.getElementById(badgeId);
    if (badge) {
        badge.textContent = count;
        badge.style.transform = 'scale(1.3)';
        setTimeout(() => badge.style.transform = 'scale(1)', 200);
    }
}

function updateParamDisplay(data) {
    const params = {
        paramPayload: data.payload?.substring(0, 50) + '...',
        paramTopic: data.topic || '-',
        paramDelay: data.delay + ' ms',
        paramThroughput: data.throughput?.toLocaleString() + ' bps',
        paramSize: data.messageSize + ' B',
        paramQos: data.qos || 1,
        paramJitter: data.jitter + ' ms',
        paramPacketLoss: (data.packetLoss || 0) + ' %'
    };
    
    Object.entries(params).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });
}

function addActivityLogItem(data) {
    const container = document.getElementById('activityLog');
    const noActivity = container?.querySelector('.no-activity');
    if (noActivity) noActivity.remove();
    
    const time = new Date().toLocaleTimeString('id-ID');
    const statusClass = data.status === 'success' ? 'success' : 'failed';
    
    const item = document.createElement('div');
    item.className = `activity-item ${statusClass}`;
    item.innerHTML = `
        <div class="activity-header">
            <span class="activity-title">${data.status === 'success' ? '✅' : '❌'} ${data.device?.toUpperCase()}</span>
            <span class="activity-time">${time}</span>
        </div>
        <div class="activity-details">${data.userName || data.userId || 'Unknown'}</div>
    `;
    container.insertBefore(item, container.firstChild);
    
    // Keep max 10 items
    if (container.children.length > 10) {
        container.removeChild(container.lastChild);
    }
}

function updateLastFacePanel(data) {
    const faceImg = document.getElementById('lastFaceImage');
    const faceInfo = document.getElementById('faceInfo');
    const placeholder = document.getElementById('noFacePlaceholder');
    
    if (data.image && data.status) {
        faceImg.src = 'data:image/jpeg;base64,' + data.image;
        document.getElementById('lastFaceName').textContent = data.userName || '-';
        document.getElementById('lastFaceId').textContent = data.userId || '-';
        document.getElementById('lastFaceStatus').textContent = data.status;
        document.getElementById('lastFaceTime').textContent = new Date().toLocaleString('id-ID');
        
        faceImg.style.display = 'block';
        faceInfo.style.display = 'block';
        placeholder.style.display = 'none';
    }
}

function renderFaceRecognitionHistory() {
    const historyDiv = document.getElementById('faceRecognitionHistory');
    if (faceHistoryLog.length === 0) {
        historyDiv.innerHTML = '<div class="no-activity">No face history</div>';
        return;
    }
    
    historyDiv.innerHTML = faceHistoryLog.map(log => `
        <div class="face-history-item">
            <img src="data:image/jpeg;base64,${log.image}" alt="face">
            <div class="face-history-meta">
                <div class="face-history-name">${log.userName} <span>(${log.userId})</span></div>
                <div class="face-history-time">${log.time}</div>
                <div class="face-history-status ${log.status}">${log.status}</div>
            </div>
        </div>
    `).join('');
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Device switching
    document.querySelectorAll('.device-card').forEach(card => {
        card.addEventListener('click', () => {
            deviceManager.switchDevice(card.dataset.device);
        });
    });
    
    // Control buttons
    document.getElementById('btnBukaPintu')?.addEventListener('click', () => handleDoorControl('open'));
    document.getElementById('btnKunciPintu')?.addEventListener('click', () => handleDoorControl('lock'));
    
    // QoS device selector
    document.getElementById('device-select-qos')?.addEventListener('change', (e) => {
        deviceManager.switchDevice(e.target.value);
    });
}

function setupHistoryModal() {
    const btnOpen = document.getElementById('btnShowHistory');
    const modal = document.getElementById('faceHistoryModal');
    const btnClose = document.getElementById('closeHistoryModal');
    
    btnOpen?.addEventListener('click', () => {
        renderFaceRecognitionHistory();
        modal.classList.add('show');
    });
    
    btnClose?.addEventListener('click', () => modal.classList.remove('show'));
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });
}

// ========================================
// CONTROL FUNCTIONS
// ========================================
function handleDoorControl(action) {
    if (!mqttClient?.isConnected()) {
        showToast('❌ MQTT not connected', 'error');
        return;
    }
    
    mqttClient.publish(MQTT_CONFIG.topics.control, 
        JSON.stringify({ device: currentDevice, action }), 1);
    showToast(`🚪 Door ${action.toUpperCase()} command sent`, 'info');
}

function updateTimestamp() {
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('id-ID');
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('notificationToast');
    const toastMsg = document.getElementById('toastMessage');
    
    toastMsg.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ========================================
// Paho MQTT Library (CDN fallback)
// ========================================
if (typeof Paho === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/paho-mqtt@1.0.1/paho-mqtt.min.js';
    script.onload = initMQTT;
    document.head.appendChild(script);
}
