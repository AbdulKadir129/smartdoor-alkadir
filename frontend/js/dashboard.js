// ========================================
// DASHBOARD.JS - FINAL FIXED VERSION
// Logic: MQTT Handling, UI Updates, & Charting
// ========================================

// --- 1. KONFIGURASI ---
// Ganti IP ini dengan IP Address ESP32-CAM kamu jika ingin fitur Live Stream jalan
const ESP32_IP = "192.168.18.185"; 

// Konfigurasi MQTT HiveMQ
const MQTT_BROKER = "4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884;
const MQTT_ID = "admin_web_" + Math.random().toString(16).substr(2, 8);
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

// Topik MQTT (Harus SAMA PERSIS dengan di kodingan Arduino/ESP32)
const TOPIC_CAM_DATA = "smartdoor/cam/data";
const TOPIC_RFID_DATA = "smartdoor/rfid/data";
const TOPIC_FINGER_DATA = "smartdoor/finger/data";
const TOPIC_CONTROL = "smartdoor/control";

// Variabel Global
let activeDevice = 'cam'; // Default device
const historyData = {
    cam: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    rfid: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] },
    finger: { delay: [], jitter: [], throu: [], loss: [], size: [], labels: [] }
};

// Variabel QoS
let prevDelay = 0;
let lastSeq = -1;
let lostPackets = 0;
let totalPackets = 0;
let charts = null; // Menyimpan objek Chart.js

// --- 2. INISIALISASI SAAT HALAMAN DIMUAT ---
window.onload = function() {
    console.log("🚀 System Starting...");
    initCharts(); // Siapkan grafik
    connectMQTT(); // Hubungkan MQTT
};

// --- 3. FUNGSI CHART (GRAFIK) ---
function initCharts() {
    if (charts) return; // Jangan buat ulang jika sudah ada

    const createChart = (id, label, color) => {
        const canvas = document.getElementById(id);
        if (!canvas) return null;

        return new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    borderColor: color,
                    backgroundColor: color + '20', // Transparan
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 2
                }]
            },
            options: {
                animation: false,
                maintainAspectRatio: false,
                responsive: true,
                scales: { x: { display: false }, y: { beginAtZero: true } }
            }
        });
    };

    charts = {
        delay: createChart('chartDelay', 'Delay (ms)', '#e74a3b'),
        jitter: createChart('chartJitter', 'Jitter (ms)', '#f6c23e'),
        throu: createChart('chartThroughput', 'Throughput (bps)', '#4e73df'),
        loss: createChart('chartLoss', 'Packet Loss (%)', '#36b9cc'),
        size: createChart('chartSize', 'Msg Size (Bytes)', '#1cc88a')
    };
    
    console.log('✅ Grafik berhasil disiapkan');
}

// --- 4. LOGIKA MQTT ---
const mqtt = new MQTTClient(MQTT_BROKER, MQTT_PORT, MQTT_ID);

function connectMQTT() {
    // Hubungkan dengan SSL (wajib untuk HiveMQ Cloud port 8884)
    mqtt.connect(MQTT_USER, MQTT_PASS, true);
}

mqtt.on('connect', () => {
    console.log("✅ MQTT Connected!");
    document.getElementById('mqtt-status').innerText = "Online";
    document.getElementById('mqtt-status').className = "badge bg-success";
    
    // Subscribe ke semua topik
    mqtt.subscribe(TOPIC_CAM_DATA);
    mqtt.subscribe(TOPIC_RFID_DATA);
    mqtt.subscribe(TOPIC_FINGER_DATA);
});

