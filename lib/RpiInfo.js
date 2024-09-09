// homebridge-rpi/lib/RpiInfo.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { loadavg, uptime } from 'node:os'

const fansPwm = [
  '/sys/devices/platform/cooling_fan/hwmon/hwmon2/pwm1',
  '/sys/devices/platform/cooling_fan/hwmon/hwmon3/pwm1',
  '/sys/devices/platform/cooling_fan/hwmon/hwmon1/pwm1'
]

/** Class to handle information about and state of a Raspberry Pi.
  *
  * For the local Raspberry Pi:
  * - Retrieve the serial number and hardware revision from `/proc/cpuinfo`.
  * - Retrieve the state through spawning `vcgencmd`.
  *
  * For remote Rapsberry Pi computers:
  * - Parse the contents of `/proc/cpuinfo` as returned through PigpioClient.
  * - Parse the state as returned by the `getState` script, called through
  * the PigpioClient.
  *
  * @extends EventEmitter
  * @see https://www.raspberrypi.org/documentation/hardware/raspberrypi/revision-codes/README.md
  * @see http://abyz.me.uk/rpi/pigpio/index.html
  * @see https://pinout.xyz
  */
class RpiInfo extends EventEmitter {
  static get powerLed () { return '/sys/class/leds/PWR/brightness' }
  static get usbOff () { return '/sys/bus/usb/drivers/usb/unbind' }
  static get usbOn () { return '/sys/bus/usb/drivers/usb/bind' }

  /** Get the state of the localhost.
    * @param {boolean} noPowerLed - Don't get the state of the power LED.
    * @param {boolean} noFan - Don't get the speed of the fan.
    * @return {object} - The state.
    */
  async getState (noPowerLed = false, noFan = false) {
    const now = new Date(Math.round(Date.now() / 1000) * 1000)
    return {
      date: now.toISOString(),
      boot: (new Date(now.valueOf() - uptime() * 1000)).toISOString(),
      fan: await this.getFanSpeed(noFan),
      freq: RpiInfo.parseFreq(await this.cmd('vcgencmd', 'measure_clock', 'arm')),
      load: Math.round(loadavg()[0] * 100) / 100,
      powerLed: await this.getPowerLedState(noPowerLed),
      swap: RpiInfo.parseSwap(await this.cmd('swapon', '--show=size,used', '--noheadings', '--bytes')),
      temp: RpiInfo.parseTemp(await this.cmd('vcgencmd', 'measure_temp')),
      throttled: RpiInfo.parseThrottled(await this.cmd('vcgencmd', 'get_throttled')),
      volt: RpiInfo.parseVolt(await this.cmd('vcgencmd', 'measure_volts'))
    }
  }

  /** Get the speed of the fan.
    * @param {boolean} noFan - Don't get the speed of the fan.
    * @return {object} - The fan speed.
    */
  async getFanSpeed (noFan) {
    if (noFan) {
      return null
    }
    if (this.fanPwm === undefined) {
      for (const fanPwm of fansPwm) {
        try {
          this.emit('readFile', fanPwm)
          const pwm = parseInt(await readFile(fanPwm, 'utf8'))
          this.fanPwm = fanPwm
          return pwm
        } catch (error) {}
      }
      this.fanPwm = null
    }
    if (this.fanPwm == null) {
      return null
    }
    this.emit('readFile', this.fanPwm)
    return parseInt(await readFile(this.fanPwm, 'utf8'))
  }

  /** Get the state of the power LED.
    * @param {boolean} noPowerLed - Don't get the state of the power LED.
    * @return {string} - The state: `'0'` for off; `'255'`for on.
    */
  async getPowerLedState (noPowerLed) {
    if (noPowerLed) {
      return null
    }
    this.emit('readFile', RpiInfo.powerLed)
    return parseInt(await readFile(RpiInfo.powerLed, 'utf8'))
  }

  /** Parse the state of a remote Pi, as returned by the `getState` script.
    * @param {string} output - The script output.
    * @return {object} - The parsed state.
    */
  static parseState (output) {
    let state
    try {
      state = JSON.parse(output)
    } catch (error) {
      throw new Error(`invalid state: ${error.message}`)
    }
    return {
      date: (new Date(state.date)).toISOString(),
      boot: (new Date(RpiInfo.parseBoot(state.boot))).toISOString(),
      fan: state.fan === '' ? null : parseInt(state.fan),
      freq: RpiInfo.parseFreq(state.freq),
      load: RpiInfo.parseLoad(state.load),
      powerLed: state.powerLed === '' ? null : parseInt(state.powerLed),
      swap: state.swap == null ? null : RpiInfo.parseSwap(state.swap),
      temp: RpiInfo.parseTemp(state.temp),
      throttled: RpiInfo.parseThrottled(state.throttled),
      volt: RpiInfo.parseVolt(state.volt)
    }
  }

  /** Execute command on the local machine.
    * @param {string} cmd - The command.
    * @param {...string} args - Parameters to the command.
    * @return {string} - The output of the vcgencmd.
    */
  async cmd (cmd, ...args) {
    return new Promise((resolve, reject) => {
      /** Emitted when a command executed.
        * @event RpiInfo#exec
        * @param {string} command - The command.
        */
      this.emit('exec', cmd + ' ' + args.join(' '))
      execFile(cmd, args, null, (error, stdout, stderr) => {
        if (error != null) {
          reject(error)
        }
        resolve(stdout)
      })
    })
  }

  /** Parse the output of `vcgencmd measure_clock arm`.
    * @param {string} freq - The `vcgencmd` output.
    * @return {integer} - The CPU frequency.
    */
  static parseFreq (freq) {
    return parseInt(/frequency\(.*\)=(.*)/.exec(freq)[1])
  }

  /** Parse the output of `uptime`.
    * @param {string} uptime - The `uptime` output.
    * @return {number} - The load average.
    */
  static parseLoad (uptime) {
    const a = /.*load average: ([0-9]*)[.,]([0-9]*),.*/.exec(uptime)
    return parseFloat(a[1] + '.' + a[2])
  }

  /** Parse the output of `swapon --show=size,used --noheadings --bytes`.
    * @param {string} swapon - The `swapon` output.
    * @return {number} - % of swap used.
    */
  static parseSwap (swapon) {
    const a = /([0-9]+) *([0-9]+)/.exec(swapon)
    return a == null ? 0 : parseInt(a[2]) * 100 / parseInt(a[1])
  }

  /** Parse the output of `vcgencmd measure_temp`.
    * @param {string} temp - The `vcgencmd` output.
    * @return {number} - The CPU temperature.
    */
  static parseTemp (temp) {
    return parseFloat(/temp=(.*)'C/.exec(temp)[1])
  }

  /** Parse the output of `vcgencmd get_throttled`.
    * @param {string} freq - The `vcgencmd` output.
    * @return {integer} - The throtted flags.
    */
  static parseThrottled (throttled) {
    return parseInt(/throttled=0x(.*)/.exec(throttled)[1], 16)
  }

  /** Parse the output of `uptime -s`.
    * @param {string} uptime - The `uptime` output.
    * @return {number} - The load average.
    */
  static parseBoot (uptime) {
    const a = /(.*) (.*)/.exec(uptime)
    return a[1] + 'T' + a[2]
  }

  /** Parse the output of `vcgencmd measure_volts`.
    * @param {string} volt - The `vcgencmd` output.
    * @return {number} - The CPU voltage.
    */
  static parseVolt (volt) {
    return parseFloat(/volt=(.*)V/.exec(volt)[1])
  }
}

export { RpiInfo }
