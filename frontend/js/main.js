// ========================================
// MAIN.JS - 100% REAL DATA VERSION
// Smart Door Security System
// Untuk Analisis Jaringan MQTT (Skripsi)
// TANPA fake/random data
// ========================================

window.BASE_URL = 'https://smartdoor-alkadir.onrender.com';

// **TAMBAHKAN KONFIGURASI ESP32-CAM STREAM**
const ESP32_CAM_CONFIG = {
    streamUrl: 'http://192.168.1.100:81/stream', // ⚠️ GANTI dengan IP ESP32-CAM Anda
    reconnectInterval: 5000, // Coba reconnect setiap 5 detik
    enabled: true
};

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

let mqttClient = null;
let chartManager = null;
let deviceManager = null;
let currentDevice = 'esp32cam';
let faceHistoryLog = [];
const MAX_HISTORY = 15;

let realtimeStats = {
    esp32cam: { total: 0, success: 0, failed: 0, paramCount: 0, totalDelay: 0, totalThroughput: 0, totalMsgSize: 0, totalJitter: 0, totalPacketLoss: 0 },
    rfid: { total: 0, success: 0, failed: 0, paramCount: 0, totalDelay: 0, totalThroughput: 0, totalMsgSize: 0, totalJitter: 0, totalPacketLoss: 0 },
    fingerprint: { total: 0, success: 0, failed: 0, paramCount: 0, totalDelay: 0, totalThroughput: 0, totalMsgSize: 0, totalJitter: 0, totalPacketLoss: 0 }
};

let lastDelayPerDevice = {
    esp32cam: null,
    rfid: null,
    fingerprint: null
};

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing Smart Door Dashboard (100% Real Data)...');

    const userName = sessionStorage.getItem('userName');
    if (!userName) {
        window.location.href = 'login.html';
        return;
    }

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = userName;

    deviceManager = new DeviceManager();
    chartManager = new ChartManager();

    initMQTT();
    setupEventListeners();
    initializeRealtimeStats();
    deviceManager.switchDevice('esp32cam');
    setupHistoryModal();
    
    // **INISIALISASI LIVE STREAMING**
    initCameraStream();
});

// ========================================
// LIVE STREAMING FUNCTIONS - BARU
// ========================================
let streamRetryTimeout = null;

function initCameraStream() {
    if (!ESP32_CAM_CONFIG.enabled) {
        console.log('📹 Camera streaming disabled');
        return;
    }

    console.log('📹 Initializing camera stream...');
    const streamImg = document.getElementById('cameraStream');
    const statusText = document.getElementById('streamStatusText');
    const indicator = document.getElementById('streamIndicator');
    
    if (!streamImg) {
        console.error('❌ Stream image element not found');
        return;
    }

    // Set stream URL
    streamImg.src = ESP32_CAM_CONFIG.streamUrl;

    streamImg.onload = function() {
        console.log('✅ Camera stream connected');
        statusText.textContent = 'Live';
        indicator.classList.add('active');
        
        // Clear retry timeout
        if (streamRetryTimeout) {
            clearTimeout(streamRetryTimeout);
            streamRetryTimeout = null;
        }
    };

    streamImg.onerror = function() {
        console.log('❌ Camera stream failed, retrying...');
        statusText.textContent = 'Reconnecting...';
        indicator.classList.remove('active');
        
        // Retry connection
        if (streamRetryTimeout) clearTimeout(streamRetryTimeout);
        streamRetryTimeout = setTimeout(() => {
            console.log('🔄 Retrying camera stream connection...');
            streamImg.src = ESP32_CAM_CONFIG.streamUrl + '?t=' + Date.now(); // Cache bust
        }, ESP32_CAM_CONFIG.reconnectInterval);
    };
}

// Fungsi untuk toggle streaming (optional)
function toggleCameraStream() {
    ESP32_CAM_CONFIG.enabled = !ESP32_CAM_CONFIG.enabled;
    if (ESP32_CAM_CONFIG.enabled) {
        initCameraStream();
    } else {
        const streamImg = document.getElementById('cameraStream');
        if (streamImg) streamImg.src = '';
        document.getElementById('streamStatusText').textContent = 'Disabled';
        document.getElementById('streamIndicator').classList.remove('active');
    }
}

