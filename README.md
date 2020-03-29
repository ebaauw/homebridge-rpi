<p align="center">
  <img src="homebridge-rpi.png" height="200px">  
</p>
<span align="center">

# Homebridge RPi
[![Downloads](https://img.shields.io/npm/dt/homebridge-rpi.svg)](https://www.npmjs.com/package/homebridge-rpi)
[![Version](https://img.shields.io/npm/v/homebridge-rpi.svg)](https://www.npmjs.com/package/homebridge-rpi)
[![Homebridge Discord](https://img.shields.io/discord/432663330281226270?color=728ED5&logo=discord&label=discord)](https://discord.gg/yGvADWt)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

[![GitHub issues](https://img.shields.io/github/issues/ebaauw/homebridge-rpi)](https://github.com/ebaauw/homebridge-rpi/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/ebaauw/homebridge-rpi)](https://github.com/ebaauw/homebridge-rpi/pulls)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

</span>

## Homebridge plugin for Raspberry Pi
Copyright © 2019-2020 Erik Baauw. All rights reserved.

This [Homebridge](https://github.com/homebridge/homebridge) plugin exposes a
Raspberry Pi and its GPIO-connected devices to HomeKit.
It provides the following features:
- Monitoring from HomeKit of the RPi's CPU: temperature, frequency, voltage,
and throttling, incl. [Eve](https://www.evehome.com/en/eve-app) history for
the temperature;
- Monitoring and controlling from HomeKit of input devices
connected to the RPi's GPIO pins:
  - Buttons;
  - Contact sensors (incl. Eve history);
- Monitoring and controlling from HomeKit output devices
connect to the RPi's GPIO pins:
  - Relays, LEDs, Fans, etc, exposed as _Switch_ (incl. Eve history);
  - Servo motors, exposed as _Switch_, with _Current Tilt Angle_ and
_Target Tilt Angle_;
- Monitoring and controlling from HomeKit of multi-coloured LEDs of a Pimoroni
[Blinkt!](https://shop.pimoroni.com/products/blinkt) or
[Fan SHIM](https://shop.pimoroni.com/products/fan-shim), installed in the Pi.

Unlike most other Raspberry Pi plugins, Homebridge RPi runs on any regular
Homebridge setup, connecting to the Pi's `pigpiod` daemon over the network.
In particular, Homebridge RPi:
- Exposes multiple Raspberry Pi computers from one Homebridge instance;
- Does _not_ need to run on a Raspberry Pi;
- Does _not_ require any C components;
- Does _not_ require `root` privilege.

### Work in Progress
Note that this plugin is still under development.
Todo:
- Configurable timeout settings for debouncing input,
button double press and long press;
- More robust handling of connection errors to missing RPis;
- Support PWM devices (e.g. dimmable LEDs);
- Support NeoPixel LEDs.

Sometimes, Homebridge RPi doesn't properly close the `pigpiod` file
handles.
This can result in an `FO (104): error no handle available (-24)` error.
Use `rpi -H xx.xx.xx.xx closeHandles` to force-close the stale handles.

### Prerequisites
Homebridge RPi connects (locally or remotely) to the
[`pigpiod`](http://abyz.me.uk/rpi/pigpio/pigpiod.html) daemon
on the Raspberry Pi.
It uses the [Socket Interface](http://abyz.me.uk/rpi/pigpio/sif.html),
just as the [`pigs`](http://abyz.me.uk/rpi/pigpio/pigs.html) command.
This daemon is part of the [`pigpio`](https://github.com/joan2937/pigpio)
library, which is included in Raspbian.
While this daemon comes with Raspbian, it needs to be enabled and
configured for use by Homebridge RPi, see [**Installation**](#installation).  
If you run Homebridge in a container on the Raspberry Pi, let
Homebridge RPi connect to `pigpiod` running on the host.
Do _not_ try to run `pigpiod` in the container.

You need a server to run Homebridge.
This can be anything running [Node.js](https://nodejs.org): from a Raspberry Pi, a NAS system, or an always-on PC running Linux, macOS, or Windows.
See the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for details.
I run Homebridge RPi on a Raspberry Pi 3B.

To interact with HomeKit, you need Siri or a HomeKit app on an iPhone, Apple Watch, iPad, iPod Touch, or Apple TV (4th generation or later).
I recommend to use the latest released versions of iOS, watchOS, and tvOS.  
Please note that Siri and even Apple's [Home](https://support.apple.com/en-us/HT204893) app still provide only limited HomeKit support.
To use the full features of Homebridge RPi, you might want to check out some other HomeKit apps, like the [Eve](https://www.evehome.com/en/eve-app) app (free) or Matthias Hochgatterer's [Home+](https://hochgatterer.me/home/) app (paid).

As HomeKit uses Bonjour to discover Homebridge, the server running Homebridge must be on the same subnet as your iDevices running HomeKit.
For remote access and for HomeKit automations, you need to setup an Apple TV (4th generation or later), HomePod, or iPad as [home hub](https://support.apple.com/en-us/HT207057).

### Command-Line Tool
Homebridge RPi includes a command-line tool, `rpi`,
to interact with the `pigpiod` daemon from the command line.
It takes a `-h` or `--help` argument to provide a brief overview of
its functionality and command-line arguments.

### Installation
To install Homebridge RPi:
- Follow the instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) to install Node.js and Homebridge;
- Install the Homebridge RPi plugin through Homebridge Config UI X or manually by:
  ```
  $ sudo npm -g i homebridge-rpi
  ```
- Edit `config.json` and add the `RPi` platform provided by Homebridge RPi, see [**Homebridge Configuration**](#homebridge-configuration).

### Homebridge Configuration
The configuration for Homebridge RPi can become rather complex, with nested
arrays of objects.
Make sure to use a JSON linter/beautifier when editing config.json.
Alternatively, edit the configuration using the Homebridge RPi settings in
Homebridge Config UI X.

In homebridge's config.json you need to specify Homebridge RPi
as a platform plugin:
```json
"platforms": [
  {
    "platform": "RPi"
  }
]
```
With this simple setup, Homebridge RPi exposes the Raspberry Pi that it runs on,
connecting to the `pigpiod` daemon over `localhost`.
Note that you still need to configure the RPi for Homebridge RPi to work,
see [**Raspberry Pi Configuration**](#raspberry-pi-configuration) below.

To expose other or multiple RPis, specify a `hosts` array:
```json
"platforms": [
  {
    "platform": "RPi",
    "hosts": [
      {
        "host": "pi1"
      },
      {
        "host": "192.168.1.11",
        "name": "pi2"
      }
    ]
  }
]
```

To expose devices connected to a GPIO pin, specify a `devices` array per host:
```json
      {
        "host": "pi1",
        "devices": [
          {
            "device": "blinkt",
            "name": "FanShim LED",
            "gpioClock": 14,
            "gpioData": 15,
            "nLeds": 1
          }
          {
            "device": "button",
            "name": "FanShim Button",
            "gpio": 17
          },
          {
            "device": "switch",
            "name": "FanShim Fan",
            "gpio": 18
          }
        ]
      }
```
This can also be abbreviated
```json
      {
        "host": "pi1",
        "devices": [
          {
            "device": "fanshim"
          }
        ]
      }
```
See the [WiKi](https://github.com/ebaauw/homebridge-rpi/wiki/Supported-Devices)
for details about supported devices and the configuration options per device.

### Raspberry Pi Configuration
Note that you need to execute the following steps on each of the Raspberry Pi
computers you want Homebridge RPi to expose.

#### Configure `pigpiod` Service
Raspbian comes with a service definition for `pigpiod`, in
`/lib/systemd/system/pigpiod.service`.
By default `pigpiod` won't accept remote connections, due to the `-l` option.
To enable remote connections, run `sudo raspi-config` and set _Remote GPIO_ (P8)
under _Interfacing Options_ (5).
This will create a drop-in configuration in
`/etc/systemd/system/pigpiod.service.d/public.conf`, removing the `-l` option.
After that, reload the daemon by:
```
$ sudo systemctl daemon-reload
```

#### Enable `pigpiod` Service
To enable `pigpiod` as a service, issue:
```
$ sudo systemctl enable pigpiod
```
And to start it, issue:
```
$ sudo systemctl start pigpiod
```
To check that the service is running, issue:
```
$ pigs hwver
10494163
```
This returns the Pi's hardware revision (in decimal).

To check that the service is accepting remote connections, run `pigs` on
another Raspberry Pi:
```
$ PIGPIO_ADDR=xx.xx.xx.xx pigs hwver
10494163
```
substituting `xx.xx.xx.xx` with the IP address of the remote Raspberry Pi.

#### Install `vcgencmd` Script
`pigpio` provides a hook to execute a shell command remotely.
Homebridge RPi uses this hook to run a little shell script,
[`vcgencmd`](./opt/pigpio/cgi/vcgencmd), that calls `vcgencmd` to get the
Pi's CPU temperature, frequency, voltage, and throttling information.
This script needs to be installed to `/opt/pigio/cgi` by:
```
$ sudo sh -c 'cat > /opt/pigpio/cgi/vcgencmd' <<'+'
#!/bin/bash
# homebridge-rpi/opt/pigpio/cgi/vcgencmd
# Copyright © 2019-2020 Erik Baauw.  All rights reserved.
#
# Homebridge plugin for Raspberry Pi.

umask 022
exec 2> /opt/pigpio/vcgencmd.err
exec > /opt/pigpio/vcgencmd.out

echo -n "{"
echo -n "\"date\":\"$(date -uIseconds)\","
echo -n "\"load\":$(uptime | sed -e "s/.*load average: \([0-9]*\)[.,]\([0-9]*\),.*/\1.\2/"),"
echo -n "\"temp\":$(vcgencmd measure_temp | sed -e "s/temp=\(.*\)'C/\1/"),"
echo -n "\"freq\":$(vcgencmd measure_clock arm | cut -f 2 -d =),"
echo -n "\"volt\":$(vcgencmd measure_volts | sed -e "s/volt=\(.*\)V/\1/"),"
echo -n "\"throttled\":\"$(vcgencmd get_throttled | cut -f 2 -d =)\""
echo -n "}"
+
```
Next, make the script executable by:
```
$ sudo chmod 755 /opt/pigpio/cgi/vcgencmd
```
To check that the script has been installed correctly, issue:
```
$ pigs shell vcgencmd
0
```
The return status `0` indicates success.
This should have created two output files in `/opt/pigpio`:
```
$ ls -l /opt/pigpio
total 12
-rw-r--r-- 1 root root  152 Aug 19 11:51 access
drwxr-xr-x 2 root root 4096 Aug 19 11:53 cgi
-rw-r--r-- 1 root root    0 Aug 19 11:53 vcgencmd.err
-rw-r--r-- 1 root root  114 Aug 19 11:53 vcgencmd.out
```
The `.err` file should be empty.
The `.out` file contains the script's output in JSON:
```
$ json /opt/pigpio/vcgencmd.out
{
  "date": "2019-08-19T09:53:54+00:00",
  "load": 0.23,
  "temp": 42.9,
  "freq": 1400000000,
  "volt": 1.3688,
  "throttled": "0x80000"
}
```

#### File Access
`pigpio` provides a hook to access files remotely.
Homebridge RPi uses this hook to get the Raspberry Pi's serial number from
`/proc/cpuinfo` and to get the output from the `vcgencmd` script.
These files need to be whitelisted, in `/opt/pigpio/access`:
```
$ sudo sh -c 'cat - > /opt/pigpio/access' <<+
/proc/cpuinfo r
/opt/pigpio/vcgencmd.out r
+
```
To check that the files can be read, issue `fo` to open the file for reading:
```
$ pigs fo /opt/pigpio/vcgencmd.out 1
0
```
Note the returned file descriptor, in this case `0`.

Next issue `fr` to read up to 1024 bytes from the file descriptor, `0`, and print them as ascii:
```
$ pigs -a fr 0 1024
114 {"date":"2019-08-19T09:53:54+00:00","load":0.23,"temp":42.9,"freq":1400000000,"volt":1.3688,"throttled":"0x80000"}
```
Lastly, make sure to close the file and free the file descriptor, `0`.
```
$ pigs fc 0
```
### Troubleshooting

#### Check Dependencies
If you run into Homebridge startup issues, please double-check what versions of Node.js and of Homebridge have been installed.
Homebridge RPi has been developed and tested using the [latest LTS](https://nodejs.org/en/about/releases/) version of Node.js and the [latest](https://www.npmjs.com/package/homebridge) version of Homebridge.
Other versions might or might not work - I simply don't have the bandwidth to test these.

#### Run Homebridge RPi Solo
If you run into Homebridge startup issues, please run a separate instance of Homebridge with only Homebridge RPi (and Homebridge Config UI X) enabled in `config.json`.
This way, you can determine whether the issue is related to Homebridge RPi itself, or to the interaction of multiple Homebridge plugins in your setup.
You can start this separate instance of Homebridge on a different system, as a different user, or from a different user directory (specified by the `-U` flag).
Make sure to use a different Homebridge `name`, `username`, and (if running on the same system) `port` in the `config.json` for each instance.

#### Debug Log File
Homebridge RPi outputs an info message for each HomeKit characteristic value it sets and for each HomeKit characteristic value change notification it receives.
When Homebridge is started with `-D`, Homebridge RPi outputs a debug message for each request it makes to `pigpiod` to change the GPIO pin status.

To capture these messages into a log file do the following:
- If you're running Homebridge as a service, stop that service;
- Run Homebridge manually, capturing the output into a file, by issuing:
  ```
  $ homebridge -CD 2>&1 | tee homebridge.log
  ```
- Interact with your devices, through their native app and or through HomeKit to trigger the issue;
- Hit interrupt (ctrl-C) to stop Homebridge;
- If you're running Homebridge as a service, restart the service;
- Compress the log file by issuing:
  ```
  $ gzip homebridge.log
  ```

#### Getting Help
If you have a question, please post a message to the **#rpi** channel of the Homebridge community on [Discord](https://discord.gg/yGvADWt).

If you encounter a problem, please open an issue on [GitHub](https://github.com/ebaauw/homebridge-rpi/issues).
Please **attach** a copy of `homebridge.log.gz` to the issue, see [**Debug Log File**](#debug-log-file).
Please do **not** copy/paste large amounts of log output.

### Caveats
Homebridge RPi is a hobby project of mine, provided as-is, with no warranty whatsoever.  I've been running it successfully at my home for months, but your mileage might vary.

The HomeKit terminology needs some getting used to.
An _accessory_ more or less corresponds to a physical device, accessible from your iOS device over WiFi or Bluetooth.
A _bridge_ (like Homebridge) is an accessory that provides access to other, bridged, accessories.
An accessory might provide multiple _services_.
Each service corresponds to a virtual device (like a lightbulb, switch, motion sensor, ..., but also: a programmable switch button, accessory information, battery status).
Siri interacts with services, not with accessories.
A service contains one or more _characteristics_.
A characteristic is like a service attribute, which might be read or written by HomeKit apps.
You might want to checkout Apple's [HomeKit Accessory Simulator](https://developer.apple.com/documentation/homekit/testing_your_app_with_the_homekit_accessory_simulator), which is distributed as an additional tool for `Xcode`.
