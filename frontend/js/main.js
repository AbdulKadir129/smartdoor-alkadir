// ========================================
// MAIN.JS - 100% REAL DATA VERSION
// Smart Door Security System
// Untuk Analisis Jaringan MQTT (Skripsi)
// TANPA fake/random data
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

// Untuk tracking delay sebelumnya (menghitung jitter di frontend)
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
});

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

// ========================================
// MQTT
// ========================================
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
// FACE PANEL
// ========================================
function updateLastFacePanel(data) {
    const faceImg = document.getElementById('lastFaceImage');
    const faceName = document.getElementById('lastFaceName');
    const faceId = document.getElementById('lastFaceId');
    const faceStatus = document.getElementById('lastFaceStatus');
    const faceTime = document.getElementById('lastFaceTime');
    const placeholder = document.getElementById('noFacePlaceholder');
    
    var timeText = data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID') : new Date().toLocaleString('id-ID');
    
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

function renderFaceRecognitionHistory() {
    const historyDiv = document.getElementById('faceRecognitionHistory');
    if (!historyDiv) return;
    if (faceHistoryLog.length === 0) {
        historyDiv.innerHTML = '<div class="no-activity">Belum ada history face recognition.</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < faceHistoryLog.length; i++) {
        var log = faceHistoryLog[i];
        html += '<div class="face-history-item">';
        html += '<img src="data:image/jpeg;base64,' + log.image + '" alt="face">';
        html += '<div class="face-history-meta">';
        html += '<div class="face-history-name">' + log.userName + ' <span style="color:#888;">(' + log.userId + ')</span></div>';
        html += '<div class="face-history-time">' + log.time + '</div>';
        html += '<div class="face-history-status ' + log.status + '">' + log.status + '</div>';
        html += '</div></div>';
    }
    historyDiv.innerHTML = html;
}

function setupHistoryModal() {
    const btnOpen = document.getElementById('btnShowHistory');
    const modal = document.getElementById('faceHistoryModal');
    const btnClose = document.getElementById('closeHistoryModal');
    if (!btnOpen || !modal || !btnClose) return;
    btnOpen.onclick = function() { renderFaceRecognitionHistory(); modal.classList.add('show'); };
    btnClose.onclick = function() { modal.classList.remove('show'); };
    window.onclick = function(e) { if (e.target === modal) modal.classList.remove('show'); };
}

// ========================================
// AUTH HANDLER - REAL-TIME
// ========================================
async function handleAuthMessage(data) {
    try {
        const device = data.device || 'esp32cam';
        
        realtimeStats[device].total++;
        if (data.status === 'success') realtimeStats[device].success++;
        else realtimeStats[device].failed++;
        
        updateDeviceBadgeCount(device, realtimeStats[device].total);
        
        if (device === 'esp32cam' && data.image) {
            faceHistoryLog.unshift({
                time: data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID') : new Date().toLocaleString('id-ID'),
                userName: data.userName || "-",
                userId: data.userId || "-",
                image: data.image,
                status: data.status
            });
            if (faceHistoryLog.length > MAX_HISTORY) faceHistoryLog.pop();
        }
        
        if (device === 'esp32cam') updateLastFacePanel(data);
        
        if (device === currentDevice) {
            updateStatisticsDisplay(device);
            addActivityLogItem(data);
        }
        
        const response = await fetch(window.BASE_URL + '/api/auth/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            const icon = data.status === 'success' ? '✅' : '❌';
            const type = data.status === 'success' ? 'success' : 'error';
            showToast(icon + ' [' + device.toUpperCase() + '] ' + (data.message || data.status), type);
        }
    } catch (error) {
        console.error('❌ Error handling auth message:', error);
    }
}

// ========================================
// PARAM HANDLER - 100% REAL DATA
// TANPA FAKE/RANDOM VALUES
// ========================================
async function handleParamMessage(data) {
    try {
        const device = data.device || 'esp32cam';
        
        // ✅ REAL: Waktu browser menerima pesan MQTT
        const browserReceiveTime = Date.now();
        
        // ✅ REAL: Waktu ESP32 mengirim (dari payload)
        const espSentTime = data.sentTime || null;
        
        // ✅ REAL: Message Size
        const msgSize = parseInt(data.messageSize) || 0;
        
        // ========================================
        // KALKULASI 100% REAL - TANPA FAKE DATA
        // ========================================
        
        // 1. DELAY (ms) - Waktu transmisi ESP32 → Browser
        var networkDelay = 0;
        if (espSentTime && espSentTime > 0) {
            networkDelay = browserReceiveTime - espSentTime;
            // Jika negatif (clock tidak sinkron), gunakan absolut
            // TIDAK diganti random/fake
            if (networkDelay < 0) {
                console.warn('⚠️ Negative delay: ' + networkDelay + 'ms - Clock sync issue');
                networkDelay = Math.abs(networkDelay);
            }
        }
        
        // 2. THROUGHPUT (bps)
        var throughput = 0;
        if (networkDelay > 0 && msgSize > 0) {
            throughput = (msgSize * 8 * 1000) / networkDelay;
        }
        
        // 3. JITTER (ms) - Variasi delay
        var jitter = 0;
        if (lastDelayPerDevice[device] !== null && networkDelay > 0) {
            jitter = Math.abs(networkDelay - lastDelayPerDevice[device]);
        }
        if (networkDelay > 0) {
            lastDelayPerDevice[device] = networkDelay;
        }
        
        // Update data
        data.delay = Math.round(networkDelay);
        data.throughput = Math.round(throughput);
        data.jitter = Math.round(jitter);
        data.packetLoss = 0; // Akan diupdate dari backend
        
        // Update stats
        if (networkDelay > 0) {
            realtimeStats[device].paramCount++;
            realtimeStats[device].totalDelay = (realtimeStats[device].totalDelay || 0) + networkDelay;
            realtimeStats[device].totalThroughput = (realtimeStats[device].totalThroughput || 0) + throughput;
            realtimeStats[device].totalMsgSize = (realtimeStats[device].totalMsgSize || 0) + msgSize;
            realtimeStats[device].totalJitter = (realtimeStats[device].totalJitter || 0) + jitter;
            
            const count = realtimeStats[device].paramCount;
            realtimeStats[device].avgDelay = realtimeStats[device].totalDelay / count;
            realtimeStats[device].avgThroughput = realtimeStats[device].totalThroughput / count;
            realtimeStats[device].avgMsgSize = realtimeStats[device].totalMsgSize / count;
            realtimeStats[device].avgJitter = realtimeStats[device].totalJitter / count;
        }
        
        // Update display
        if (device === currentDevice) {
            updateParamDisplay(data);
            if (chartManager && networkDelay > 0) {
                chartManager.updateChart(browserReceiveTime, networkDelay, throughput, msgSize, jitter, 0);
            }
        }
        
        // Kirim ke backend untuk hitung packet loss
        const logData = {
            device: device,
            payload: data.payload || "MQTT Data",
            topic: data.topic || MQTT_CONFIG.topics.param,
            messageSize: msgSize,
            qos: data.qos || 1,
            sentTime: espSentTime,
            sequenceNumber: data.sequenceNumber || 0,
            delay: Math.round(networkDelay),
            throughput: Math.round(throughput),
            jitter: Math.round(jitter)
        };
        
        const response = await fetch(window.BASE_URL + '/api/param/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logData)
        });
        const result = await response.json();
        
        // Update packet loss dari backend
        if (result.success && result.data) {
            const backendPacketLoss = result.data.packetLoss || 0;
            data.packetLoss = backendPacketLoss;
            
            realtimeStats[device].totalPacketLoss = (realtimeStats[device].totalPacketLoss || 0) + backendPacketLoss;
            if (realtimeStats[device].paramCount > 0) {
                realtimeStats[device].avgPacketLoss = realtimeStats[device].totalPacketLoss / realtimeStats[device].paramCount;
            }
            
            if (device === currentDevice) {
                updateParamDisplay(data);
                updateStatisticsDisplay(device);
                if (chartManager) chartManager.updatePacketLossOnly(backendPacketLoss);
            }
            
            console.log('📊 [' + device + '] Delay:' + networkDelay + 'ms | Throughput:' + throughput.toFixed(0) + 'bps | Jitter:' + jitter + 'ms | Loss:' + backendPacketLoss + '%');
        }
    } catch (error) {
        console.error('❌ Error handling param message:', error);
    }
}