// ========================================
// MQTT INITIALIZATION
// ========================================
async function initializeRealtimeStats() {
    console.log('📊 Initializing real-time statistics...');
    const devices = ['esp32cam', 'rfid', 'fingerprint'];

    for (const device of devices) {
        try {
            const authRes = await fetch(window.BASE_URL + '/api/auth/stats/' + device);
            const authData = await authRes.json();
            if (authData.success) {
                realtimeStats[device].total = authData.stats.total || 0;
                realtimeStats[device].success = authData.stats.success || 0;
                realtimeStats[device].failed = authData.stats.failed || 0;
            }

            const paramRes = await fetch(window.BASE_URL + '/api/param/stats/' + device);
            const paramData = await paramRes.json();
            if (paramData.success) {
                realtimeStats[device].paramCount = paramData.stats.totalMessages || 0;
                realtimeStats[device].avgDelay = parseFloat(paramData.stats.avgDelay) || 0;
                realtimeStats[device].avgThroughput = parseFloat(paramData.stats.avgThroughput) || 0;
                realtimeStats[device].avgMsgSize = parseFloat(paramData.stats.avgMessageSize) || 0;
                realtimeStats[device].avgJitter = parseFloat(paramData.stats.avgJitter) || 0;
                realtimeStats[device].avgPacketLoss = parseFloat(paramData.stats.avgPacketLoss) || 0;
            }

            updateDeviceBadgeCount(device, realtimeStats[device].total);
        } catch (error) {
            console.error('❌ Error loading stats for ' + device + ':', error);
        }
    }
    console.log('✅ Real-time statistics initialized');
}

function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);

    mqttClient.on('connect', function() {
        updateMQTTStatus(true);
        mqttClient.subscribe(MQTT_CONFIG.topics.auth, 1);
        mqttClient.subscribe(MQTT_CONFIG.topics.param, 1);
        showToast('✅ Connected to HiveMQ Cloud', 'success');
    });

    mqttClient.on('connectionLost', function(response) {
        updateMQTTStatus(false);
        showToast('❌ MQTT Connection Lost', 'error');
    });

    mqttClient.on('messageArrived', function(message) {
        handleMQTTMessage(message);
    });

    mqttClient.connect(MQTT_CONFIG.username, MQTT_CONFIG.password, true);
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
        console.error('❌ Error parsing MQTT message:', error);
    }
}

// ========================================
// AUTH MESSAGE HANDLER - MODIFIED WITH AUTO-CAPTURE
// ========================================
function handleAuthMessage(data) {
    console.log('📥 Auth message received:', data);
    const device = data.device || 'esp32cam';

    // **AUTO-CAPTURE: Update panel wajah dengan gambar dari MQTT**
    if (device === 'esp32cam' && data.image) {
        updateLastFacePanel({
            image: data.image,
            userName: data.userName || data.user_name || 'Unknown',
            userId: data.userId || data.user_id || '-',
            status: data.status || (data.access ? 'GRANTED' : 'DENIED'),
            timestamp: data.timestamp || new Date().toISOString()
        });

        // Simpan ke history log
        addToFaceHistory({
            image: data.image,
            userName: data.userName || data.user_name || 'Unknown',
            status: data.access ? 'success' : 'failed',
            timestamp: data.timestamp || new Date().toISOString()
        });
    }

    // Update statistics
    realtimeStats[device].total++;
    if (data.access || data.status === 'success') {
        realtimeStats[device].success++;
    } else {
        realtimeStats[device].failed++;
    }

    updateDeviceBadgeCount(device, realtimeStats[device].total);

    if (device === currentDevice) {
        updateStatisticsUI(device);
    }

    addActivityLog(data, 'auth');

    // Save to database
    saveAuthToDatabase(data);
}

// ========================================
// FACE HISTORY FUNCTIONS - BARU
// ========================================
function addToFaceHistory(data) {
    faceHistoryLog.unshift({
        image: data.image,
        userName: data.userName || 'Unknown',
        status: data.status || 'unknown',
        timestamp: new Date(data.timestamp || Date.now())
    });

    if (faceHistoryLog.length > MAX_HISTORY) {
        faceHistoryLog.pop();
    }

    console.log('📜 Face history updated, total entries:', faceHistoryLog.length);
}

