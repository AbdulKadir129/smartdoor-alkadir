// ========================================
// DASHBOARD.JS - Smart Door Admin System
// Logic utama: MQTT, Chart, QoS, UI Control
// ========================================

// --- 1. KONFIGURASI (SESUAIKAN DENGAN ALAT) ---
const ESP32_IP = "192.168.18.185";

const MQTT_BROKER = "4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884;
const MQTT_ID = "admin_" + Math.random().toString(16).substr(2, 8);
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

const TOPIC_CAM_DATA = "smartdoor/cam/data";
const TOPIC_RFID_DATA = "smartdoor/rfid/data";
const TOPIC_FINGER_DATA = "smartdoor/finger/data";
const TOPIC_CONTROL = "smartdoor/control";

let activeDevice = 'cam';
const historyData = {
    cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
};

let prevDelay = 0;
let lastSeq = -1;
let lostPackets = 0;
let totalPackets = 0;


// --- 2. SETUP CHART (MaintainAspectRatio FALSE = KUNCI) ---
const createChart = (id, label, color) => new Chart(document.getElementById(id).getContext('2d'), {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: label,
            data: [],
            borderColor: color,
            tension: 0.3,
            borderWidth: 2
        }]
    },
    options: {
        animation: false,
        maintainAspectRatio: false,
        responsive: true,
        scales: { x: { display: false } }
    }
});

const charts = {
    delay: createChart('chartDelay', 'Delay (ms)', '#e74a3b'),
    jitter: createChart('chartJitter', 'Jitter (ms)', '#f6c23e'),
    throu: createChart('chartThroughput', 'Throughput (bps)', '#4e73df'),
    loss: createChart('chartLoss', 'Packet Loss (%)', '#36b9cc'),
    size: createChart('chartSize', 'Msg Size (Bytes)', '#1cc88a')
};


// --- 3. MQTT LOGIC ---
const mqtt = new MQTTClient(MQTT_BROKER, MQTT_PORT, MQTT_ID);

mqtt.on('connect', () => {
    console.log("✅ MQTT Connected");
    document.getElementById('mqtt-status').innerText = "Connected";
    document.getElementById('mqtt-status').className = "badge bg-success";
    mqtt.subscribe(TOPIC_CAM_DATA);
    mqtt.subscribe(TOPIC_RFID_DATA);
    mqtt.subscribe(TOPIC_FINGER_DATA);
});

mqtt.on('messageArrived', (msg) => {
    const topic = msg.destinationName;
    const payload = msg.payloadString;
    const size = payload.length;
    const arrivalTime = Date.now();

    let sourceDev = '';
    if (topic === TOPIC_CAM_DATA) sourceDev = 'cam';
    else if (topic === TOPIC_RFID_DATA) sourceDev = 'rfid';
    else if (topic === TOPIC_FINGER_DATA) sourceDev = 'finger';

    if (!sourceDev) return;

    try {
        const data = JSON.parse(payload);
        const sentTime = data.sentTime || arrivalTime;

        // --- QoS Calc ---
        let delay = arrivalTime - sentTime;
        if (delay < 0) delay = 0;

        let jitter = Math.abs(delay - prevDelay);
        prevDelay = delay;

        let seq = data.sequenceNumber || (lastSeq + 1);
        if (lastSeq !== -1 && seq > lastSeq + 1) {
            lostPackets += (seq - lastSeq - 1);
        }
        lastSeq = seq;
        totalPackets++;

        let lossPct = (lostPackets / totalPackets) * 100;
        let throughput = size * 8;

        // --- Save History ---
        const hist = historyData[sourceDev];
        if (hist.labels.length > 20) {
            hist.labels.shift();
            hist.delay.shift();
            hist.jitter.shift();
            hist.throu.shift();
            hist.loss.shift();
            hist.size.shift();
        }
        hist.labels.push(arrivalTime);
        hist.delay.push(delay);
        hist.jitter.push(jitter);
        hist.throu.push(throughput);
        hist.loss.push(lossPct);
        hist.size.push(size);

        // --- Update UI if device is active ---
        if (sourceDev === activeDevice) {
            document.getElementById('val-delay').innerText = delay + " ms";
            document.getElementById('val-jitter').innerText = jitter + " ms";
            document.getElementById('val-throughput').innerText = throughput + " bps";
            document.getElementById('val-loss').innerText = lossPct.toFixed(2) + " %";
            document.getElementById('val-size').innerText = size + " B";

            updateCharts(hist);
            updateUserInfo(data);
            if (sourceDev === 'cam') refreshCam();
        }

        // --- Add to Log Table ---
        let displayData = (sourceDev === 'cam') ? (data.similarity ? data.similarity.toFixed(2) : '0.00') : 'Valid Tap';
        addLog(seq, sentTime, sourceDev, data.userId || data.uid, displayData, delay);

        // --- Optional: Save to Backend ---
        // saveToDatabase(data, sourceDev, delay, jitter, lossPct);

    } catch (e) {
        console.error('❌ Error parsing MQTT message:', e);
    }
});

