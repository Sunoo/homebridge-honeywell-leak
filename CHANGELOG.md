# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/)

## [Version 3.0.0](https://github.com/donavanbecker/homebridge-honeywell-leak/compare/v2.2.0...v3.0.0) (2020-09-**)

### Major Changes

- Completely reworked the way that Leak Sensors are discovered.

## [Version 2.2.0](https://github.com/donavanbecker/homebridge-honeywell-leak/compare/v2.1.1...v2.2.0) (2020-08-29)

### Changes

- If device is no longer Alive or Active it will automatically be removed.

## [Version 2.1.1](https://github.com/donavanbecker/homebridge-honeywell-leak/compare/v2.1.0...v2.1.1) (2020-08-28)

### Changes

- Fixed issue with hiding Leak Sensor, which could cause errors.

## [Version 2.1.0](https://github.com/donavanbecker/homebridge-honeywell-leak/compare/v2.0.1...v2.1.0) (2020-08-24)

### Changes

- Made Battery Service the main service so that there is an option to hide the leak sensor.
- Added option to hide Leak Sensor.
- Update dependencies.

## [Version 2.0.1](https://github.com/donavanbecker/homebridge-honeywell-leak/compare/v2.0.0...v2.0.1) (2020-08-18)

### Changes

- Fixed issue where config wasn't working for `hide_temperature` and `hide_humidity`.

## [Version 2.0.0](https://github.com/donavanbecker/homebridge-honeywell-leak/compare/v1.1.0...v2.0.0) (2020-08-17)

# IMPORTANT

### Major Changes

- Remapped Plugin layout.
- the config layout of `consumer_key`, `consumer_secret`, `refresh_token`, `polling_minutes`, `hide_temperature`, and `hide_humidity` have all changed.
- ## After updating to `v2.0.0` you must Re-Link your Honeywell Home Developer and Honeywell Home Account. Easiest way is with [Config UI X](https://github.com/oznu/homebridge-config-ui-x)

### Other Changes

- Fixed the Issue of refresh tokens expiring.

## [Version 1.1.0](https://github.com/donavanbecker/homebridge-honeywell-leak/compare/v1.0.0...v1.1.0) (2020-07-26)

### Changes

- Converted plugin to TypeScript
