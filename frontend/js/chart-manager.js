class ChartManager {
    constructor() {
        console.log('📊 Chart Manager Init');
        this.maxPoints = 20;
        
        // Init 5 Charts
        this.delayChart = this.createChart('delayChart', 'Delay (ms)', '#6366f1');
        this.throughputChart = this.createMiniChart('throughputChart', '#3b82f6');
        this.msgSizeChart = this.createMiniChart('messageSizeChart', '#10b981');
        this.jitterChart = this.createMiniChart('jitterChart', '#f59e0b');
        this.packetLossChart = this.createMiniChart('packetLossChart', '#ef4444');
    }

    createChart(id, label, color) {
        const ctx = document.getElementById(id).getContext('2d');
        const gradient = ctx.createLinearGradient(0,0,0,200);
        gradient.addColorStop(0, color + '40'); // Opacity 0.25
        gradient.addColorStop(1, color + '00'); // Opacity 0

        return new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: label, data: [], borderColor: color, backgroundColor: gradient, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: {display: false} }, scales: { x: {display: false}, y: {grid: {color: '#334155'}} } }
        });
    }

    createMiniChart(id, color) {
        const ctx = document.getElementById(id).getContext('2d');
        return new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ data: [], borderColor: color, borderWidth: 1.5, fill: false, tension: 0.4, pointRadius: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: {display: false} }, scales: { x: {display: false}, y: {display: false} } }
        });
    }

    updateChart(timestamp, delay, throughput, messageSize, jitter, packetLoss) {
        const time = new Date(timestamp).toLocaleTimeString();
        this.pushData(this.delayChart, time, delay);
        this.pushData(this.throughputChart, time, throughput);
        this.pushData(this.msgSizeChart, time, messageSize);
        this.pushData(this.jitterChart, time, jitter);
        this.pushData(this.packetLossChart, time, packetLoss);
    }

    pushData(chart, label, data) {
        if(!chart) return;
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(data);
        if(chart.data.labels.length > this.maxPoints) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        chart.update('none');
    }
}
window.ChartManager = ChartManager;