// ========================================
// UI UPDATE FUNCTIONS
// ========================================
function updateStatisticsDisplay(device) {
    const stats = realtimeStats[device];
    updateElementWithAnimation('statTotal', stats.total);
    updateElementWithAnimation('statSuccess', stats.success);
    updateElementWithAnimation('statFailed', stats.failed);
    updateElementWithAnimation('statDelay', (stats.avgDelay || 0).toFixed(2));
    updateElementWithAnimation('statThroughput', (stats.avgThroughput || 0).toFixed(2));
    updateElementWithAnimation('statMsgSize', (stats.avgMsgSize || 0).toFixed(2));
    updateElementWithAnimation('statJitter', (stats.avgJitter || 0).toFixed(2));
    updateElementWithAnimation('statPacketLoss', (stats.avgPacketLoss || 0).toFixed(2));
}

function updateElementWithAnimation(id, value) {
    const element = document.getElementById(id);
    if (element && element.textContent !== String(value)) {
        element.textContent = value;
        element.style.transform = 'scale(1.15)';
        element.style.color = '#6366f1';
        setTimeout(function() { element.style.transform = 'scale(1)'; element.style.color = ''; }, 300);
    }
}

function updateDeviceBadgeCount(device, count) {
    const badges = { 'esp32cam': 'badgeEsp32cam', 'rfid': 'badgeRfid', 'fingerprint': 'badgeFingerprint' };
    const badge = document.getElementById(badges[device]);
    if (badge) {
        badge.textContent = count;
        badge.style.transform = 'scale(1.3)';
        setTimeout(function() { badge.style.transform = 'scale(1)'; }, 300);
    }
}

