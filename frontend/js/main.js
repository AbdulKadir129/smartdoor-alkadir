// ========================================
// MAIN.JS - Smart Door Security System
// FINAL VERSION (RENDER + HIVEMQ CLOUD)
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
        showToast('Connected to HiveMQ Cloud', 'success');
    });

    mqttClient.on('connectionLost', (response) => {
        updateMQTTStatus(false);
        console.error("Connection lost detail:", response.errorMessage);
        showToast('MQTT Connection Lost', 'error');
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

async function handleParamMessage(data) {
    try {
        updateParamDisplay(data);

        if (chartManager) {
            const timestamp = Date.now();
            const delay = parseFloat(data.delay) || 0;
            const throughput = parseFloat(data.throughput) || 0;
            const messageSize = parseInt(data.messageSize) || 0;

            chartManager.updateChart(timestamp, delay, throughput, messageSize);
        }

        const response = await fetch(`${window.BASE_URL}/api/param/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        await deviceManager.loadDeviceStats(data.device);

    } catch (error) {
        console.error('❌ Error handling param message:', error);
    }
}

function updateParamDisplay(data) {
    const params = {
        paramPayload: data.payload || '-',
        paramTopic: data.topic || '-',
        paramDelay: `${data.delay || 0} ms`,
        paramThroughput: `${data.throughput || 0} B/s`,
        paramSize: `${data.messageSize || 0} bytes`,
        paramQos: data.qos || 1
    };

    Object.keys(params).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = params[id];
    });
}

function updateDeviceBadge(device) {
    const deviceCamelCase = device === 'esp32cam' ? 'Esp32cam' : 
                           device === 'rfid' ? 'Rfid' : 
                           device === 'fingerprint' ? 'Fingerprint' : device;
    const badgeId = `badge${deviceCamelCase}`;
    const badgeEl = document.getElementById(badgeId);
    if (badgeEl) {
        const currentCount = parseInt(badgeEl.textContent) || 0;
        badgeEl.textContent = currentCount + 1;
    }
}

// ========================================
// EVENT LISTENERS & UI LOGIC
// ========================================
function setupEventListeners() {
    document.querySelectorAll('.device-card').forEach(card => {
        card.addEventListener('click', () => {
            const device = card.getAttribute('data-device');
            switchToDevice(device);
        });
    });

    const btnBukaPintu = document.getElementById('btnBukaPintu');
    const btnKunciPintu = document.getElementById('btnKunciPintu');
    const btnTambahUser = document.getElementById('btnTambahUser');
    const btnExportLogs = document.getElementById('btnExportLogs');

    if (btnBukaPintu) btnBukaPintu.addEventListener('click', handleOpenDoor);
    if (btnKunciPintu) btnKunciPintu.addEventListener('click', handleLockDoor);
    if (btnTambahUser) btnTambahUser.addEventListener('click', showAddUserModal);
    if (btnExportLogs) btnExportLogs.addEventListener('click', handleExportLogs);

    // 🆕 TAMBAHAN BARU: Event listeners untuk tombol delete & report
    const btnClearAuthLogs = document.getElementById('btnClearAuthLogs');
    const btnClearParamLogs = document.getElementById('btnClearParamLogs');
    const btnClearAllLogs = document.getElementById('btnClearAllLogs');
    const btnDownloadReport = document.getElementById('btnDownloadReport');
    if (btnClearAuthLogs) btnClearAuthLogs.addEventListener('click', () => handleClearLogs('auth'));
    if (btnClearParamLogs) btnClearParamLogs.addEventListener('click', () => handleClearLogs('param'));
    if (btnClearAllLogs) btnClearAllLogs.addEventListener('click', handleClearAllLogs);
    if (btnDownloadReport) btnDownloadReport.addEventListener('click', handleDownloadReport);
    // END TAMBAHAN BARU

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    const modal = document.getElementById('modalAddUser');
    if (modal) {
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    const formAddUser = document.getElementById('formAddUser');
    if (formAddUser) formAddUser.addEventListener('submit', handleAddUser);
}

function switchToDevice(device) {
    currentDevice = device;
    document.querySelectorAll('.device-card').forEach(card => {
        card.classList.remove('active');
        if (card.getAttribute('data-device') === device) card.classList.add('active');
    });
    deviceManager.switchDevice(device);
    chartManager.loadHistory(device);
}

function handleOpenDoor() {
    if (!mqttClient || !mqttClient.isConnected) {
        showToast('MQTT not connected', 'error');
        return;
    }
    const command = JSON.stringify({ device: currentDevice, action: 'open', timestamp: Date.now() });
    mqttClient.publish(MQTT_CONFIG.topics.control, command, 1);
    showToast('🚪 Door open command sent', 'success');
}

function handleLockDoor() {
    if (!mqttClient || !mqttClient.isConnected) {
        showToast('MQTT not connected', 'error');
        return;
    }
    const command = JSON.stringify({ device: currentDevice, action: 'lock', timestamp: Date.now() });
    mqttClient.publish(MQTT_CONFIG.topics.control, command, 1);
    showToast('🔒 Door lock command sent', 'success');
}

function showAddUserModal() {
    const modal = document.getElementById('modalAddUser');
    if (!modal) return;
    modal.style.display = 'block';
    
    const groupFaceId = document.getElementById('groupFaceId');
    const groupRfidUid = document.getElementById('groupRfidUid');
    const groupFingerId = document.getElementById('groupFingerId');

    if (groupFaceId) groupFaceId.style.display = currentDevice === 'esp32cam' ? 'block' : 'none';
    if (groupRfidUid) groupRfidUid.style.display = currentDevice === 'rfid' ? 'block' : 'none';
    if (groupFingerId) groupFingerId.style.display = currentDevice === 'fingerprint' ? 'block' : 'none';
}

async function handleAddUser(e) {
    e.preventDefault();
    const username = document.getElementById('inputUsername').value;
    const password = document.getElementById('inputPassword').value;
    const userData = { username, password, device: currentDevice, userType: 'device_user' };

    if (currentDevice === 'esp32cam') userData.faceId = document.getElementById('inputFaceId').value;
    else if (currentDevice === 'rfid') userData.rfidUid = document.getElementById('inputRfidUid').value;
    else if (currentDevice === 'fingerprint') userData.fingerId = document.getElementById('inputFingerId').value;

    try {
        const response = await fetch(`${window.BASE_URL}/api/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const result = await response.json();
        const messageEl = document.getElementById('modalMessage');

        if (result.success) {
            messageEl.textContent = '✅ User added successfully';
            messageEl.className = 'success';
            document.getElementById('formAddUser').reset();
            setTimeout(() => {
                document.getElementById('modalAddUser').style.display = 'none';
                messageEl.textContent = '';
            }, 2000);
            showToast('User added successfully', 'success');
        } else {
            messageEl.textContent = '❌ ' + result.message;
            messageEl.className = 'error';
        }
    } catch (error) {
        showToast('Error adding user', 'error');
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
                const details = `Delay:${log.delay}ms|Throughput:${log.throughput}B/s`;
                csv += `Param,${log.device},${timestamp},-,-,"${details}"\n`;
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `smartdoor_${currentDevice}_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('📥 Data exported successfully', 'success');
    } catch (error) {
        showToast('Export failed', 'error');
    }
}

// 🆕 TAMBAHAN BARU: Function untuk clear logs per type
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
                if (chartManager) {
                    chartManager.delayChart.data.labels = [];
                    chartManager.delayChart.data.datasets[0].data = [];
                    chartManager.throughputChart.data.labels = [];
                    chartManager.throughputChart.data.datasets[0].data = [];
                    chartManager.msgSizeChart.data.labels = [];
                    chartManager.msgSizeChart.data.datasets[0].data = [];
                    chartManager.delayChart.update();
                    chartManager.throughputChart.update();
                    chartManager.msgSizeChart.update();
                }
            }
        } else {
            showToast(`❌ Error: ${result.message}`, 'error');
        }
    } catch (error) {
        showToast(`❌ Delete failed: ${error.message}`, 'error');
        console.error('Delete error:', error);
    }
}

// 🆕 TAMBAHAN BARU: Function untuk clear ALL logs (semua device)
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
        const authRes = await fetch(`${window.BASE_URL}/api/auth/logs`, { method: 'DELETE' });
        const authData = await authRes.json();

        const paramRes = await fetch(`${window.BASE_URL}/api/param/logs`, { method: 'DELETE' });
        const paramData = await paramRes.json();

        if (authData.success && paramData.success) {
            const totalDeleted = authData.deletedCount + paramData.deletedCount;
            showToast(`✅ ALL DATA DELETED! (${totalDeleted} records)`, 'success');

            await deviceManager.loadDeviceStats(currentDevice);
            await deviceManager.loadDeviceHistory(currentDevice);
            document.getElementById('badgeEsp32cam').textContent = '0';
            document.getElementById('badgeRfid').textContent = '0';
            document.getElementById('badgeFingerprint').textContent = '0';
            if (chartManager) {
                chartManager.delayChart.data.labels = [];
                chartManager.delayChart.data.datasets[0].data = [];
                chartManager.throughputChart.data.labels = [];
                chartManager.throughputChart.data.datasets[0].data = [];
                chartManager.msgSizeChart.data.labels = [];
                chartManager.msgSizeChart.data.datasets[0].data = [];
                chartManager.delayChart.update();
                chartManager.throughputChart.update();
                chartManager.msgSizeChart.update();
            }
        } else {
            showToast(`❌ Delete failed`, 'error');
        }
    } catch (error) {
        showToast(`❌ Delete failed: ${error.message}`, 'error');
        console.error('Delete error:', error);
    }
}

// 🆕 TAMBAHAN BARU: Function Download Report
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
        csv += `\n===== PARAMETER LOGS =====\nTimestamp,Delay(ms),Throughput(B/s),Message Size(bytes),QoS\n`;
        if (paramData.data) {
            paramData.data.forEach(log => {
                const t = new Date(log.timestamp).toLocaleString('id-ID');
                csv += `${t},${log.delay},${log.throughput},${log.messageSize},${log.qos}\n`;
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `Report_${device}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('📄 Report downloaded successfully!', 'success');
    } catch (error) {
        showToast('Download failed', 'error');
    }
}
// END TAMBAHAN BARU

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
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}
