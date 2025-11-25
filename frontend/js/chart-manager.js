// ========================================
// CHART MANAGER - IMPROVED VERSION
// Mengelola 5 Grafik Terpisah untuk Skripsi
// UPDATED: Tambah Jitter & Packet Loss Charts
// ========================================

class ChartManager {
    constructor() {
        console.log('📊 Initializing Chart Manager with 5 Charts...');
        this.maxDataPoints = 20; 
        
        // Inisialisasi 5 Chart
        this.delayChart = this.createChart('delayChart', 'Delay (ms)', 'rgb(239, 68, 68)');
        this.throughputChart = this.createChart('throughputChart', 'Throughput (bps)', 'rgb(59, 130, 246)');
        this.msgSizeChart = this.createChart('messageSizeChart', 'Message Size (bytes)', 'rgb(16, 185, 129)');
        
        // ✅ TAMBAHAN BARU: Jitter & Packet Loss
        this.jitterChart = this.createChart('jitterChart', 'Jitter (ms)', 'rgb(245, 158, 11)');
        this.packetLossChart = this.createChart('packetLossChart', 'Packet Loss (%)', 'rgb(236, 72, 153)');
        
        console.log('✅ All 5 Charts initialized successfully');
    }

    createChart(canvasId, label, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`⚠️ Canvas ${canvasId} not found`);
            return null;
        }

        const ctx = canvas.getContext('2d');
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    borderColor: color,
                    backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { 
                        display: true,
                        position: 'top',
                        labels: {
                            font: { size: 11, weight: '600' },
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: { 
                        enabled: true,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 12, weight: '700' },
                        bodyFont: { size: 11 },
                        cornerRadius: 6
                    }
                },
                scales: {
                    x: {
                        display: true,
                        ticks: { 
                            maxRotation: 45,
                            minRotation: 0,
                            autoSkip: true, 
                            maxTicksLimit: 8, 
                            font: { size: 10 },
                            color: '#6b7280'
                        },
                        grid: { 
                            display: false 
                        },
                        border: {
                            color: '#e5e7eb'
                        }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { 
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: { 
                            font: { size: 10 },
                            color: '#6b7280',
                            padding: 8
                        },
                        border: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    // ✅ UPDATED: Tambah parameter jitter & packetLoss
    updateChart(timestamp, delay, throughput, messageSize, jitter = 0, packetLoss = 0) {
        const time = new Date(timestamp).toLocaleTimeString('id-ID', {
            hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        this.addData(this.delayChart, time, delay);
        this.addData(this.throughputChart, time, throughput);
        this.addData(this.msgSizeChart, time, messageSize);
        
        // ✅ TAMBAHAN BARU: Update Jitter & Packet Loss
        this.addData(this.jitterChart, time, jitter);
        this.addData(this.packetLossChart, time, packetLoss);
    }

    addData(chart, label, data) {
        if (!chart) return;
        
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(data);
        
        if (chart.data.labels.length > this.maxDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        
        chart.update('none'); // No animation for performance
    }

    async loadHistory(device) {
        if (!this.delayChart) return;
        
        try {
            console.log(`📥 Loading history for ${device}...`);
            const response = await fetch(`${window.BASE_URL}/api/param/logs/${device}`);
            const result = await response.json();

            if (result.success && result.data && result.data.length > 0) {
                this.clearCharts();
                const recentData = result.data.slice(0, this.maxDataPoints).reverse();

                recentData.forEach(log => {
                    const time = new Date(log.timestamp).toLocaleTimeString('id-ID', {
                        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
                    });
                    
                    this.pushDataOnly(this.delayChart, time, log.delay);
                    this.pushDataOnly(this.throughputChart, time, log.throughput);
                    this.pushDataOnly(this.msgSizeChart, time, log.messageSize);
                    
                    // ✅ TAMBAHAN BARU: Load Jitter & Packet Loss
                    this.pushDataOnly(this.jitterChart, time, log.jitter || 0);
                    this.pushDataOnly(this.packetLossChart, time, log.packetLoss || 0);
                });

                this.updateAllCharts();
                console.log(`✅ Loaded ${recentData.length} data points`);
            } else {
                console.log('📭 No history data available');
                this.clearCharts();
            }
        } catch (error) {
            console.error('❌ Error loading history:', error);
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
        [this.delayChart, this.throughputChart, this.msgSizeChart, 
         this.jitterChart, this.packetLossChart].forEach(chart => {
            if (chart) chart.update();
        });
    }

    clearCharts() {
        console.log('🧹 Clearing all charts...');
        [this.delayChart, this.throughputChart, this.msgSizeChart,
         this.jitterChart, this.packetLossChart].forEach(chart => {
            if (chart) {
                chart.data.labels = [];
                chart.data.datasets[0].data = [];
                chart.update();
            }
        });
    }
}

window.ChartManager = ChartManager;