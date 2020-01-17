const fetch = require('node-fetch');
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    // For platform plugin to be considered as dynamic platform plugin,
    // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
    homebridge.registerPlatform("homebridge-honeywellLeak", "honeywellLeak", honeywellLeak, true);
}

// Platform constructor
// config may be null
// api may be null if launched from old homebridge version
function honeywellLeak(log, config, api) {
    var platform = this;
    this.log = log;
    this.config = config;
    this.accessories = [];

    /*this.requestServer = http.createServer(function(request, response) {
      if (request.url === "/add") {
        this.addAccessory(new Date().toISOString());
        response.writeHead(204);
        response.end();
      }

      if (request.url == "/reachability") {
        this.updateAccessoriesReachability();
        response.writeHead(204);
        response.end();
      }

      if (request.url == "/remove") {
        this.removeAccessory();
        response.writeHead(204);
        response.end();
      }
    }.bind(this));

    this.requestServer.listen(18081, function() {
      platform.log("Server Listening...");
    });*/

    if (api) {
        // Save the API object as plugin needs to register new accessory via this object
        this.api = api;

        // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
        // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
        // Or start discover new accessories.
        this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
    }
}

honeywellLeak.prototype.didFinishLaunching = function(accessory) {
    var platform = this;

    //TODO: Only refresh access token when expiring, only query Honeywell API every 5 minutes else return cached data

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
                //platform.log(JSON.stringify(json, null, 2));
                json.forEach(function(location) {
                    location.devices.forEach(function(device) {
                        if (device.deviceClass == "LeakDetector") {
                            //platform.log(JSON.stringify(device, null, 2));
                            //LeakSensor, TemperatureSensor, HumidtySensor, BatteryService
                            platform.log("UUID: " + device.deviceID);
                            platform.log("Name: " + device.userDefinedDeviceName + " " + device.deviceType);
                            platform.log("LeakDetected: " + device.waterPresent);
                            platform.log("CurrentTemperature: " + device.currentSensorReadings.temperature);
                            platform.log("CurrentRelativeHumidity: " + device.currentSensorReadings.humidity);
                            platform.log("BatteryLevel: " + device.batteryRemaining);
                            platform.log("StatusLowBattery: " + (device.batteryRemaining < 30));
                            platform.log("ChargingState: " + "NOT_CHARGEABLE");
                            platform.log("Reachable: " + !device.isDeviceOffline);
                        }
                    })
                })
            })
        );
}

// Function invoked when homebridge tries to restore cached accessory.
// Developer can configure accessory at here (like setup event handler).
// Update current value.
honeywellLeak.prototype.configureAccessory = function(accessory) {
    var platform = this;

    // Set the accessory to reachable if plugin can currently process the accessory,
    // otherwise set to false and update the reachability later by invoking 
    // accessory.updateReachability()
    accessory.reachable = true;

    accessory.on('identify', function(paired, callback) {
        platform.log(accessory.displayName, "Identify!!!");
        callback();
    });

    /*if (accessory.getService(Service.Lightbulb)) {
      accessory.getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.On)
      .on('set', function(value, callback) {
        platform.log(accessory.displayName, "Light -> " + value);
        callback();
      });
    }*/

    this.accessories.push(accessory);
}

// Sample function to show how developer can add accessory dynamically from outside event
honeywellLeak.prototype.addAccessory = function(accessoryName) {
    this.log("Add Accessory");
    var platform = this;
    var uuid;

    uuid = UUIDGen.generate(accessoryName);

    var newAccessory = new Accessory(accessoryName, uuid);
    newAccessory.on('identify', function(paired, callback) {
        platform.log(newAccessory.displayName, "Identify!!!");
        callback();
    });
    // Plugin can save context on accessory to help restore accessory in configureAccessory()
    // newAccessory.context.something = "Something"

    // Make sure you provided a name for service, otherwise it may not visible in some HomeKit apps
    newAccessory.addService(Service.Lightbulb, "Test Light")
        .getCharacteristic(Characteristic.On)
        .on('set', function(value, callback) {
            platform.log(newAccessory.displayName, "Light -> " + value);
            callback();
        });

    this.accessories.push(newAccessory);
    this.api.registerPlatformAccessories("homebridge-honeywellLeak", "honeywellLeak", [newAccessory]);
}

honeywellLeak.prototype.updateAccessoriesReachability = function() {
    this.log("Update Reachability");
    for (var index in this.accessories) {
        var accessory = this.accessories[index];
        accessory.updateReachability(false);
    }
}

// Sample function to show how developer can remove accessory dynamically from outside event
honeywellLeak.prototype.removeAccessory = function() {
    this.log("Remove Accessory");
    this.api.unregisterPlatformAccessories("homebridge-honeywellLeak", "honeywellLeak", this.accessories);

    this.accessories = [];
}