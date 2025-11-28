class MQTTClient {
    constructor(broker, port, id) {
        this.broker = broker; this.port = port; this.id = id || 'web_' + Date.now();
        this.client = null; this.callbacks = {};
    }
    connect(user, pass, ssl) {
        this.client = new Paho.MQTT.Client(this.broker, Number(this.port), this.id);
        this.client.onConnectionLost = (res) => { console.log("Putus:", res); if(this.callbacks.onConnectionLost) this.callbacks.onConnectionLost(res); };
        this.client.onMessageArrived = (msg) => { if(this.callbacks.onMessageArrived) this.callbacks.onMessageArrived(msg); };
        
        // HARDCODE CREDENTIALS AGAR AMAN
        const options = {
            onSuccess: () => { console.log("Connected!"); if(this.callbacks.onConnect) this.callbacks.onConnect(); },
            onFailure: (e) => { console.log("Gagal:", e); },
            userName: "Alkadir", password: "Alkadir123", useSSL: true, keepAliveInterval: 60
        };
        this.client.connect(options);
    }
    subscribe(topic) { if(this.client.isConnected()) this.client.subscribe(topic); }
    publish(topic, msg) { if(this.client.isConnected()) { const m = new Paho.MQTT.Message(msg); m.destinationName = topic; this.client.send(m); }}
    on(evt, cb) { this.callbacks['on' + evt.charAt(0).toUpperCase() + evt.slice(1)] = cb; }
}
window.MQTTClient = MQTTClient;