function renderFaceRecognitionHistory() {
    const historyDiv = document.getElementById('faceRecognitionHistory');
    if (!historyDiv) return;

    if (faceHistoryLog.length === 0) {
        historyDiv.innerHTML = '<div class="no-activity">No face recognition history yet...</div>';
        return;
    }

    let html = '';
    faceHistoryLog.forEach(entry => {
        const statusClass = entry.status === 'success' ? 'success' : 'failed';
        const statusText = entry.status === 'success' ? 'GRANTED' : 'DENIED';
        const timeStr = entry.timestamp.toLocaleString('id-ID');

        html += `
            <div class="face-history-item">
                <img src="data:image/jpeg;base64,${entry.image}" alt="${entry.userName}" />
                <div class="face-history-meta">
                    <div class="face-history-name">${entry.userName}</div>
                    <div class="face-history-time">${timeStr}</div>
                    <div class="face-history-status ${statusClass}">${statusText}</div>
                </div>
            </div>
        `;
    });

    historyDiv.innerHTML = html;
}

function showFaceHistoryModal() {
    renderFaceRecognitionHistory();
    const modal = document.getElementById('faceHistoryModal');
    if (modal) modal.classList.add('show');
}

function closeFaceHistoryModal() {
    const modal = document.getElementById('faceHistoryModal');
    if (modal) modal.classList.remove('show');
}

function setupHistoryModal() {
    const modal = document.getElementById('faceHistoryModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeFaceHistoryModal();
            }
        });
    }
}

// ========================================
// PARAM MESSAGE HANDLER
// ========================================
function handleParamMessage(data) {
    console.log('📥 Param message received:', data);
    const device = data.device || 'esp32cam';

    realtimeStats[device].paramCount++;

    const delay = parseFloat(data.delay) || 0;
    const throughput = parseFloat(data.throughput) || 0;
    const msgSize = parseInt(data.message_size) || 0;
    const packetLoss = parseFloat(data.packet_loss) || 0;

    // Hitung jitter di frontend
    let jitter = 0;
    if (lastDelayPerDevice[device] !== null) {
        jitter = Math.abs(delay - lastDelayPerDevice[device]);
    }
    lastDelayPerDevice[device] = delay;

    realtimeStats[device].totalDelay += delay;
    realtimeStats[device].totalThroughput += throughput;
    realtimeStats[device].totalMsgSize += msgSize;
    realtimeStats[device].totalJitter += jitter;
    realtimeStats[device].totalPacketLoss += packetLoss;

    if (device === currentDevice) {
        updateMQTTParamsUI(data, jitter);
        updateStatisticsUI(device);

        if (chartManager) {
            chartManager.addDataPoint('delay', delay);
            chartManager.addDataPoint('throughput', throughput);
            chartManager.addDataPoint('messageSize', msgSize);
            chartManager.addDataPoint('jitter', jitter);
            chartManager.addDataPoint('packetLoss', packetLoss);
        }
    }

    addActivityLog(data, 'param');

    // Save to database
    saveParamToDatabase(data, jitter);
}

// ========================================
// UI UPDATE FUNCTIONS
// ========================================
function updateLastFacePanel(data) {
    const faceImg = document.getElementById('lastFaceImage');
    const faceName = document.getElementById('lastFaceName');
    const faceId = document.getElementById('lastFaceId');
    const faceStatus = document.getElementById('lastFaceStatus');
    const faceTime = document.getElementById('lastFaceTime');
    const placeholder = document.getElementById('noFacePlaceholder');

    const timeText = data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID') : new Date().toLocaleString('id-ID');

    if (data.image && data.status) {
        faceImg.style.display = 'block';
        placeholder.style.display = 'none';
        faceImg.src = 'data:image/jpeg;base64,' + data.image;
        faceName.textContent = data.userName || "-";
        faceId.textContent = data.userId || "-";
        faceStatus.textContent = data.status || "-";
        faceTime.textContent = timeText;
    } else {
        faceImg.style.display = 'none';
        placeholder.style.display = 'block';
    }
}

