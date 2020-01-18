const fetch = require('node-fetch');
var Accessory, Service, Characteristic;

module.exports = function(homebridge) {
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-honeywell-leak", "honeywellLeak", honeywellLeak, true);
}

function honeywellLeak(log, config, api) {
    var platform = this;
    this.log = log;
    this.config = config;
    this.accessories = [];

    if (api) {
        this.api = api;
        this.api.on('didFinishLaunching', this.fetchDevices.bind(this));
    }
}

honeywellLeak.prototype.fetchDevices = function() {
    var platform = this;

    //TODO: Only refresh access token when expiring, query Honeywell API every 5 minutes

    var auth = Buffer.from(this.config.consumer_key + ':' + this.config.consumer_secret).toString('base64');

    fetch('https://api.honeywell.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': auth,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=refresh_token&refresh_token=' + this.config.refresh_token
        })
        .then(res => res.json())
        .then(json => json.access_token)
        .then(token => fetch('https://api.honeywell.com/v2/locations?apikey=' + this.config.consumer_key, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            .then(res => res.json())
            .then(function(json) {
                json.forEach(function(location) {
                    location.devices.forEach(function(device) {
                        if (device.deviceClass == "LeakDetector") {
                            platform.addUpdateAccessory(device);
                        }
                    })
                })
            })
        );
}

honeywellLeak.prototype.updateState = function(accessory) {
    accessory.getService(Service.LeakSensor)
        .setCharacteristic(Characteristic.LeakDetected, accessory.context.waterPresent);
    accessory.getService(Service.TemperatureSensor)
        .setCharacteristic(Characteristic.CurrentTemperature, accessory.context.currentSensorReadings.temperature)
        .setCharacteristic(Characteristic.StatusActive, false);
    accessory.getService(Service.HumiditySensor)
        .setCharacteristic(Characteristic.CurrentRelativeHumidity, accessory.context.currentSensorReadings.humidity)
        .setCharacteristic(Characteristic.StatusActive, false);
    accessory.getService(Service.BatteryService)
        .setCharacteristic(Characteristic.BatteryLevel, accessory.context.batteryRemaining)
        .setCharacteristic(Characteristic.ChargingState, 2)
        .setCharacteristic(Characteristic.StatusLowBattery, accessory.context.batteryRemaining < 30);

    accessory.updateReachability(!accessory.context.isDeviceOffline);
}

honeywellLeak.prototype.configureAccessory = function(accessory) {
    var platform = this;

    accessory.on('identify', function(paired, callback) {
        platform.log(accessory.displayName, "identify requested!");
        callback();
    });

    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "Honeywell")
        .setCharacteristic(Characteristic.Model, accessory.context.deviceType)
        .setCharacteristic(Characteristic.SerialNumber, accessory.context.deviceID);

    this.updateState(accessory);

    this.accessories.push(accessory);
}

honeywellLeak.prototype.addUpdateAccessory = function(device) {
    var platform = this;

    var accessory = null;
    this.accessories.forEach(existingDevice => {
        if (existingDevice.context.deviceID == device.deviceID) {
            accessory = existingDevice;
        }
    });

    if (!accessory) {
        accessory = new Accessory(device.userDefinedDeviceName + " " + device.deviceType, device.deviceID);

        accessory.context = device;

        accessory.addService(Service.LeakSensor, "Leak Sensor");
        accessory.addService(Service.TemperatureSensor, "Temperature");
        accessory.addService(Service.HumiditySensor, "Humidity");
        accessory.addService(Service.BatteryService, "Battery");

        this.configureAccessory(accessory);

        this.api.registerPlatformAccessories("homebridge-honeywell-leak", "honeywellLeak", [newAccessory]);
    } else {
        this.updateState(accessory);
    }
}

honeywellLeak.prototype.removeAccessory = function(accessory) {
    this.api.unregisterPlatformAccessories("homebridge-honeywell-leak", "honeywellLeak", [accessory]);

    this.accessories = [];
}