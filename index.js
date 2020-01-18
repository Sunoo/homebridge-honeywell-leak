const fetch = require('node-fetch');
var Accessory, Service, Characteristic;

module.exports = function(homebridge) {
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-honeywell-leak", "honeywellLeak", honeywellLeak, true);
}

function honeywellLeak(log, config, api) {
    this.log = log;
    this.config = config;
    this.accessories = [];

    this.consumer_key = config["consumer_key"];
    this.consumer_secret = config["consumer_secret"];
    this.refresh_token = config["refresh_token"];
    this.hide_temperature = config["hide_temperature"] || false;
    this.hide_humidity = config["hide_humidity"] || false;
    if (config["polling_minutes"] != null) {
        this.interval = parseInt(config["polling_minutes"]) * 60 * 1000;
    } else {
        this.interval = 5 * 60 * 1000;
    }

    if (!this.consumer_key) throw new Error("You must provide a value for consumer_key.");
    if (!this.consumer_secret) throw new Error("You must provide a value for consumer_secret.");
    if (!this.refresh_token) throw new Error("You must provide a value for refresh_token.");

    this.auth_token = Buffer.from(this.consumer_key + ':' + this.consumer_secret).toString('base64');
    this.token_expires = Date.now();

    if (api) {
        this.api = api;
        this.api.on('didFinishLaunching', this.fetchDevices.bind(this));
        this.timer = setInterval(this.fetchDevices.bind(this), this.interval);
    }
}

honeywellLeak.prototype.getAccessToken = function() {
    var now = Date.now();
    if (now > this.token_expires) {
        return fetch('https://api.honeywell.com/oauth2/token', {
                method: 'POST',
                headers: {
                    'Authorization': this.auth_token,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=refresh_token&refresh_token=' + this.refresh_token
            })
            .then(res => {
                if (res.ok) {
                    return res.json();
                } else {
                    throw new Error("ERROR! Unable to retrieve new token: " + res.statusText);
                }
            })
            .then(json => {
                this.access_token = json.access_token;
                this.token_expires = now + json.expires_in * 1000;
                this.log("New access token, expires: " + new Date(this.token_expires));
                return this.access_token;
            });
    } else {
        return new Promise(resolve => {
            resolve(this.access_token);
        });
    }
}

honeywellLeak.prototype.fetchDevices = function() {
    this.log("Fetching current devices and statuses.")

    var newIDs = [];

    this.getAccessToken()
        .then(token => fetch('https://api.honeywell.com/v2/locations?apikey=' + this.consumer_key, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            .then(res => {
                if (res.ok) {
                    return res.json();
                } else {
                    throw new Error("ERROR! Unable to retrieve devices: " + res.statusText);
                }
            })
            .then(json => {
                json.forEach(location => {
                    location.devices.forEach(device => {
                        if (device.deviceClass == "LeakDetector") {
                            this.addUpdateAccessory(device);
                            newIDs.push(device.deviceID);
                        }
                    })

                    var badAccessories = [];
                    this.accessories.forEach(cachedAccessory => {
                        if (!newIDs.includes(cachedAccessory.context.deviceID)) {
                            badAccessories.push(cachedAccessory);
                        }
                    });
                    this.removeAccessories(badAccessories);
                })
            })
        )
        .catch((error) => {
            this.log(error);
            this.token_expires = Date.now();
        });
}

honeywellLeak.prototype.updateState = function(accessory) {
    var fresh = Date.now - Date.parse(accessory.context.time + ".000Z") > 60 * 60 * 1000;
    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Name, accessory.context.userDefinedDeviceName + " " + accessory.context.deviceType)
        .setCharacteristic(Characteristic.Manufacturer, "Honeywell")
        .setCharacteristic(Characteristic.Model, accessory.context.deviceType)
        .setCharacteristic(Characteristic.SerialNumber, accessory.context.deviceID);
    accessory.getService(Service.LeakSensor)
        .setCharacteristic(Characteristic.LeakDetected, accessory.context.waterPresent);
    if (!this.hide_temperature) {
        accessory.getService(Service.TemperatureSensor)
            .setCharacteristic(Characteristic.CurrentTemperature, accessory.context.currentSensorReadings.temperature)
            .setCharacteristic(Characteristic.StatusActive, fresh);
    }
    if (!this.hide_humidity) {
        accessory.getService(Service.HumiditySensor)
            .setCharacteristic(Characteristic.CurrentRelativeHumidity, accessory.context.currentSensorReadings.humidity)
            .setCharacteristic(Characteristic.StatusActive, fresh);
    }
    accessory.getService(Service.BatteryService)
        .setCharacteristic(Characteristic.BatteryLevel, accessory.context.batteryRemaining)
        .setCharacteristic(Characteristic.ChargingState, 2)
        .setCharacteristic(Characteristic.StatusLowBattery, accessory.context.batteryRemaining < 30);

    accessory.updateReachability(!accessory.context.isDeviceOffline);
}

honeywellLeak.prototype.configureAccessory = function(accessory) {
    accessory.on('identify', function(paired, callback) {
        platform.log(accessory.displayName, "identify requested!");
        callback();
    });
    accessory.removeService(Service.HumiditySensor);

    var temp = accessory.getService(Service.TemperatureSensor);
    if (temp && this.hide_temperature) {
        accessory.removeService(temp);
    } else if (!temp && !this.hide_temperature) {
        accessory.addService(Service.TemperatureSensor, "Temperature");
    }

    var hum = accessory.getService(Service.HumiditySensor);
    if (hum && this.hide_humidity) {
        accessory.removeService(hum);
    } else if (!hum && !this.hide_humidity) {
        accessory.addService(Service.HumiditySensor, "Humidity");
    }

    this.updateState(accessory);

    this.accessories.push(accessory);
}

honeywellLeak.prototype.addUpdateAccessory = function(device) {
    var accessory;
    this.accessories.forEach(cachedAccessory => {
        if (cachedAccessory.context.deviceID == device.deviceID) {
            accessory = cachedAccessory;
        }
    });

    if (!accessory) {
        accessory = new Accessory(device.userDefinedDeviceName + " " + device.deviceType, device.deviceID);

        accessory.context = device;

        accessory.addService(Service.LeakSensor, "Leak Sensor");
        accessory.addService(Service.BatteryService, "Battery");

        this.configureAccessory(accessory);

        this.api.registerPlatformAccessories("homebridge-honeywell-leak", "honeywellLeak", [accessory]);
    } else {
        accessory.context = device;

        this.updateState(accessory);
    }
}

honeywellLeak.prototype.removeAccessories = function(accessories) {
    accessories.forEach(accessory => {
        this.api.unregisterPlatformAccessories("homebridge-honeywell-leak", "honeywellLeak", [accessory]);
        this.accessories.splice(this.accessories.indexOf(accessory), 1);
    });
}