function updateStatisticsUI(device) {
    const stats = realtimeStats[device];
    
    document.getElementById('statTotal').textContent = stats.total || 0;
    document.getElementById('statSuccess').textContent = stats.success || 0;
    document.getElementById('statFailed').textContent = stats.failed || 0;

    const avgDelay = stats.paramCount > 0 ? (stats.totalDelay / stats.paramCount).toFixed(2) : 0;
    const avgThroughput = stats.paramCount > 0 ? (stats.totalThroughput / stats.paramCount).toFixed(2) : 0;
    const avgMsgSize = stats.paramCount > 0 ? (stats.totalMsgSize / stats.paramCount).toFixed(2) : 0;
    const avgJitter = stats.paramCount > 0 ? (stats.totalJitter / stats.paramCount).toFixed(2) : 0;
    const avgPacketLoss = stats.paramCount > 0 ? (stats.totalPacketLoss / stats.paramCount).toFixed(2) : 0;

    document.getElementById('statAvgDelay').textContent = avgDelay;
    document.getElementById('statAvgThroughput').textContent = avgThroughput;
    document.getElementById('statAvgMsgSize').textContent = avgMsgSize;
    document.getElementById('statAvgJitter').textContent = avgJitter;
    document.getElementById('statAvgPacketLoss').textContent = avgPacketLoss;
}

function updateMQTTParamsUI(data, jitter) {
    document.getElementById('paramPayload').textContent = JSON.stringify(data).substring(0, 30) + '...';
    document.getElementById('paramTopic').textContent = data.topic || 'smartdoor/param';
    document.getElementById('paramDelay').textContent = (data.delay || 0) + ' ms';
    document.getElementById('paramThroughput').textContent = (data.throughput || 0) + ' bps';
    document.getElementById('paramMsgSize').textContent = (data.message_size || 0) + ' bytes';
    document.getElementById('paramQos').textContent = data.qos || 1;
    document.getElementById('paramJitter').textContent = jitter.toFixed(2) + ' ms';
    document.getElementById('paramPacketLoss').textContent = (data.packet_loss || 0) + ' %';
}

function updateDeviceBadgeCount(device, count) {
    const badgeEl = document.getElementById('badge-' + device);
    if (badgeEl) {
        badgeEl.textContent = count;
    }
}

function addActivityLog(data, type) {
    const logContainer = document.getElementById('activityLog');
    if (!logContainer) return;

    const noActivity = logContainer.querySelector('.no-activity');
    if (noActivity) noActivity.remove();

    const logItem = document.createElement('div');
    logItem.className = 'activity-item ' + (data.access || data.status === 'success' ? 'success' : 'failed');

    const title = type === 'auth' ? 
        `🔐 ${data.device?.toUpperCase()} Authentication` : 
        `📡 ${data.device?.toUpperCase()} Network Parameters`;

    const details = type === 'auth' ?
        `User: ${data.user_name || data.userName || 'Unknown'} | Access: ${data.access ? 'GRANTED' : 'DENIED'}` :
        `Delay: ${data.delay}ms | Throughput: ${data.throughput}bps | Size: ${data.message_size}B`;

    const timestamp = new Date(data.timestamp || Date.now()).toLocaleString('id-ID');

    logItem.innerHTML = `
        <div class="activity-header">
            <div class="activity-title">${title}</div>
            <div class="activity-time">${timestamp}</div>
        </div>
        <div class="activity-details">${details}</div>
    `;

    logContainer.insertBefore(logItem, logContainer.firstChild);

    // Limit to 50 items
    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// ========================================
// DATABASE SAVE FUNCTIONS
// ========================================
async function saveAuthToDatabase(data) {
    try {
        const response = await fetch(window.BASE_URL + '/api/auth/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) {
            console.error('❌ Failed to save auth log:', result.message);
        }
    } catch (error) {
        console.error('❌ Error saving auth log:', error);
    }
}

async function saveParamToDatabase(data, jitter) {
    try {
        const paramData = { ...data, jitter: jitter };
        const response = await fetch(window.BASE_URL + '/api/param/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paramData)
        });
        const result = await response.json();
        if (!result.success) {
            console.error('❌ Failed to save param log:', result.message);
        }
    } catch (error) {
        console.error('❌ Error saving param log:', error);
    }
}

