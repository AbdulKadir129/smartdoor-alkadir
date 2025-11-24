// ========================================
// CHART MANAGER (Fixed Height Version)
// Mengelola 3 Grafik Terpisah untuk Skripsi
// UPDATED: Throughput Unit (bps)
// ========================================

class ChartManager {
    constructor() {
        console.log('📊 Initializing Split Chart Manager...');
        this.maxDataPoints = 20; 
        
        // Inisialisasi 3 Chart
        this.delayChart = this.createChart('delayChart', 'Delay (ms)', 'rgb(255, 99, 132)');
        
        // --- PERBAIKAN LABEL: Ganti B/s jadi bps ---
        this.throughputChart = this.createChart('throughputChart', 'Throughput (bps)', 'rgb(54, 162, 235)');
        
        this.msgSizeChart = this.createChart('messageSizeChart', 'Message Size (bytes)', 'rgb(75, 192, 192)');
        
        console.log('✅ All 3 Charts initialized successfully');
    }

    createChart(canvasId, label, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

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
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // PENTING agar bisa di-resize tingginya
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false }, 
                    tooltip: { enabled: true }
                },
                scales: {
                    x: {
                        display: true,
                        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });
    }

    updateChart(timestamp, delay, throughput, messageSize) {
        const time = new Date(timestamp).toLocaleTimeString('id-ID', {
            hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        this.addData(this.delayChart, time, delay);
        this.addData(this.throughputChart, time, throughput);
        this.addData(this.msgSizeChart, time, messageSize);
    }

    addData(chart, label, data) {
        if (!chart) return;
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(data);
        if (chart.data.labels.length > this.maxDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        chart.update('none');
    }

    async loadHistory(device) {
        if (!this.delayChart) return;
        try {
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
                });

                this.delayChart.update();
                this.throughputChart.update();
                this.msgSizeChart.update();
            } else {
                this.clearCharts();
            }
        } catch (error) {
            console.error('❌ Error loading history:', error);
            this.clearCharts();
        }
    }

    pushDataOnly(chart, label, data) {
        if(chart) {
            chart.data.labels.push(label);
            chart.data.datasets[0].data.push(data);
        }
    }

    clearCharts() {
        [this.delayChart, this.throughputChart, this.msgSizeChart].forEach(chart => {
            if (chart) {
                chart.data.labels = [];
                chart.data.datasets[0].data = [];
                chart.update();
            }
        });
    }
}

window.ChartManager = ChartManager;