mqtt.on('messageArrived', (msg) => {
    const topic = msg.destinationName;
    const payload = msg.payloadString;
    const size = payload.length; // Ukuran pesan dalam bytes
    const arrivalTime = Date.now();

    console.log(`📩 Pesan Masuk [${topic}]:`, payload); // DEBUGGER

    // Tentukan sumber data
    let sourceDev = '';
    if (topic === TOPIC_CAM_DATA) sourceDev = 'cam';
    else if (topic === TOPIC_RFID_DATA) sourceDev = 'rfid';
    else if (topic === TOPIC_FINGER_DATA) sourceDev = 'finger';

    if (!sourceDev) return;

    try {
        const data = JSON.parse(payload);
        // Ambil waktu kirim dari ESP32, kalau tidak ada pakai waktu sekarang
        const sentTime = data.sentTime || arrivalTime;

        // --- HITUNG QoS ---
        let delay = arrivalTime - sentTime;
        if (delay < 0) delay = 0; // Koreksi jika jam tidak sinkron

        let jitter = Math.abs(delay - prevDelay);
        prevDelay = delay;

        // Cek Packet Loss berdasarkan sequence number
        let seq = data.sequenceNumber || (lastSeq + 1);
        if (lastSeq !== -1 && seq > lastSeq + 1) {
            lostPackets += (seq - lastSeq - 1);
        }
        lastSeq = seq;
        totalPackets++;

        let lossPct = totalPackets > 0 ? (lostPackets / totalPackets) * 100 : 0;
        let throughput = size * 8; // bits

        // --- SIMPAN KE HISTORY ---
        const hist = historyData[sourceDev];
        // Batasi hanya simpan 20 data terakhir agar memori ringan
        if (hist.labels.length > 20) {
            hist.labels.shift(); hist.delay.shift(); hist.jitter.shift();
            hist.throu.shift(); hist.loss.shift(); hist.size.shift();
        }
        hist.labels.push(arrivalTime);
        hist.delay.push(delay);
        hist.jitter.push(jitter);
        hist.throu.push(throughput);
        hist.loss.push(lossPct);
        hist.size.push(size);

        // --- UPDATE TAMPILAN JIKA DEVICE SEDANG DIBUKA ---
        if (sourceDev === activeDevice) {
            updateDashboardCards(delay, jitter, throughput, lossPct, size);
            updateCharts(hist);
            updateUserInfo(data);
            
            // Khusus CAM, refresh gambar jika perlu
            if (sourceDev === 'cam') refreshCam();
        }

        // --- TAMBAH KE TABEL LOG (DATA LOGS) ---
        // Deteksi User ID (bisa bernama userId, uid, atau id)
        let uid = data.userId || data.uid || data.id || "Unknown";
        
        // Deteksi Data Tambahan (Score wajah atau info kartu)
        let extraInfo = '-';
        if (sourceDev === 'cam' && data.similarity) extraInfo = `Score: ${data.similarity.toFixed(2)}`;
        else if (data.status) extraInfo = data.status;

        addLog(sentTime, sourceDev, uid, extraInfo, delay);

    } catch (e) {
        console.error('❌ Error parsing JSON:', e);
    }
});


// --- 5. FUNGSI UPDATE UI & NAVIGASI ---

