# homebridge-rpi
[![Downloads](https://img.shields.io/npm/dt/homebridge-rpi.svg)](https://www.npmjs.com/package/homebridge-rpi)
[![Version](https://img.shields.io/npm/v/homebridge-rpi.svg)](https://www.npmjs.com/package/homebridge-rpi)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![GitHub issues](https://img.shields.io/github/issues/ebaauw/homebridge-rpi)](https://github.com/ebaauw/homebridge-rpi/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/ebaauw/homebridge-rpi)](https://github.com/ebaauw/homebridge-rpi/pulls)

## Homebridge plugin for Raspberry Pi
Copyright © 2019-2020 Erik Baauw. All rights reserved.

This [Homebridge](https://github.com/nfarina/homebridge) plugin exposes a
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

Unlike most other Raspberry Pi plugins, homebridge-rpi runs on any regular
Homebridge setup, connecting to the Pi's `pigpiod` daemon over the network.
In particular, homebridge-rpi:
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

Sometimes, the homebridge-rpi plugin doesn't properly close the `pigpiod` file
handles.
This can result in an `FO (104): error no handle available (-24)` error.
Use `rpi -H xx.xx.xx.xx closeHandles` to force-close the stale handles.

### Prerequisites
You need a server to run Homebridge.
This can be anything running [Node.js](https://nodejs.org): a Raspberri Pi,
a NAS system, an always-on PC running Linux, macOS, or Windows, or even a
Docker container.
See the [homebridge Wiki](https://github.com/nfarina/homebridge/wiki) for
details.
I use a Raspberri Pi 3B+, and, occasionally a Mac mini server.
Note that I develop and test against the latest LTS release of Node.js.

The homebridge-rpi plugin connects (locally or remotely) to the
[`pigpiod`](http://abyz.me.uk/rpi/pigpio/pigpiod.html) daemon
on the Raspberry Pi.
It uses the [Socket Interface](http://abyz.me.uk/rpi/pigpio/sif.html),
just as the [`pigs`](http://abyz.me.uk/rpi/pigpio/pigs.html) command.
This daemon is part of the [`pigpio`](https://github.com/joan2937/pigpio)
library, which is included in Raspbian.
While this daemon comes with Raspbian, it needs to be enabled and
configured for use by homebridge-rpi, see [**Installation**](#installation).
<br>If you run Homebridge in a container on the Raspberry Pi, let
homebridge-rpi connect to `pigpiod` running on the host.
Do _not_ try to run `pigpiod` in the container.

To interact with HomeKit, you need Siri or a HomeKit app on an iPhone,
Apple Watch, iPad, iPod Touch, or Apple TV (4th generation or later).
I recommend to use the latest (non-beta) version of the OS.
<br>Please note that Siri and even Apple's
[Home](https://support.apple.com/en-us/HT204893) app still provide only limited
HomeKit support.
To use the full features of homebridge-rpi, you might want to check out some
other HomeKit apps,
like [Eve](https://www.evehome.com/en/eve-app) (free) or
[Home 3](https://hochgatterer.me/home/) (paid).
<br>To interact with HomeKit remotely and for HomeKit automations, you need to
setup an Apple TV (4th generation or later), HomePod, or iPad as
[home hub](https://support.apple.com/en-us/HT207057).

### Command-Line Tool
The `homebridge-rpi` plugin comes with a command-line tool, `rpi`,
for interacting with the `pigpiod` daemon.
It takes a `-h` or `--help` argument to provide a brief overview of
its functionality and command-line arguments.

### Installation
To install homebridge-rpi, issue:
```
$ sudo npm -g i homebridge-rpi
```
on the server or container running Homebridge.

### Homebridge Configuration

The configuration for homebridge-rpi can become rather complex, with nested
arrays of objects.
Make sure to use a JSON linter/beautifier when editing config.json.
Alternatively, edit the configuration using
[homebridge-config-ui-x](https://github.com/oznu/homebridge-config-ui-x).

In homebridge's config.json you need to specify homebridge-rpi
as a platform plugin:
```json
"platforms": [
  {
    "platform": "Rpi"
  }
]
```
With this simple setup, homebridge-rpi exposes the Raspberry Pi that it runs on,
connecting to the `pigpiod` daemon over `localhost`.
Note that you still need to configure the RPi for homebridge-rpi to work.

To expose other or multiple RPis, specify a `hosts` array:
```json
"platforms": [
  {
    "platform": "Rpi",
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
computers you want homebridge-rpi to expose.

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
To enable and start `pigpiod` as a service, issue:
```
$ sudo systemctl enable pigpiod
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
homebridge-rpi uses this hook to run a little shell script,
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
$ chmod 755 /opt/pigpio/cgi/vcgencmd
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
$ json vcgencmd.out
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
homebridge-rpi uses this hook to get the Raspberry Pi's serial number from
`/proc/cpuinfo` and to get the output from the `vcgencmd` script.
These files need to be whitelisted, in `/opt/pigpio/access`:
```
$ sudo sh -c 'cat - > /opt/pigpio/access' <<+
/proc/cpuinfo r
/opt/pigpio/vcgencmd.out r
+
```

To check that the files can be read, issue:
```
$ pigs fo /opt/pigpio/vcgencmd.out 1
0
$ pigs -a fr 0 1024
114 {"date":"2019-08-19T09:53:54+00:00","load":0.23,"temp":42.9,"freq":1400000000,"volt":1.3688,"throttled":"0x80000"}
$ pigs fc 0
```
The `fo` command opens the file for reading, returning a file descriptor, `0`
in this example.
This file descriptor is passed to the `fr` and `fc` commands.
The `fr` commands reads up to 1024 bytes from the file,
and prints them as ascii.
The `fc` command closes the file.
