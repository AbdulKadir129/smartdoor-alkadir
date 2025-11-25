// ========================================
// MQTT CLIENT - UPDATED FOR SSL/TLS
// ========================================

class MQTTClient {
    constructor(brokerUrl, port, clientId) {
        this.brokerUrl = brokerUrl;
        this.port = port;
        // Gunakan Client ID yang unik agar tidak bentrok
        this.clientId = clientId || 'smartdoor_web_' + Math.random().toString(16).substr(2, 8);
        this.client = null;
        this.isConnected = false;
        this.callbacks = {
            onConnect: null,
            onConnectionLost: null,
            onMessageArrived: null
        };
    }

    // Updated connect method with useSSL parameter
    connect(username = '', password = '', useSSL = false) {
        try {
            this.client = new Paho.MQTT.Client(this.brokerUrl, Number(this.port), this.clientId);

            this.client.onConnectionLost = (responseObject) => {
                this.isConnected = false;
                console.error('❌ MQTT Connection Lost:', responseObject.errorMessage);
                if (this.callbacks.onConnectionLost) {
                    this.callbacks.onConnectionLost(responseObject);
                }
            };

            this.client.onMessageArrived = (message) => {
                console.log('📨 MQTT Message:', message.destinationName, message.payloadString);
                if (this.callbacks.onMessageArrived) {
                    this.callbacks.onMessageArrived(message);
                }
            };

            const connectOptions = {
                onSuccess: () => {
                    this.isConnected = true;
                    console.log('✅ MQTT Connected to', this.brokerUrl);
                    if (this.callbacks.onConnect) {
                        this.callbacks.onConnect();
                    }
                },
                onFailure: (error) => {
                    this.isConnected = false;
                    console.error('❌ MQTT Connection Failed:', error.errorMessage);
                    // Deteksi error SSL umum
                    if (useSSL && error.errorMessage.includes("SSL")) {
                        console.error("⚠️ SSL Error: Pastikan menggunakan port 8884 (WSS) dan browser mendukung TLS.");
                    }
                },
                useSSL: useSSL, // PENTING untuk HiveMQ Cloud (Harus TRUE)
                cleanSession: true,
                keepAliveInterval: 60
            };

            // Tambahkan kredensial jika ada
            if (username) {
                connectOptions.userName = username;
                connectOptions.password = password;
            }

            console.log(`🔄 Connecting to ${this.brokerUrl}:${this.port} (SSL: ${useSSL})...`);
            this.client.connect(connectOptions);
        } catch (error) {
            console.error('❌ MQTT Error:', error);
        }
    }

    subscribe(topic, qos = 1) {
        if (this.isConnected && this.client) {
            this.client.subscribe(topic, { qos: qos });
            console.log('📥 Subscribed to:', topic, 'QoS:', qos);
        } else {
            console.error('❌ Cannot subscribe: Not connected');
        }
    }

    publish(topic, payload, qos = 1, retained = false) {
        if (this.isConnected && this.client) {
            const message = new Paho.MQTT.Message(payload);
            message.destinationName = topic;
            message.qos = qos;
            message.retained = retained;
            this.client.send(message);
            console.log('📤 Published to:', topic);
        } else {
            console.error('❌ Cannot publish: Not connected');
        }
    }

    disconnect() {
        if (this.client && this.isConnected) {
            this.client.disconnect();
            this.isConnected = false;
            console.log('🔌 MQTT Disconnected');
        }
    }

    on(event, callback) {
        const eventName = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
        if (this.callbacks.hasOwnProperty(eventName)) {
            this.callbacks[eventName] = callback;
        }
    }
}

window.MQTTClient = MQTTClient;
