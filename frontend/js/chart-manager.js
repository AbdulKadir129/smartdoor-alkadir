// ========================================
// CHART MANAGER - 100% REAL DATA
// Untuk Analisis Jaringan MQTT
// ========================================

class ChartManager {
    constructor() {
        console.log('📊 Initializing Chart Manager (100% Real Data)...');
        this.maxDataPoints = 20;
        
        this.delayChart = this.createChart('delayChart', 'Delay (ms)', 'rgb(239, 68, 68)');
        this.throughputChart = this.createChart('throughputChart', 'Throughput (bps)', 'rgb(59, 130, 246)');
        this.msgSizeChart = this.createChart('messageSizeChart', 'Message Size (bytes)', 'rgb(16, 185, 129)');
        this.jitterChart = this.createChart('jitterChart', 'Jitter (ms)', 'rgb(245, 158, 11)');
        this.packetLossChart = this.createChart('packetLossChart', 'Packet Loss (%)', 'rgb(236, 72, 153)');
        
        console.log('✅ All 5 Charts initialized');
    }

    createChart(canvasId, label, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ', 0.3)'));
        gradient.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ', 0.0)'));
        
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    borderColor: color,
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: { enabled: true }
                },
                scales: {
                    x: { display: true, grid: { display: false } },
                    y: { display: true, beginAtZero: true }
                }
            }
        });
    }

    updateChart(timestamp, delay, throughput, messageSize, jitter = 0, packetLoss = 0) {
        const time = new Date(timestamp).toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.addData(this.delayChart, time, delay);
        this.addData(this.throughputChart, time, throughput);
        this.addData(this.msgSizeChart, time, messageSize);
        this.addData(this.jitterChart, time, jitter);
        this.addData(this.packetLossChart, time, packetLoss);
    }

    updatePacketLossOnly(packetLoss) {
        if (!this.packetLossChart) return;
        const data = this.packetLossChart.data.datasets[0].data;
        if (data.length > 0) {
            data[data.length - 1] = packetLoss;
            this.packetLossChart.update('none');
        }
    }

    addData(chart, label, data) {
        if (!chart) return;
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(data);
        if (chart.data.labels.length > this.maxDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        chart.update('default');
    }

    async loadHistory(device) {
        if (!this.delayChart) return;
        try {
            const response = await fetch(`${window.BASE_URL}/api/param/logs/${device}`);
            const result = await response.json();
            if (result.success && result.data?.length > 0) {
                this.clearCharts();
                result.data.slice(0, this.maxDataPoints).reverse().forEach(log => {
                    const time = new Date(log.timestamp).toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    this.pushDataOnly(this.delayChart, time, log.delay || 0);
                    this.pushDataOnly(this.throughputChart, time, log.throughput || 0);
                    this.pushDataOnly(this.msgSizeChart, time, log.messageSize || 0);
                    this.pushDataOnly(this.jitterChart, time, log.jitter || 0);
                    this.pushDataOnly(this.packetLossChart, time, log.packetLoss || 0);
                });
                this.updateAllCharts();
            } else {
                this.clearCharts();
            }
        } catch (error) {
            this.clearCharts();
        }
    }

    pushDataOnly(chart, label, data) {
        if (chart) {
            chart.data.labels.push(label);
            chart.data.datasets[0].data.push(data);
        }
    }

    updateAllCharts() {
        [this.delayChart, this.throughputChart, this.msgSizeChart, this.jitterChart, this.packetLossChart].forEach(c => c?.update('default'));
    }

    clearCharts() {
        [this.delayChart, this.throughputChart, this.msgSizeChart, this.jitterChart, this.packetLossChart].forEach(c => {
            if (c) { c.data.labels = []; c.data.datasets[0].data = []; c.update('none'); }
        });
    }
}

window.ChartManager = ChartManager;