function switchDevice(dev) {
    activeDevice = dev;
    console.log("🔄 Switch Device to:", dev);

    // Update Tombol Tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + dev).classList.add('active');

    // Update Tampilan View (Kamera/Icon RFID/Finger)
    document.querySelectorAll('.dev-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + dev).classList.add('active');
    
    document.getElementById('active-device-label').innerText = dev.toUpperCase();

    // Reset Kartu Info User
    resetUserInfo();
    
    // Tampilkan Data Grafik Terakhir dari Device ini
    updateCharts(historyData[dev]);
    
    // Reset angka QoS di kartu sementara (sampai data baru masuk)
    updateDashboardCards(0, 0, 0, 0, 0);
}

function updateDashboardCards(delay, jitter, throu, loss, size) {
    document.getElementById('val-delay').innerText = delay.toFixed(0) + " ms";
    document.getElementById('val-jitter').innerText = jitter.toFixed(0) + " ms";
    document.getElementById('val-throughput').innerText = throu.toFixed(0) + " bps";
    document.getElementById('val-loss').innerText = loss.toFixed(2) + " %";
    document.getElementById('val-size').innerText = size + " B";
}

function updateCharts(dataObj) {
    if (!charts) return;
    
    const updateDataset = (chart, data) => {
        if(chart) {
            chart.data.labels = dataObj.labels;
            chart.data.datasets[0].data = data;
            chart.update();
        }
    };

    updateDataset(charts.delay, dataObj.delay);
    updateDataset(charts.jitter, dataObj.jitter);
    updateDataset(charts.throu, dataObj.throu);
    updateDataset(charts.loss, dataObj.loss);
    updateDataset(charts.size, dataObj.size);
}

function updateUserInfo(data) {
    let uid = data.userId || data.uid || "-";
    document.getElementById('user-id').innerText = uid;

    let name = (uid == 1) ? "Admin" : (uid == "-" ? "-" : "User " + uid);
    document.getElementById('user-name').innerText = name;

    const statusEl = document.getElementById('auth-status');
    const iconEl = document.getElementById('user-icon');

    // Logika Status: Jika ada 'status' di JSON gunakan itu, jika tidak cek ID
    let status = data.status || (uid != "-" && uid > 0 ? "GRANTED" : "DENIED");

    if (status.toUpperCase().includes("GRANT") || status.toUpperCase().includes("SUCCESS")) {
        statusEl.innerText = "GRANTED";
        statusEl.className = "fw-bold text-success";
        iconEl.className = "fas fa-user-check fa-4x text-success";
    } else {
        statusEl.innerText = "DENIED";
        statusEl.className = "fw-bold text-danger";
        iconEl.className = "fas fa-user-times fa-4x text-danger";
    }

    document.getElementById('auth-time').innerText = new Date().toLocaleTimeString();
}

function resetUserInfo() {
    document.getElementById('user-id').innerText = "-";
    document.getElementById('user-name').innerText = "-";
    document.getElementById('auth-status').innerText = "-";
    document.getElementById('auth-time').innerText = "-";
    document.getElementById('user-icon').className = "fas fa-user fa-4x text-secondary";
}

function switchPage(page) {
    // Sembunyikan semua halaman
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Tampilkan halaman yang dipilih
    document.getElementById('page-' + page).classList.add('active');
    
    // Highlight menu sidebar
    // Cari elemen nav-item yang memanggil fungsi ini (agak tricky kalau dipanggil manual)
    const navItems = document.querySelectorAll('.nav-item');
    if(page === 'dashboard') navItems[0].classList.add('active');
    if(page === 'network') navItems[1].classList.add('active');
    if(page === 'control') navItems[2].classList.add('active');
    if(page === 'data') navItems[3].classList.add('active');

    document.getElementById('page-title').innerText = page.toUpperCase() + " VIEW";

    // Jika masuk ke Network, pastikan chart siap
    if (page === 'network') initCharts();
}

// --- 6. FUNGSI CONTROL (SERVO/SOLENOID) ---
function kirimPerintah(cmd) {
    if (mqtt.isConnected) {
        // Kirim perintah 'open', 'lock', atau 'enroll'
        mqtt.publish(TOPIC_CONTROL, cmd, 1);
        alert("Perintah dikirim: " + cmd);
    } else {
        alert("Gagal: MQTT belum terhubung!");
    }
}

// --- 7. FUNGSI LOG TABEL ---
function addLog(time, dev, id, info, delay) {
    let table = document.getElementById("log-table-body");
    if (!table) return;

    let row = table.insertRow(0); // Tambah di baris paling atas
    let tStr = new Date(time).toLocaleTimeString();

    let badgeColor = "bg-secondary";
    let devIcon = "fa-microchip";

    if (dev === 'cam') { badgeColor = "bg-primary"; devIcon = "fa-camera"; } 
    else if (dev === 'rfid') { badgeColor = "bg-warning text-dark"; devIcon = "fa-id-card"; } 
    else if (dev === 'finger') { badgeColor = "bg-success"; devIcon = "fa-fingerprint"; }

    row.innerHTML = `
        <td><small class="text-muted">${tStr}</small></td>
        <td><span class="badge ${badgeColor}"><i class="fas ${devIcon} me-1"></i>${dev.toUpperCase()}</span></td>
        <td class="fw-bold">${id}</td>
        <td>${info}</td>
        <td>${delay.toFixed(0)} ms</td>
        <td><span class="badge bg-light text-dark border">Received</span></td>
    `;

    // Hapus data lama jika sudah lebih dari 15 baris
    if (table.rows.length > 15) table.deleteRow(15);
}

function refreshCam() {
    // Fitur reload gambar kamera (hanya bekerja di jaringan lokal yang sama)
    let img = document.getElementById('cam-feed');
    if(img) img.src = `http://${ESP32_IP}/capture?t=${new Date().getTime()}`;
}