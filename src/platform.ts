/* eslint-disable @typescript-eslint/no-explicit-any */
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { interval } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import * as qs from 'querystring';
import { readFileSync, writeFileSync } from 'fs';

import { PLATFORM_NAME, PLUGIN_NAME, AuthURL, LocationURL, DeviceURL, UIurl } from './settings';
import { LeakSensorPlatformAccessory } from './platformAccessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HoneywellLeakPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public axios: AxiosInstance = axios.create({
    responseType: 'json',
  });

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    // only load if configured
    if (!this.config) {
      return;
    }
      
    // verify the config
    try {
      this.verifyConfig();
      this.log.debug('Config OK');
    } catch (e) {
      this.log.error(e.message);
      return;
    }

    // setup axios interceptor to add headers / api key to each request
    this.axios.interceptors.request.use((request) => {
      request.headers.Authorization = 'Bearer ' + this.config.access_token;
      request.params = request.params || {};
      request.params.apikey = this.config.consumer_key;
      request.headers['Content-Type'] = 'application/json';
      return request;
    });

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      try {
        await this.discoverDevices();
      } catch (e) {
        this.log.error('Failed to refresh access token.', e.message);
      }

      interval((1800 / 3) * 1000).subscribe(async () => {
        try {
          await this.getAccessToken();
        } catch (e) {
          this.log.error('Failed to refresh access token.');
        }
      });
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }
  
  /**
   * Verify the config passed to the plugin is valid
   */
  verifyConfig() {
    this.config.hide_temperature;
    this.config.hide_humidity;
    this.config.polling_minutes = this.config.polling_minutes || 1800; // default 1800 seconds

    if (!this.config.consumer_secret && this.config.polling_minutes < 1800) {
      this.log.debug('TTL must be set to 1800 or higher unless you setup your own consumerSecret.');
      this.config.polling_minutes = 1800;
    }

    if (!this.config.consumer_secret) {
      throw new Error('You must provide a value for consumer_secret.');
    }
    if (!this.config.consumer_key) {
      throw new Error('You must provide a value for consumer_key.');
    }
    if (!this.config.refresh_token) {
      throw new Error('You must provide a value for refresh_token.');
    }
  }

  /**
   * Exchange the refresh token for an access token
   */
  async getAccessToken() {
    let result: any;

    if (this.config.consumer_secret) {
      result = (await axios({
        url: AuthURL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: this.config.consumer_key,
          password: this.config.consumer_secret,
        },
        data: qs.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.config.refresh_token,
        }),
        responseType: 'json',
      })).data;
    } else {
      this.log.warn('Please re-link your account in the Homebridge UI.');
      // if no consumerSecret is defined, attempt to use the shared consumerSecret
      try {
        result = (await axios.post(UIurl, 
          {
            consumerKey: this.config.consumer_key,
            refresh_token: this.config.refresh_token,
          },
        )).data;
      } catch (e) {
        this.log.error('Failed to exchange refresh token for an access token.', e.message);
        throw e;
      }
    }

    this.config.access_token = result.access_token;
    this.log.warn('Got access token:', this.config.access_token);

    // check if the refresh token has changed
    if (result.refresh_token !== this.config.refresh_token) {
      this.log.warn('New refresh token:', result.refresh_token);
      await this.updateRefreshToken(result.refresh_token);
    }
    
    this.config.refresh_token = result.refresh_token;
  }

  /**
   * The refresh token will periodically change.
   * This method saves the updated refresh token in the config.json file
   * @param newRefreshToken 
   */
  async updateRefreshToken(newRefreshToken: string) {
    try {
      // check the new token was provided
      if (!newRefreshToken) {
        throw new Error('New token not provided');
      }

      // load in the current config
      const currentConfig = JSON.parse(readFileSync(this.api.user.configPath(), 'utf8'));

      // check the platforms section is an array before we do array things on it
      if (!Array.isArray(currentConfig.platforms)) {
        throw new Error('Cannot find platforms array in config');
      }

      // find this plugins current config
      const pluginConfig = currentConfig.platforms.find(x => x.platform === PLATFORM_NAME);

      if (!pluginConfig) {
        throw new Error(`Cannot find config for ${PLATFORM_NAME} in platforms array`);
      }

      // check the .credentials is an object before doing object things with it
      if (typeof pluginConfig.credentials !== 'object') {
        throw new Error('pluginConfig.credentials is not an object');
      }

      // set the refresh token
      pluginConfig.refresh_token = newRefreshToken;

      // save the config, ensuring we maintain pretty json
      writeFileSync(this.api.user.configPath(), JSON.stringify(currentConfig, null, 4));

      this.log.warn('Homebridge config.json has been updated with new refresh token.');

    } catch (e) {
      this.log.error(`Failed to update refresh token in config: ${e.message}`);
    }
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    // try and get the access token. If it fails stop here.
    try {
      await this.getAccessToken();
    } catch (e) {
      this.log.error('Could not discover devices.', e.message);
      return;
    }
    
    // get the locations
    const locations = (await this.axios.get(LocationURL)).data;
    
    this.log.info(`# of Locations Found: ${locations.length}.`);

    // get the devices at each location
    for (const location of locations) {
      this.log.info(`Getting devices for ${location.name}...`);

      const locationId = location.locationID;
      this.log.debug(locationId);
      this.log.debug(location);
      this.log.debug(`# of Leak Sensors Found at ${location.name}: ${location.devices.length}.`);  
      // get the devices
      const devices = (await this.axios.get(DeviceURL, {
        params: {
          locationId: location.locationID,
        },
      })).data;
      for (const device of devices) {
        this.log.debug(device);
        this.log.debug(device.deviceID);

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        if (device.isAlive && device.deviceClass === 'LeakDetector') {
          // eslint-disable-next-line max-len
          this.log.debug(`LeakSensor UDID: ${device.name}${device.deviceID}`);
          // eslint-disable-next-line max-len
          const uuid = this.api.hap.uuid.generate(`${device.name}${device.deviceID}`);

          // see if an accessory with the same uuid has already been registered and restored from
          // the cached devices we stored in the `configureAccessory` method above
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

          if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
                    
            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
            existingAccessory.context.firmwareRevision = device.firmwareVer;
            this.api.updatePlatformAccessories([existingAccessory]);

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            new LeakSensorPlatformAccessory(this, existingAccessory, locationId, device);

          } else {
            // the accessory does not yet exist, so we need to create it
            this.log.info('Adding new accessory:', device.name);
            this.log.debug(`Registering new device: ${device.name} - ${device.deviceID}`);

            // create a new accessory
            const accessory = new this.api.platformAccessory(device.name, uuid);

            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.firmwareRevision = device.firmwareVer;

            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new LeakSensorPlatformAccessory(this, accessory, locationId, device);

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
        } else {
          // eslint-disable-next-line max-len
          this.log.info(`Ignoring device named ${device.name} - ${device.deviceID}, Alive Status: ${device.isAlive}`);
        }
      }
    }
  }
}