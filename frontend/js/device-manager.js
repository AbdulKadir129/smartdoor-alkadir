// ========================================
// DEVICE MANAGER - IMPROVED VERSION
// Mengelola device switching dan statistik
// UPDATED: Menambahkan Jitter & Packet Loss display
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
                this.updateElement('statDelay', parseFloat(paramData.stats.avgDelay || 0).toFixed(2));
                this.updateElement('statThroughput', parseFloat(paramData.stats.avgThroughput || 0).toFixed(2));
                this.updateElement('statMsgSize', parseFloat(paramData.stats.avgMessageSize || 0).toFixed(2));
                
                // ✅ TAMBAHAN BARU: Jitter & Packet Loss
                this.updateElement('statJitter', parseFloat(paramData.stats.avgJitter || 0).toFixed(2));
                this.updateElement('statPacketLoss', parseFloat(paramData.stats.avgPacketLoss || 0).toFixed(2));
                
                console.log(`✅ Stats loaded successfully`);
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
            
            // Add animation effect
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

    // Display activity log
    displayActivityLog(logs) {
        const container = document.getElementById('activityLog');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="no-activity">No activity yet...</div>';
            return;
        }

        container.innerHTML = logs.slice(0, 15).map(log => {
            const time = new Date(log.timestamp).toLocaleString('id-ID', {
                dateStyle: 'short',
                timeStyle: 'medium'
            });
            
            const statusClass = log.status === 'success' ? 'success' : 'failed';
            const icon = log.status === 'success' ? '✅' : '❌';
            const userName = log.userName || log.userId || 'Unknown';
            const message = log.message || log.status;
            
            return `
                <div class="activity-item ${statusClass}">
                    <div class="activity-header">
                        <span class="activity-title">${icon} ${log.method || log.device}</span>
                        <span class="activity-time">${time}</span>
                    </div>
                    <div class="activity-details">
                        <strong>${userName}</strong> - ${message}
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