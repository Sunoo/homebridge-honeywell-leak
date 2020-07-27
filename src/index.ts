import {
  API,
  APIEvent,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig
} from 'homebridge';
import fetch from 'node-fetch';
import { HoneywellLeakPlatformConfig } from './configTypes';

let hap: HAP;
let Accessory: typeof PlatformAccessory;

const PLUGIN_NAME = 'homebridge-honeywell-leak';
const PLATFORM_NAME = 'honeywellLeak';

class HoneywellLeakPlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;
  private readonly api: API;
  private readonly config: HoneywellLeakPlatformConfig;
  private readonly accessories: Array<PlatformAccessory>;
  private readonly auth_token: string;
  private token_expires: number;
  private access_token?: string;
  private readonly hide_temperature: boolean;
  private readonly hide_humidity: boolean;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.config = config as unknown as HoneywellLeakPlatformConfig;
    this.api = api;
    this.accessories = [];

    this.hide_temperature = config.hide_temperature || false;
    this.hide_humidity = config.hide_humidity || false;

    let interval = 5 * 60 * 1000;
    if (config.polling_minutes != null) {
      interval = parseInt(config['polling_minutes']) * 60 * 1000;
    }

    if (!config.consumer_key) {
      throw new Error('You must provide a value for consumer_key.');
    }
    if (!config.consumer_secret) {
      throw new Error('You must provide a value for consumer_secret.');
    }
    if (!config.refresh_token) {
      throw new Error('You must provide a value for refresh_token.');
    }

    this.auth_token = Buffer.from(config.consumer_key + ':' + config.consumer_secret).toString('base64');
    this.token_expires = Date.now();

    api.on(APIEvent.DID_FINISH_LAUNCHING, this.fetchDevices.bind(this));
    setInterval(this.fetchDevices.bind(this), interval);
  }

  getAccessToken(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const now = Date.now();
    if (now > this.token_expires) {
      return fetch('https://api.honeywell.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Authorization': this.auth_token,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=refresh_token&refresh_token=' + this.config.refresh_token
      })
        .then(res => {
          if (res.ok) {
            return res.json();
          } else {
            throw new Error('ERROR! Unable to retrieve new token: ' + res.statusText);
          }
        })
        .then(json => {
          this.access_token = json.access_token;
          this.token_expires = now + json.expires_in * 1000;
          this.log.debug('New access token, expires: ' + new Date(this.token_expires));
          return this.access_token;
        });
    } else {
      return new Promise(resolve => {
        resolve(this.access_token);
      });
    }
  }

  fetchDevices(): void {
    this.log.debug('Fetching current devices and statuses.');

    const newIDs: Array<string> = [];

    this.getAccessToken()
      .then(token => fetch('https://api.honeywell.com/v2/locations?apikey=' + this.config.consumer_key, {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      })
        .then(res => {
          if (res.ok) {
            return res.json();
          } else {
            throw new Error('ERROR! Unable to retrieve devices: ' + res.statusText);
          }
        })
        .then(json => {
          json.forEach((location: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            location.devices.forEach((device: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              if (device.deviceClass == 'LeakDetector') {
                this.addUpdateAccessory(device);
                newIDs.push(device.deviceID);
              }
            });

            const badAccessories: Array<PlatformAccessory> = [];
            this.accessories.forEach(cachedAccessory => {
              if (!newIDs.includes(cachedAccessory.context.deviceID)) {
                badAccessories.push(cachedAccessory);
              }
            });
            this.removeAccessories(badAccessories);
          });
        })
      )
      .catch((error) => {
        this.log.error(error);
        this.token_expires = Date.now();
      });
  }

  updateState(accessory: PlatformAccessory): void {
    const fresh = Date.now() - Date.parse(accessory.context.time + '.000Z') < 60 * 60 * 1000;
    const accInfo = accessory.getService(hap.Service.AccessoryInformation);
    if (accInfo) {
      accInfo
        .setCharacteristic(hap.Characteristic.Name, accessory.context.userDefinedDeviceName + ' ' + accessory.context.deviceType)
        .setCharacteristic(hap.Characteristic.Manufacturer, 'Honeywell')
        .setCharacteristic(hap.Characteristic.Model, accessory.context.deviceType)
        .setCharacteristic(hap.Characteristic.SerialNumber, accessory.context.deviceID);
    }
    const leak = accessory.getService(hap.Service.LeakSensor);
    if (leak) {
      leak
        .setCharacteristic(hap.Characteristic.LeakDetected, accessory.context.waterPresent)
        .setCharacteristic(hap.Characteristic.StatusActive, true);
    }
    if (!this.hide_temperature) {
      const temperature = accessory.getService(hap.Service.TemperatureSensor);
      if (temperature) {
        temperature
          .setCharacteristic(hap.Characteristic.CurrentTemperature, accessory.context.currentSensorReadings.temperature)
          .setCharacteristic(hap.Characteristic.StatusActive, fresh);
      }
    }
    if (!this.hide_humidity) {
      const humidity = accessory.getService(hap.Service.HumiditySensor);
      if (humidity) {
        humidity
          .setCharacteristic(hap.Characteristic.CurrentRelativeHumidity, accessory.context.currentSensorReadings.humidity)
          .setCharacteristic(hap.Characteristic.StatusActive, fresh);
      }
    }
    const battery = accessory.getService(hap.Service.BatteryService);
    if (battery) {
      battery
        .setCharacteristic(hap.Characteristic.BatteryLevel, accessory.context.batteryRemaining)
        .setCharacteristic(hap.Characteristic.ChargingState, 2)
        .setCharacteristic(hap.Characteristic.StatusLowBattery, accessory.context.batteryRemaining < 30);
    }
  }

  configureAccessory(accessory: PlatformAccessory): void {
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log(accessory.context.config.name + ' identify requested!');
    });

    const temp = accessory.getService(hap.Service.TemperatureSensor);
    if (temp && this.hide_temperature) {
      accessory.removeService(temp);
    } else if (!temp && !this.hide_temperature) {
      accessory.addService(hap.Service.TemperatureSensor, 'Temperature');
    }

    const hum = accessory.getService(hap.Service.HumiditySensor);
    if (hum && this.hide_humidity) {
      accessory.removeService(hum);
    } else if (!hum && !this.hide_humidity) {
      accessory.addService(hap.Service.HumiditySensor, 'Humidity');
    }

    this.updateState(accessory);

    this.accessories.push(accessory);
  }

  addUpdateAccessory(device: any): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    let accessory = this.accessories.find(cachedAccessory => {
      return cachedAccessory.context.deviceID == device.deviceID;
    });

    if (!accessory) {
      accessory = new Accessory(device.userDefinedDeviceName + ' ' + device.deviceType, device.deviceID);

      accessory.context = device;

      accessory.addService(hap.Service.LeakSensor, 'Leak Sensor');
      accessory.addService(hap.Service.BatteryService, 'Battery');

      this.configureAccessory(accessory);

      this.api.registerPlatformAccessories('homebridge-honeywell-leak', 'honeywellLeak', [accessory]);
    } else {
      accessory.context = device;

      this.updateState(accessory);
    }
  }

  removeAccessories(accessories: Array<PlatformAccessory>): void {
    accessories.forEach((accessory: PlatformAccessory) => {
      this.api.unregisterPlatformAccessories('homebridge-honeywell-leak', 'honeywellLeak', [accessory]);
      this.accessories.splice(this.accessories.indexOf(accessory), 1);
    });
  }
}

export = (api: API): void => {
  hap = api.hap;
  Accessory = api.platformAccessory;

  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, HoneywellLeakPlatform);
};