mqtt.connect(MQTT_USER, MQTT_PASS, true);


// --- 4. HELPER FUNCTIONS ---

function switchDevice(dev) {
    activeDevice = dev;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + dev).classList.add('active');
    document.querySelectorAll('.dev-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + dev).classList.add('active');
    document.getElementById('active-device-label').innerText = dev.toUpperCase();

    updateCharts(historyData[dev]);

    // Reset Info Card
    document.getElementById('user-id').innerText = "-";
    document.getElementById('user-name').innerText = "-";
    document.getElementById('auth-status').innerText = "-";
    document.getElementById('auth-time').innerText = "-";
    document.getElementById('user-icon').className = "fas fa-user fa-4x text-secondary";
}

function updateCharts(dataObj) {
    charts.delay.data.labels = dataObj.labels;
    charts.delay.data.datasets[0].data = dataObj.delay;
    charts.delay.update();

    charts.jitter.data.labels = dataObj.labels;
    charts.jitter.data.datasets[0].data = dataObj.jitter;
    charts.jitter.update();

    charts.throu.data.labels = dataObj.labels;
    charts.throu.data.datasets[0].data = dataObj.throu;
    charts.throu.update();

    charts.loss.data.labels = dataObj.labels;
    charts.loss.data.datasets[0].data = dataObj.loss;
    charts.loss.update();

    charts.size.data.labels = dataObj.labels;
    charts.size.data.datasets[0].data = dataObj.size;
    charts.size.update();
}

function updateUserInfo(data) {
    let uid = data.userId || data.uid || "-";
    document.getElementById('user-id').innerText = uid;

    let name = (uid == 1) ? "Alkadir" : (uid == "-" ? "-" : "User " + uid);
    document.getElementById('user-name').innerText = name;

    const statusEl = document.getElementById('auth-status');
    const iconEl = document.getElementById('user-icon');

    if (uid != "-" && uid > 0) {
        statusEl.innerText = "GRANTED";
        statusEl.className = "fw-bold text-success";
        iconEl.className = "fas fa-user-check fa-4x text-success";
    } else {
        statusEl.innerText = "DENIED";
        statusEl.className = "fw-bold text-danger";
        iconEl.className = "fas fa-user-times fa-4x text-danger";
    }

    let eventTime = data.sentTime ? new Date(data.sentTime) : new Date();
    document.getElementById('auth-time').innerText = eventTime.toLocaleTimeString();
}

function refreshCam() {
    let url = `http://${ESP32_IP}/capture?t=${new Date().getTime()}`;
    document.getElementById('cam-feed').src = url;
}

function switchPage(page) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    event.currentTarget.classList.add('active');
    document.getElementById('page-title').innerText = page.toUpperCase() + " VIEW";

    // Hide Device Tabs in Log Page
    const tabContainer = document.querySelector('.device-tabs');
    if (page === 'data') {
        tabContainer.style.display = 'none';
    } else {
        tabContainer.style.display = 'flex';
    }
}

function kirimPerintah(cmd) {
    if (mqtt.isConnected) {
        const message = new Paho.MQTT.Message(cmd);
        message.destinationName = TOPIC_CONTROL;
        mqtt.client.send(message);
        alert("Perintah Terkirim: " + cmd);
    } else {
        alert("MQTT Disconnected!");
    }
}

function addLog(seq, time, dev, id, score, d) {
    let table = document.getElementById("log-table-body");
    let row = table.insertRow(0);
    let tStr = new Date(time).toLocaleTimeString();

    let badgeColor = "bg-secondary";
    let devIcon = "fa-microchip";

    if (dev === 'cam') {
        badgeColor = "bg-primary";
        devIcon = "fa-camera";
    } else if (dev === 'rfid') {
        badgeColor = "bg-warning text-dark";
        devIcon = "fa-id-card";
    } else if (dev === 'finger') {
        badgeColor = "bg-success";
        devIcon = "fa-fingerprint";
    }

    row.innerHTML = `
        <td><small class="text-muted">${tStr}</small></td>
        <td><span class="badge ${badgeColor}"><i class="fas ${devIcon} me-1"></i>${dev.toUpperCase()}</span></td>
        <td class="fw-bold">${id}</td>
        <td>${score ? score : '-'}</td>
        <td>${d} ms</td>
        <td><span class="badge bg-light text-dark border">Success</span></td>
    `;

    if (table.rows.length > 15) table.deleteRow(15);
}

console.log('✅ Dashboard.js loaded successfully');