function addActivityLogItem(data) {
    const container = document.getElementById('activityLog');
    if (!container) return;
    
    const noActivity = container.querySelector('.no-activity');
    if (noActivity) noActivity.remove();
    
    const time = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' });
    const statusClass = data.status === 'success' ? 'success' : 'failed';
    const icon = data.status === 'success' ? '✅' : '❌';
    
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item ' + statusClass;
    activityItem.style.animation = 'slideInRight 0.3s ease';
    activityItem.innerHTML = '<div class="activity-header"><span class="activity-title">' + icon + ' ' + (data.method || data.device) + '</span><span class="activity-time">' + time + '</span></div><div class="activity-details"><strong>' + (data.userName || data.userId || 'Unknown') + '</strong> - ' + (data.message || data.status) + '</div>';
    container.insertBefore(activityItem, container.firstChild);
    
    const items = container.querySelectorAll('.activity-item');
    if (items.length > 15) items[items.length - 1].remove();
}

function updateParamDisplay(data) {
    const params = {
        paramPayload: data.payload || '-',
        paramTopic: data.topic || '-',
        paramDelay: (data.delay || 0) + ' ms',
        paramThroughput: Math.round(data.throughput || 0) + ' bps',
        paramSize: (data.messageSize || 0) + ' bytes',
        paramQos: data.qos || 1,
        paramJitter: (data.jitter || 0) + ' ms',
        paramPacketLoss: (data.packetLoss || 0) + ' %'
    };
    for (var id in params) {
        var el = document.getElementById(id);
        if (el) {
            el.textContent = params[id];
            el.style.transform = 'scale(1.05)';
            el.style.color = '#10b981';
            setTimeout(function() { el.style.transform = 'scale(1)'; el.style.color = ''; }, 200);
        }
    }
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    document.querySelectorAll('.device-card').forEach(function(card) {
        card.addEventListener('click', function() {
            const device = this.getAttribute('data-device');
            currentDevice = device;
            document.querySelectorAll('.device-card').forEach(function(c) { c.classList.remove('active'); });
            this.classList.add('active');
            updateStatisticsDisplay(device);
            deviceManager.switchDevice(device);
            if (chartManager) chartManager.loadHistory(device);
        });
    });
    
    var btnBuka = document.getElementById('btnBukaPintu');
    if (btnBuka) btnBuka.addEventListener('click', function() { handleDoorControl('open'); });
    
    var btnKunci = document.getElementById('btnKunciPintu');
    if (btnKunci) btnKunci.addEventListener('click', function() { handleDoorControl('lock'); });
    
    var btnTambah = document.getElementById('btnTambahUser');
    if (btnTambah) btnTambah.addEventListener('click', handleAddUser);
    
    var btnExport = document.getElementById('btnExportLogs');
    if (btnExport) btnExport.addEventListener('click', handleExportLogs);
    
    var btnClearAuth = document.getElementById('btnClearAuthLogs');
    if (btnClearAuth) btnClearAuth.addEventListener('click', function() { handleClearLogs('auth'); });
    
    var btnClearParam = document.getElementById('btnClearParamLogs');
    if (btnClearParam) btnClearParam.addEventListener('click', function() { handleClearLogs('param'); });
    
    var btnClearAll = document.getElementById('btnClearAllLogs');
    if (btnClearAll) btnClearAll.addEventListener('click', handleClearAllLogs);
    
    var btnDownload = document.getElementById('btnDownloadReport');
    if (btnDownload) btnDownload.addEventListener('click', handleDownloadReport);
    
    var btnLogout = document.getElementById('logoutBtn');
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    
    const modal = document.getElementById('modalAddUser');
    if (modal) {
        var closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', function() { modal.classList.remove('show'); });
        window.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('show'); });
    }
    
    var formAdd = document.getElementById('formAddUser');
    if (formAdd) formAdd.addEventListener('submit', handleSubmitUser);
}

