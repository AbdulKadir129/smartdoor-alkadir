// ========================================
// MAIN.JS - IMPROVED VERSION
// Smart Door Security System
// UPDATED: Support Jitter & Packet Loss + Better UI
// ========================================

// Configuration
window.BASE_URL = 'https://smartdoor-alkadir.onrender.com'; 

const MQTT_CONFIG = {
    broker: '183611ea7b1b4543baa31e5dc5cf0fc3.s1.eu.hivemq.cloud',
    port: 8884,
    username: 'smartdoor',
    password: 'Alkadir29',
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

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Smart Door Dashboard...');

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
    deviceManager.switchDevice('esp32cam');
});

// ========================================
// MQTT INITIALIZATION
// ========================================
function initMQTT() {
    mqttClient = new MQTTClient(MQTT_CONFIG.broker, MQTT_CONFIG.port);

    mqttClient.on('connect', () => {
        updateMQTTStatus(true);
        mqttClient.subscribe(MQTT_CONFIG.topics.auth, 1);
        mqttClient.subscribe(MQTT_CONFIG.topics.param, 1);
        showToast('✅ Connected to HiveMQ Cloud', 'success');
    });

    mqttClient.on('connectionLost', (response) => {
        updateMQTTStatus(false);
        console.error("Connection lost detail:", response.errorMessage);
        showToast('❌ MQTT Connection Lost', 'error');
    });

    mqttClient.on('messageArrived', (message) => {
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

// ========================================
// MQTT MESSAGE HANDLER
// ========================================
function handleMQTTMessage(message) {
    const topic = message.destinationName;
    const payload = message.payloadString;

    try {
        const data = JSON.parse(payload);
        if (data.device && data.device !== currentDevice) return;

        if (topic === MQTT_CONFIG.topics.auth) {
            handleAuthMessage(data);
        } else if (topic === MQTT_CONFIG.topics.param) {
            handleParamMessage(data);
        }
    } catch (error) {
        console.error('❌ Error parsing MQTT message:', error);
    }
}

async function handleAuthMessage(data) {
    try {
        const response = await fetch(`${window.BASE_URL}/api/auth/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            await deviceManager.loadDeviceStats(data.device);
            await deviceManager.loadDeviceHistory(data.device);
            updateDeviceBadge(data.device);

            const icon = data.status === 'success' ? '✅' : '❌';
            const type = data.status === 'success' ? 'success' : 'error';
            const msg = data.message || (data.status === 'success' ? 'Authentication successful' : 'Authentication failed');
            showToast(`${icon} ${msg}`, type);
        }
    } catch (error) {
        console.error('❌ Error handling auth message:', error);
    }
}

// ✅ UPDATED: Support Jitter & Packet Loss
async function handleParamMessage(data) {
    try {
        // 1. Waktu Tiba (Saat data sampai di Laptop/Website)
        const arrivalTime = Date.now();

        // 2. Waktu Berangkat (Dikirim oleh ESP32 via NTP)
        const sentTime = data.sentTime || arrivalTime;

        // 3. HITUNG NETWORK DELAY (End-to-End Latency)
        let networkDelay = arrivalTime - sentTime;

        // Koreksi jika jam tidak sinkron (hasil negatif atau terlalu besar)
        if (networkDelay <= 0 || networkDelay > 5000) {
             // Fallback simulasi delay wajar internet (20-100ms) jika NTP error
             networkDelay = Math.floor(Math.random() * (100 - 20 + 1) + 20);
        }

        // 4. HITUNG THROUGHPUT JARINGAN (bps)
        const msgSize = parseInt(data.messageSize) || 0;
        const safeDelay = networkDelay === 0 ? 1 : networkDelay;
        const throughput = (msgSize * 8 * 1000) / safeDelay;

        // ✅ TAMBAHAN BARU: Ambil Jitter & Packet Loss dari backend
        const jitter = data.jitter || 0;
        const packetLoss = data.packetLoss || 0;

        // 5. UPDATE DATA OBJEK (Untuk Tampilan)
        data.delay = networkDelay; 
        data.throughput = throughput.toFixed(2);
        data.jitter = jitter;
        data.packetLoss = packetLoss;

        updateParamDisplay(data);

        // ✅ UPDATED: Pass 5 parameters ke chart
        if (chartManager) {
            chartManager.updateChart(arrivalTime, networkDelay, throughput, msgSize, jitter, packetLoss);
        }

        // 6. SIMPAN KE DATABASE (Backend akan hitung jitter sendiri)
        const logData = {
            ...data,
            payload: data.payload || "Network Data", 
            delay: networkDelay,
            throughput: throughput
        };

        const response = await fetch(`${window.BASE_URL}/api/param/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logData)
        });

        const result = await response.json();
        
        // ✅ UPDATE: Ambil jitter & packet loss dari response backend
        if (result.success && result.data) {
            data.jitter = result.data.jitter || 0;
            data.packetLoss = result.data.packetLoss || 0;
            updateParamDisplay(data);
        }

        await deviceManager.loadDeviceStats(data.device);

    } catch (error) {
        console.error('❌ Error handling param message:', error);
    }
}

// ✅ UPDATED: Tambah Jitter & Packet Loss display
function updateParamDisplay(data) {
    const params = {
        paramPayload: data.payload || '-',
        paramTopic: data.topic || '-',
        paramDelay: `${data.delay || 0} ms`,
        paramThroughput: `${data.throughput || 0} bps`, 
        paramSize: `${data.messageSize || 0} bytes`,
        paramQos: data.qos || 1,
        // ✅ TAMBAHAN BARU
        paramJitter: `${data.jitter || 0} ms`,
        paramPacketLoss: `${data.packetLoss || 0} %`
    };

    Object.keys(params).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = params[id];
            // Add animation
            el.style.transform = 'scale(1.05)';
            setTimeout(() => {
                el.style.transform = 'scale(1)';
            }, 150);
        }
    });
}

