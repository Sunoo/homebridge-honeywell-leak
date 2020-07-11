# homebridge-honeywell-leak
[![npm](https://img.shields.io/npm/v/homebridge-honeywell-leak) ![npm](https://img.shields.io/npm/dt/homebridge-honeywell-leak)](https://www.npmjs.com/package/homebridge-honeywell-leak)

[Honeywell Leak Detector](https://www.honeywellhome.com/en/products/water-alarms/lyric-wi-fi-water-leak-and-freeze-detector) / [Resideo Droplet](https://www.resideo.com/us/en/products/water/spot-leak-detection/wifi-water-leak-freeze-detector-rchw3610wf1001-u/) plugin for [Homebridge](https://github.com/nfarina/homebridge)

# Installation

1. Install Homebridge using the [official instructions](https://github.com/homebridge/homebridge/wiki).
2. Install this plugin using `sudo npm install -g homebridge-honeywell-leak`.
3. Update your configuration file. See sample config.json snippet below.

# Configuration

Configuration sample:

 ```
    "platforms": [
        {
            "platform": "honeywellLeak",
            "consumer_key": "ZSDLrHxcpOWpTknhpm0vZEwTSxJyy0TJ",
            "consumer_secret": "LDKrtgR8CbCVNHfg",
            "refresh_token": "mLDpbntbv8gq4yt9pcPOxASV6VPrrzin",
            "polling_minutes": 5,
            "hide_temperature": false,
            "hide_humidity": false
        }
    ]
```

Fields:

* "platform": Must always be "honeywellLeak" (required)
* "consumer_key": Your OAuth2 consumer key for accessing the Honeywell Home API (required)
* "consumer_secret": Your OAuth2 consumer secret for accessing the Honeywell Home API (required)
* "refresh_token": Your OAuth2 refresh token for accessing the Honeywell Home API (required)
* "polling_minutes": Number of minutes between updates, defaults to 5 minutes, per Honeywell's recommendations (optional)
* "hide_temperature": Hides the temperature sensor (optional)
* "hide_humidity": Hides the humidity sensor (optional)

# Getting OAuth2 Values

The easiest way to get set up for OAuth2 is to use [honeywellhome-api](https://github.com/homebridge-plugins/honeywellhome-api). Just ignore their sample config.json file and use the values that tool gives you with my example above.
