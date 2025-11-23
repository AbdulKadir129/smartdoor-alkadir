// ========================================
// DEVICE MANAGER
// Mengelola device switching dan statistik
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
        
        console.log('✅ Device switched to:', device);
    }

    // Load device statistics
    async loadDeviceStats(device) {
        try {
            // Load auth stats
            const authRes = await fetch(`${window.BASE_URL}/api/auth/stats/${device}`);
            const authData = await authRes.json();

            if (authData.success) {
                document.getElementById('statTotal').textContent = authData.stats.total || 0;
                document.getElementById('statSuccess').textContent = authData.stats.success || 0;
                document.getElementById('statFailed').textContent = authData.stats.failed || 0;
            }

            // Load param stats
            const paramRes = await fetch(`${window.BASE_URL}/api/param/stats/${device}`);
            const paramData = await paramRes.json();

            if (paramData.success) {
                document.getElementById('statDelay').textContent = parseFloat(paramData.stats.avgDelay).toFixed(2);
                document.getElementById('statThroughput').textContent = parseFloat(paramData.stats.avgThroughput).toFixed(2);
                document.getElementById('statMsgSize').textContent = parseFloat(paramData.stats.avgMessageSize).toFixed(2);
            }

        } catch (error) {
            console.error('❌ Error loading stats:', error);
        }
    }

    // Load device history (activity log)
    async loadDeviceHistory(device) {
        try {
            const response = await fetch(`${window.BASE_URL}/api/auth/logs/${device}`);
            const result = await response.json();

            if (result.success) {
                this.displayActivityLog(result.data);
            }
        } catch (error) {
            console.error('❌ Error loading history:', error);
        }
    }

    // Display activity log
    displayActivityLog(logs) {
        const container = document.getElementById('activityLog');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="no-activity">No activity yet...</div>';
            return;
        }

        container.innerHTML = logs.slice(0, 15).map(log => {
            const time = new Date(log.timestamp).toLocaleString('id-ID');
            const statusClass = log.status === 'success' ? 'success' : 'failed';
            const icon = log.status === 'success' ? '✅' : '❌';
            
            return `
                <div class="activity-item ${statusClass}">
                    <div class="activity-header">
                        <span class="activity-title">${icon} ${log.method || log.device}</span>
                        <span class="activity-time">${time}</span>
                    </div>
                    <div class="activity-details">
                        ${log.userName || log.userId || 'Unknown'} - ${log.message || log.status}
                    </div>
                </div>
            `;
        }).join('');
    }

    getCurrentDevice() {
        return this.currentDevice;
    }
}

window.DeviceManager = DeviceManager;
