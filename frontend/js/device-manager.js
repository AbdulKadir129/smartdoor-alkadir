// ========================================
// DEVICE MANAGER - FIXED VERSION (MODIFIED FOR QOS)
// Perbaikan: Target ID disesuaikan dengan HTML (log-table-body)
// dan format output diubah menjadi Table Row (<tr>)
// ========================================

class DeviceManager {
    constructor() {
        this.currentDevice = 'esp32cam';
        this.devices = ['esp32cam', 'rfid', 'fingerprint'];
    }

    // Switch device
    switchDevice(device) {
        if (!this.devices.includes(device)) {
            console.error('❌ Invalid device:', device);
            return;
        }

        this.currentDevice = device;
        this.loadDeviceStats(device);
        this.loadDeviceHistory(device);

        console.log(`✅ Device switched to: ${device}`);
    }

    // Load device statistics
    async loadDeviceStats(device) {
        try {
            console.log(`📊 Loading stats for ${device}...`);

            if (!window.BASE_URL) {
                console.warn('⚠️ BASE_URL belum diset, skip loadDeviceStats');
                return;
            }

            // Load auth stats
            const authRes = await fetch(`${window.BASE_URL}/api/auth/stats/${device}`);
            const authData = await authRes.json();

            if (authData.success) {
                this.updateElement('statTotal', authData.stats.total || 0);
                this.updateElement('statSuccess', authData.stats.success || 0);
                this.updateElement('statFailed', authData.stats.failed || 0);
            }

            // Load param stats
            const paramRes = await fetch(`${window.BASE_URL}/api/param/stats/${device}`);
            const paramData = await paramRes.json();

            if (paramData.success) {
                // Ambil rata-rata RSSI dari data statistik yang dikirim backend
                const avgRssi = parseFloat(paramData.stats.avgRssi || 0);

                this.updateElement('statDelay', parseFloat(paramData.stats.avgDelay || 0).toFixed(2) + ' ms');
                this.updateElement('statThroughput', parseFloat(paramData.stats.avgThroughput || 0).toFixed(2) + ' bps');
                this.updateElement('statMsgSize', parseFloat(paramData.stats.avgMessageSize || 0).toFixed(2) + ' B');
                this.updateElement('statJitter', parseFloat(paramData.stats.avgJitter || 0).toFixed(2) + ' ms');
                this.updateElement('statPacketLoss', parseFloat(paramData.stats.avgPacketLoss || 0).toFixed(2) + ' %');

                // Update juga nilai di kartu atas (Network QoS Summary)
                this.updateElement('val-delay', parseFloat(paramData.stats.avgDelay || 0).toFixed(2) + ' ms');
                this.updateElement('val-jitter', parseFloat(paramData.stats.avgJitter || 0).toFixed(2) + ' ms');
                this.updateElement('val-throughput', parseFloat(paramData.stats.avgThroughput || 0).toFixed(2) + ' bps');
                this.updateElement('val-loss', parseFloat(paramData.stats.avgPacketLoss || 0).toFixed(2) + ' %');
                this.updateElement('val-size', parseFloat(paramData.stats.avgMessageSize || 0).toFixed(2) + ' B');
                
                // ✅ TAMBAHAN: Update Kartu RSSI di Ringkasan QoS
                this.updateElement('val-rssi', avgRssi.toFixed(0) + ' dBm');

                console.log('✅ Stats loaded successfully');
            }

        } catch (error) {
            console.error('❌ Error loading stats:', error);
        }
    }

    // Helper method to update element
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
            // Animasi kecil
            element.style.transform = 'scale(1.1)';
            setTimeout(() => {
                element.style.transform = 'scale(1)';
            }, 200);
        }
    }

    // Load device history (activity log)
    async loadDeviceHistory(device) {
        try {
            console.log(`📜 Loading history for ${device}...`);

            if (!window.BASE_URL) {
                console.warn('⚠️ BASE_URL belum diset, skip loadDeviceHistory');
                return;
            }

            // NOTE: Memuat log dari API Auth (yang menyimpan AuthLog/ParamLog)
            const response = await fetch(`${window.BASE_URL}/api/auth/logs/${device}`);
            const result = await response.json();

            if (result.success) {
                this.displayActivityLog(result.data);
                console.log(`✅ Loaded ${result.data?.length || 0} activity logs`);
            }
        } catch (error) {
            console.error('❌ Error loading history:', error);
        }
    }

    // Display activity log (FIXED: Uses Table Rows now)
    displayActivityLog(logs) {
        const container = document.getElementById('log-table-body');

        if (!container) {
            console.warn('⚠️ log-table-body container not found, check index.html IDs');
            return;
        }

        if (!logs || logs.length === 0) {
            // Tampilkan pesan kosong dalam format baris tabel
            // ✅ Ubah colspan menjadi 8 (sesuai jumlah kolom baru)
            container.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada data aktivitas.</td></tr>';
            return;
        }

        // PERBAIKAN 2: Mengembalikan format <tr> (Table Row) dengan 8 kolom
        container.innerHTML = logs.slice(0, 15).map(log => {
            
            // ✅ Ambil metrik dari Metadata (untuk AuthLog) atau langsung dari log (untuk ParamLog jika digabungkan)
            const delay = log.metadata?.authDelay || log.delay || 0;
            const jitter = log.metadata?.jitter || log.jitter || 0;
            const throughput = log.metadata?.throughput || log.throughput || 0;

            const time = new Date(log.timestamp).toLocaleString('id-ID', {
                dateStyle: 'short',
                timeStyle: 'medium'
            });

            // Tentukan warna badge status
            const isSuccess = log.status === 'success' || log.status === 'granted';
            const badgeClass = isSuccess ? 'bg-success' : 'bg-danger';
            const statusText = log.status ? log.status.toUpperCase() : 'UNKNOWN';
            
            // Kolom Event / Msg menggunakan log.message (dari AuthLog) atau log.payload (dari ParamLog)
            const message = log.message || log.payload || log.score || '-';

            return `
                <tr>
                    <td>${time}</td>
                    <td><span class="badge bg-secondary">${log.device || '-'}</span></td>
                    <td class="fw-bold">${log.userId || log.userName || '-'}</td>
                    <td>${message}</td>
                    
                    <td>${delay.toFixed(0)} ms</td>
                    <td>${jitter.toFixed(0)} ms</td>
                    <td>${throughput.toFixed(0)} bps</td>
                    <td><span class="badge ${badgeClass}">${statusText}</span></td>
                </tr>
            `;
        }).join('');
    }

    getCurrentDevice() {
        return this.currentDevice;
    }
}

window.DeviceManager = DeviceManager;