// ========================================
// MAIN.JS - Smart Door Security System
// FINAL VERSION (RENDER + HIVEMQ CLOUD)
// ========================================

// Configuration
// 🌟 PERBAIKAN: Mengganti localhost/ngrok ke URL Render 24 JAM
// URL API Render Anda: https://smartdoor-alkadir.onrender.com
window.BASE_URL = 'https://smartdoor-alkadir.onrender.com'; 

const MQTT_CONFIG = {
    // URL Cluster HiveMQ (Sudah benar dari update sebelumnya)
    broker: '183611ea7b1b4543baa31e5dc5cf0fc3.s1.eu.hivemq.cloud', 
    // Port WebSocket Secure (WSS) untuk Web
    port: 8884, 
    // Credential Device yang sudah dibuat
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
        // Tampilkan error spesifik jika ada
        console.error("Connection lost detail:", response.errorMessage);
        showToast('MQTT Connection Lost', 'error');
    });

    mqttClient.on('messageArrived', (message) => {
        handleMQTTMessage(message);
    });

    // UPDATE: Connect dengan Username, Password, dan SSL (true)
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
            const timestamp = data.timestamp || Date.now();
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