// ========================================
// CONTROL FUNCTIONS
// ========================================
function handleDoorControl(action) {
    if (!mqttClient || !mqttClient.isConnected) {
        showToast('❌ MQTT not connected', 'error');
        return;
    }
    mqttClient.publish(MQTT_CONFIG.topics.control, JSON.stringify({ device: currentDevice, action: action }), 1);
    showToast('🚪 Perintah ' + (action === 'open' ? 'membuka' : 'mengunci') + ' pintu terkirim', 'info');
}

function handleAddUser() {
    const modal = document.getElementById('modalAddUser');
    if (modal) {
        modal.classList.add('show');
        var groupFace = document.getElementById('groupFaceId');
        var groupRfid = document.getElementById('groupRfidUid');
        var groupFinger = document.getElementById('groupFingerId');
        if (groupFace) groupFace.style.display = currentDevice === 'esp32cam' ? 'block' : 'none';
        if (groupRfid) groupRfid.style.display = currentDevice === 'rfid' ? 'block' : 'none';
        if (groupFinger) groupFinger.style.display = currentDevice === 'fingerprint' ? 'block' : 'none';
    }
}

async function handleSubmitUser(e) {
    e.preventDefault();
    const userData = {
        username: document.getElementById('inputUsername').value,
        password: document.getElementById('inputPassword').value,
        device: currentDevice,
        userType: 'device_user'
    };
    if (currentDevice === 'esp32cam') userData.faceId = document.getElementById('inputFaceId').value;
    else if (currentDevice === 'rfid') userData.rfidUid = document.getElementById('inputRfidUid').value;
    else if (currentDevice === 'fingerprint') userData.fingerId = document.getElementById('inputFingerId').value;
    
    try {
        const response = await fetch(window.BASE_URL + '/api/users/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const result = await response.json();
        if (result.success) {
            showToast('✅ User berhasil ditambahkan', 'success');
            document.getElementById('formAddUser').reset();
            document.getElementById('modalAddUser').classList.remove('show');
        } else {
            var msgEl = document.getElementById('modalMessage');
            if (msgEl) msgEl.textContent = '❌ ' + result.message;
        }
    } catch (error) {
        showToast('❌ Error adding user', 'error');
    }
}

async function handleExportLogs() {
    try {
        const authRes = await fetch(window.BASE_URL + '/api/auth/logs/' + currentDevice);
        const paramRes = await fetch(window.BASE_URL + '/api/param/logs/' + currentDevice);
        const authData = await authRes.json();
        const paramData = await paramRes.json();
        
        var csv = 'Type,Device,Timestamp,SeqNum,Delay(ms),Throughput(bps),MsgSize,Jitter(ms),PacketLoss(%),Status,Details\n';
        if (authData.data) {
            authData.data.forEach(function(log) {
                csv += 'Auth,' + log.device + ',' + new Date(log.timestamp).toLocaleString('id-ID') + ',-,-,-,-,-,-,' + log.status + ',"' + (log.userName || '') + '"\n';
            });
        }
        if (paramData.data) {
            paramData.data.forEach(function(log) {
                csv += 'Param,' + log.device + ',' + new Date(log.timestamp).toLocaleString('id-ID') + ',' + (log.sequenceNumber || 0) + ',' + log.delay + ',' + log.throughput + ',' + log.messageSize + ',' + (log.jitter || 0) + ',' + (log.packetLoss || 0) + ',-,-\n';
            });
        }
        
        downloadCSV(csv, 'NetworkAnalysis_' + currentDevice + '_' + Date.now() + '.csv');
        showToast('📥 Data exported successfully', 'success');
    } catch (error) {
        showToast('❌ Export failed', 'error');
    }
}

async function handleClearLogs(type) {
    if (!confirm('⚠️ Delete all ' + type + ' logs for ' + currentDevice.toUpperCase() + '?')) return;
    
    try {
        const response = await fetch(window.BASE_URL + '/api/' + type + '/logs/' + currentDevice, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('✅ ' + result.message, 'success');
            if (type === 'auth') {
                realtimeStats[currentDevice].total = 0;
                realtimeStats[currentDevice].success = 0;
                realtimeStats[currentDevice].failed = 0;
                updateDeviceBadgeCount(currentDevice, 0);
                var actLog = document.getElementById('activityLog');
                if (actLog) actLog.innerHTML = '<div class="no-activity">No activity yet...</div>';
            } else {
                realtimeStats[currentDevice].paramCount = 0;
                realtimeStats[currentDevice].totalDelay = 0;
                realtimeStats[currentDevice].totalThroughput = 0;
                realtimeStats[currentDevice].totalMsgSize = 0;
                realtimeStats[currentDevice].totalJitter = 0;
                realtimeStats[currentDevice].totalPacketLoss = 0;
                realtimeStats[currentDevice].avgDelay = 0;
                realtimeStats[currentDevice].avgThroughput = 0;
                realtimeStats[currentDevice].avgMsgSize = 0;
                realtimeStats[currentDevice].avgJitter = 0;
                realtimeStats[currentDevice].avgPacketLoss = 0;
                lastDelayPerDevice[currentDevice] = null;
                if (chartManager) chartManager.clearCharts();
            }
            updateStatisticsDisplay(currentDevice);
        }
    } catch (error) {
        showToast('❌ Delete failed', 'error');
    }
}

async function handleClearAllLogs() {
    if (prompt('Type "DELETE ALL" to confirm:') !== 'DELETE ALL') return;
    
    try {
        await Promise.all([
            fetch(window.BASE_URL + '/api/auth/logs', { method: 'DELETE' }),
            fetch(window.BASE_URL + '/api/param/logs', { method: 'DELETE' })
        ]);
        
        var devices = ['esp32cam', 'rfid', 'fingerprint'];
        devices.forEach(function(device) {
            realtimeStats[device] = {
                total: 0, success: 0, failed: 0, paramCount: 0,
                totalDelay: 0, totalThroughput: 0, totalMsgSize: 0, totalJitter: 0, totalPacketLoss: 0,
                avgDelay: 0, avgThroughput: 0, avgMsgSize: 0, avgJitter: 0, avgPacketLoss: 0
            };
            updateDeviceBadgeCount(device, 0);
            lastDelayPerDevice[device] = null;
        });
        updateStatisticsDisplay(currentDevice);
        var actLog = document.getElementById('activityLog');
        if (actLog) actLog.innerHTML = '<div class="no-activity">No activity yet...</div>';
        if (chartManager) chartManager.clearCharts();
        showToast('✅ All data deleted!', 'success');
    } catch (error) {
        showToast('❌ Delete failed', 'error');
    }
}

async function handleDownloadReport() {
    try {
        const stats = realtimeStats[currentDevice];
        const authRes = await fetch(window.BASE_URL + '/api/auth/logs/' + currentDevice);
        const paramRes = await fetch(window.BASE_URL + '/api/param/logs/' + currentDevice);
        const authData = await authRes.json();
        const paramData = await paramRes.json();
        
        var csv = 'SMART DOOR - NETWORK ANALYSIS REPORT (100% REAL DATA)\n';
        csv += 'Device: ' + currentDevice.toUpperCase() + '\nGenerated: ' + new Date().toLocaleString('id-ID') + '\n\n';
        csv += '=== SUMMARY ===\nTotal Auth: ' + stats.total + '\nSuccess: ' + stats.success + '\nFailed: ' + stats.failed + '\n';
        csv += 'Avg Delay: ' + (stats.avgDelay || 0).toFixed(2) + ' ms\nAvg Throughput: ' + (stats.avgThroughput || 0).toFixed(2) + ' bps\n';
        csv += 'Avg Jitter: ' + (stats.avgJitter || 0).toFixed(2) + ' ms\nAvg Packet Loss: ' + (stats.avgPacketLoss || 0).toFixed(2) + ' %\n\n';
        csv += '=== NETWORK LOGS ===\nTimestamp,SeqNum,Delay(ms),Throughput(bps),MsgSize,Jitter(ms),PacketLoss(%)\n';
        if (paramData.data) {
            paramData.data.forEach(function(log) {
                csv += new Date(log.timestamp).toLocaleString('id-ID') + ',' + (log.sequenceNumber || 0) + ',' + log.delay + ',' + log.throughput + ',' + log.messageSize + ',' + (log.jitter || 0) + ',' + (log.packetLoss || 0) + '\n';
            });
        }
        
        downloadCSV(csv, 'NetworkReport_' + currentDevice + '_' + new Date().toISOString().slice(0, 10) + '.csv');
        showToast('📄 Report downloaded!', 'success');
    } catch (error) {
        showToast('❌ Download failed', 'error');
    }
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

async function handleLogout() {
    try {
        await fetch(window.BASE_URL + '/api/users/logout', { method: 'POST' });
    } catch (e) {}
    if (mqttClient) mqttClient.disconnect();
    sessionStorage.clear();
    window.location.href = 'login.html';
}

function showToast(message, type) {
    type = type || 'info';
    const toast = document.getElementById('notificationToast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(function() { toast.classList.remove('show'); }, 3000);
}

// CSS Animation
var style = document.createElement('style');
style.textContent = '@keyframes slideInRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
document.head.appendChild(style);

// ========================================
// VIEW SWITCH (Dashboard / Control / Data)
// ========================================
document.addEventListener('DOMContentLoaded', function () {
    const navTabs = document.querySelectorAll('.nav-tab');
    const viewSections = document.querySelectorAll('.view-section');

    navTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            const targetView = this.getAttribute('data-view');

            // Reset active di tab
            navTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Reset active di view
            viewSections.forEach(v => v.classList.remove('active'));
            const targetEl = document.getElementById(targetView);
            if (targetEl) targetEl.classList.add('active');
        });
    });
});