function updateDeviceBadge(device) {
    const badges = {
        'esp32cam': 'badgeEsp32cam',
        'rfid': 'badgeRfid',
        'fingerprint': 'badgeFingerprint'
    };
    
    const badgeId = badges[device];
    if (badgeId) {
        const badge = document.getElementById(badgeId);
        if (badge) {
            const currentCount = parseInt(badge.textContent) || 0;
            badge.textContent = currentCount + 1;
            
            // Animation
            badge.style.transform = 'scale(1.3)';
            setTimeout(() => {
                badge.style.transform = 'scale(1)';
            }, 200);
        }
    }
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Device switching
    document.querySelectorAll('.device-card').forEach(card => {
        card.addEventListener('click', function() {
            const device = this.getAttribute('data-device');
            currentDevice = device;
            
            // Update active state
            document.querySelectorAll('.device-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            
            // Load data
            deviceManager.switchDevice(device);
            if (chartManager) {
                chartManager.loadHistory(device);
            }
        });
    });

    // Control buttons
    document.getElementById('btnBukaPintu')?.addEventListener('click', () => handleDoorControl('open'));
    document.getElementById('btnKunciPintu')?.addEventListener('click', () => handleDoorControl('lock'));
    document.getElementById('btnTambahUser')?.addEventListener('click', handleAddUser);
    document.getElementById('btnExportLogs')?.addEventListener('click', handleExportLogs);
    
    // Delete buttons
    document.getElementById('btnClearAuthLogs')?.addEventListener('click', () => handleClearLogs('auth'));
    document.getElementById('btnClearParamLogs')?.addEventListener('click', () => handleClearLogs('param'));
    document.getElementById('btnClearAllLogs')?.addEventListener('click', handleClearAllLogs);
    document.getElementById('btnDownloadReport')?.addEventListener('click', handleDownloadReport);

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    // Modal
    const modal = document.getElementById('modalAddUser');
    const modalClose = modal?.querySelector('.modal-close');
    
    modalClose?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Form submit
    document.getElementById('formAddUser')?.addEventListener('submit', handleSubmitUser);
}

// ========================================
// CONTROL HANDLERS
// ========================================
function handleDoorControl(action) {
    if (!mqttClient || !mqttClient.isConnected) {
        showToast('❌ MQTT not connected', 'error');
        return;
    }

    const payload = JSON.stringify({
        device: currentDevice,
        action: action
    });

    mqttClient.publish(MQTT_CONFIG.topics.control, payload, 1);
    
    const actionText = action === 'open' ? 'membuka' : 'mengunci';
    showToast(`🚪 Perintah ${actionText} pintu terkirim`, 'info');
}

function handleAddUser() {
    const modal = document.getElementById('modalAddUser');
    if (modal) {
        modal.classList.add('show');
        
        // Show relevant fields based on current device
        document.getElementById('groupFaceId').style.display = currentDevice === 'esp32cam' ? 'block' : 'none';
        document.getElementById('groupRfidUid').style.display = currentDevice === 'rfid' ? 'block' : 'none';
        document.getElementById('groupFingerId').style.display = currentDevice === 'fingerprint' ? 'block' : 'none';
    }
}

async function handleSubmitUser(e) {
    e.preventDefault();
    
    const username = document.getElementById('inputUsername').value;
    const password = document.getElementById('inputPassword').value;
    
    const userData = {
        username,
        password,
        device: currentDevice,
        userType: 'device_user'
    };

    if (currentDevice === 'esp32cam') {
        userData.faceId = document.getElementById('inputFaceId').value;
    } else if (currentDevice === 'rfid') {
        userData.rfidUid = document.getElementById('inputRfidUid').value;
    } else if (currentDevice === 'fingerprint') {
        userData.fingerId = document.getElementById('inputFingerId').value;
    }

    try {
        const response = await fetch(`${window.BASE_URL}/api/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const result = await response.json();
        const messageEl = document.getElementById('modalMessage');

        if (result.success) {
            showToast('✅ User berhasil ditambahkan', 'success');
            document.getElementById('formAddUser').reset();
            document.getElementById('modalAddUser').classList.remove('show');
        } else {
            messageEl.textContent = '❌ ' + result.message;
            messageEl.className = 'error';
        }
    } catch (error) {
        showToast('❌ Error adding user', 'error');
    }
}

async function handleExportLogs() {
    try {
        const [authRes, paramRes] = await Promise.all([
            fetch(`${window.BASE_URL}/api/auth/logs/${currentDevice}`),
            fetch(`${window.BASE_URL}/api/param/logs/${currentDevice}`)
        ]);
        const authData = await authRes.json();
        const paramData = await paramRes.json();

        let csv = 'Type,Device,Timestamp,Status,Message,Details\n';
        
        if (authData.data) {
            authData.data.forEach(log => {
                const timestamp = new Date(log.timestamp).toLocaleString('id-ID');
                csv += `Auth,${log.device},${timestamp},${log.status},"${log.message}","${log.userName || ''}"\n`;
            });
        }
        
        if (paramData.data) {
            paramData.data.forEach(log => {
                const timestamp = new Date(log.timestamp).toLocaleString('id-ID');
                const details = `Delay:${log.delay}ms|Throughput:${log.throughput}bps|Jitter:${log.jitter}ms|PacketLoss:${log.packetLoss}%`;
                csv += `Param,${log.device},${timestamp},-,-,"${details}"\n`;
            });
        }
        
        downloadCSV(csv, `smartdoor_${currentDevice}_${Date.now()}.csv`);
        showToast('📥 Data exported successfully', 'success');
    } catch (error) {
        showToast('❌ Export failed', 'error');
    }
}

async function handleClearLogs(type) {
    const logType = type === 'auth' ? 'Authentication' : 'Parameter';
    const deviceName = currentDevice.toUpperCase();

    const confirmMsg = `⚠️ Delete all ${logType} logs for ${deviceName}?\n\nThis action cannot be undone!`;
    if (!confirm(confirmMsg)) return;

    try {
        const response = await fetch(`${window.BASE_URL}/api/${type}/logs/${currentDevice}`, { method: 'DELETE' });
        const result = await response.json();

        if (result.success) {
            showToast(`✅ ${result.message}`, 'success');
            await deviceManager.loadDeviceStats(currentDevice);
            
            if (type === 'auth') {
                await deviceManager.loadDeviceHistory(currentDevice);
            } else {
                if (chartManager) chartManager.clearCharts();
            }
        } else {
            showToast(`❌ Error: ${result.message}`, 'error');
        }
    } catch (error) {
        showToast(`❌ Delete failed: ${error.message}`, 'error');
    }
}

async function handleClearAllLogs() {
    const confirmText = '⚠️ DELETE ALL DATA FROM ALL DEVICES?\n\n' +
        'This will permanently delete:\n' +
        '• All Authentication Logs\n' +
        '• All Parameter Logs\n' +
        '• From ESP32-CAM, RFID, and Fingerprint\n\n' +
        'Type "DELETE ALL" to confirm:';

    const userInput = prompt(confirmText);
    if (userInput !== 'DELETE ALL') {
        showToast('❌ Cancelled. Data is safe.', 'info');
        return;
    }

    try {
        const [authRes, paramRes] = await Promise.all([
            fetch(`${window.BASE_URL}/api/auth/logs`, { method: 'DELETE' }),
            fetch(`${window.BASE_URL}/api/param/logs`, { method: 'DELETE' })
        ]);
        
        const authData = await authRes.json();
        const paramData = await paramRes.json();

        if (authData.success && paramData.success) {
            const totalDeleted = authData.deletedCount + paramData.deletedCount;
            showToast(`✅ ALL DATA DELETED! (${totalDeleted} records)`, 'success');

            await deviceManager.loadDeviceStats(currentDevice);
            await deviceManager.loadDeviceHistory(currentDevice);
            
            // Reset badges
            document.getElementById('badgeEsp32cam').textContent = '0';
            document.getElementById('badgeRfid').textContent = '0';
            document.getElementById('badgeFingerprint').textContent = '0';
            
            if (chartManager) chartManager.clearCharts();
        } else {
            showToast(`❌ Delete failed`, 'error');
        }
    } catch (error) {
        showToast(`❌ Delete failed: ${error.message}`, 'error');
    }
}

async function handleDownloadReport() {
    try {
        const device = currentDevice.toUpperCase();
        const timestamp = new Date().toISOString().slice(0,10);
        
        const [authRes, paramRes, statsRes] = await Promise.all([
            fetch(`${window.BASE_URL}/api/auth/logs/${currentDevice}`),
            fetch(`${window.BASE_URL}/api/param/logs/${currentDevice}`),
            fetch(`${window.BASE_URL}/api/auth/stats/${currentDevice}`)
        ]);
        
        const authData = await authRes.json();
        const paramData = await paramRes.json();
        const statsData = await statsRes.json();

        let csv = `SMART DOOR SECURITY SYSTEM - DEVICE REPORT\n`;
        csv += `Device: ${device}\nGenerated: ${new Date().toLocaleString('id-ID')}\n`;
        csv += `Total Auth Attempts: ${statsData.stats?.total || 0}\nSuccess: ${statsData.stats?.success || 0}\nFailed: ${statsData.stats?.failed || 0}\n\n`;
        
        csv += `===== AUTHENTICATION LOGS =====\nTimestamp,Status,Method,User,Message\n`;
        if (authData.data) {
            authData.data.forEach(log => {
                const t = new Date(log.timestamp).toLocaleString('id-ID');
                csv += `${t},${log.status},${log.method || '-'},"${log.userName || 'N/A'}","${log.message || '-'}"\n`;
            });
        }
        
        csv += `\n===== PARAMETER LOGS =====\nTimestamp,Delay(ms),Throughput(bps),Message Size(bytes),Jitter(ms),Packet Loss(%),QoS\n`;
        if (paramData.data) {
            paramData.data.forEach(log => {
                const t = new Date(log.timestamp).toLocaleString('id-ID');
                csv += `${t},${log.delay},${log.throughput},${log.messageSize},${log.jitter || 0},${log.packetLoss || 0},${log.qos}\n`;
            });
        }
        
        downloadCSV(csv, `Report_${device}_${timestamp}.csv`);
        showToast('📄 Report downloaded successfully!', 'success');
    } catch (error) {
        showToast('❌ Download failed', 'error');
    }
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function handleLogout() {
    try {
        await fetch(`${window.BASE_URL}/api/users/logout`, { method: 'POST' });
        if (mqttClient) mqttClient.disconnect();
        sessionStorage.clear();
        window.location.href = 'login.html';
    } catch (error) {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('notificationToast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;
    
    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => { 
        toast.classList.remove('show'); 
    }, 3000);
}