// ========================================
// CONTROL FUNCTIONS
// ========================================
function sendControl(command) {
    if (!mqttClient || !mqttClient.isConnected()) {
        showToast('❌ MQTT not connected', 'error');
        return;
    }

    const payload = JSON.stringify({
        command: command,
        timestamp: new Date().toISOString(),
        source: 'dashboard'
    });

    mqttClient.publish(MQTT_CONFIG.topics.control, payload, 1);
    showToast(`✅ Command "${command}" sent`, 'success');
}

function openEnrollModal() {
    const modal = document.getElementById('enrollModal');
    if (modal) modal.classList.add('show');
}

function closeEnrollModal() {
    const modal = document.getElementById('enrollModal');
    if (modal) modal.classList.remove('show');
}

function submitEnroll(event) {
    event.preventDefault();
    
    const name = document.getElementById('enrollName').value;
    const id = document.getElementById('enrollId').value;
    const device = document.getElementById('enrollDevice').value;

    const payload = JSON.stringify({
        command: 'enroll',
        user_name: name,
        user_id: id,
        device: device,
        timestamp: new Date().toISOString()
    });

    mqttClient.publish(MQTT_CONFIG.topics.control, payload, 1);
    showToast(`✅ Enrollment request sent for ${name}`, 'success');
    closeEnrollModal();
    document.getElementById('enrollForm').reset();
}

async function deleteData(type, device) {
    if (!confirm(`Are you sure you want to delete all ${type} data for ${device}?`)) {
        return;
    }

    try {
        const endpoint = type === 'auth' ? '/api/auth/delete' : '/api/param/delete';
        const response = await fetch(window.BASE_URL + endpoint, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: device })
        });

        const result = await response.json();
        if (result.success) {
            showToast(`✅ ${device} ${type} data deleted`, 'success');
            
            // Reset local stats
            if (type === 'auth') {
                realtimeStats[device].total = 0;
                realtimeStats[device].success = 0;
                realtimeStats[device].failed = 0;
            } else {
                realtimeStats[device].paramCount = 0;
                realtimeStats[device].totalDelay = 0;
                realtimeStats[device].totalThroughput = 0;
                realtimeStats[device].totalMsgSize = 0;
                realtimeStats[device].totalJitter = 0;
                realtimeStats[device].totalPacketLoss = 0;
            }
            
            updateDeviceBadgeCount(device, 0);
            if (device === currentDevice) {
                updateStatisticsUI(device);
                if (chartManager) chartManager.clearAllCharts();
            }
        } else {
            showToast(`❌ Failed to delete data: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('❌ Error deleting data:', error);
        showToast('❌ Error deleting data', 'error');
    }
}

async function deleteAllData() {
    if (!confirm('⚠️ WARNING: This will delete ALL data from the system. Are you sure?')) {
        return;
    }

    try {
        const authRes = await fetch(window.BASE_URL + '/api/auth/delete/all', { method: 'DELETE' });
        const paramRes = await fetch(window.BASE_URL + '/api/param/delete/all', { method: 'DELETE' });

        const authResult = await authRes.json();
        const paramResult = await paramRes.json();

        if (authResult.success && paramResult.success) {
            showToast('✅ All data deleted successfully', 'success');
            
            // Reset all stats
            Object.keys(realtimeStats).forEach(device => {
                realtimeStats[device] = {
                    total: 0, success: 0, failed: 0, paramCount: 0,
                    totalDelay: 0, totalThroughput: 0, totalMsgSize: 0,
                    totalJitter: 0, totalPacketLoss: 0
                };
                updateDeviceBadgeCount(device, 0);
            });
            
            updateStatisticsUI(currentDevice);
            if (chartManager) chartManager.clearAllCharts();
            document.getElementById('activityLog').innerHTML = '<div class="no-activity">No activity yet...</div>';
        } else {
            showToast('❌ Failed to delete all data', 'error');
        }
    } catch (error) {
        console.error('❌ Error deleting all data:', error);
        showToast('❌ Error deleting all data', 'error');
    }
}

function logout() {
    sessionStorage.clear();
    window.location.href = 'login.html';
}

function setupEventListeners() {
    const enrollModal = document.getElementById('enrollModal');
    if (enrollModal) {
        enrollModal.addEventListener('click', function(e) {
            if (e.target === enrollModal) {
                closeEnrollModal();
            }
        });
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
