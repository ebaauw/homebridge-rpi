// homebridge-rpi/lib/RpiInfo.js
// Copyright © 2019-2021 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const events = require('events')
const { execFile } = require('child_process')
const fs = require('fs').promises
const os = require('os')

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
class RpiInfo extends events.EventEmitter {
  static get powerLed () { return '/sys/class/leds/led1/brightness' }

  /** Get the state of the localhost.
    * @param {boolean} noPowerLed - Don't get the state of the power LED.
    * @return {object} - The state.
    */
  async getState (noPowerLed = false) {
    const now = new Date(Math.round(Date.now() / 1000) * 1000)
    return {
      date: now.toISOString(),
      boot: (new Date(now.valueOf() - os.uptime() * 1000)).toISOString(),
      powerLed: parseInt(await this.getPowerLedState(noPowerLed)),
      load: Math.round(os.loadavg()[0] * 100) / 100,
      temp: RpiInfo.parseTemp(await this.vcgencmd('measure_temp')),
      freq: RpiInfo.parseFreq(await this.vcgencmd('measure_clock', 'arm')),
      volt: RpiInfo.parseVolt(await this.vcgencmd('measure_volts')),
      throttled: RpiInfo.parseThrottled(await this.vcgencmd('get_throttled'))
    }
  }

  /** Get the state of the power LED.
    * @param {boolean} noPowerLed - Don't get the state of the power LED.
    * @return {string} - The state: `'0'` for off; `'255'`for on.
    */
  async getPowerLedState (noPowerLed) {
    if (!noPowerLed) {
      this.emit('readFile', RpiInfo.powerLed)
      return fs.readFile(RpiInfo.powerLed, 'utf8')
    }
    return '255'
  }

  /** Parse the state of a remote Pi, as returned by the `getState` script.
    * @param {string} output - The script output.
    * @return {object} - The parsed state.
    */
  static parseState (output) {
    const state = JSON.parse(output)
    return {
      date: (new Date(state.date)).toISOString(),
      boot: (new Date(RpiInfo.parseBoot(state.boot))).toISOString(),
      powerLed: parseInt(state.powerLed),
      load: RpiInfo.parseLoad(state.load),
      temp: RpiInfo.parseTemp(state.temp),
      freq: RpiInfo.parseFreq(state.freq),
      volt: RpiInfo.parseVolt(state.volt),
      throttled: RpiInfo.parseThrottled(state.throttled)
    }
  }

  /** Execute `vcgencmd` on the local machine.
    * @param {...string} args - Parameters to vcgencmd.
    * @return {string} - The output of the vcgencmd.
    */
  async vcgencmd (...args) {
    return new Promise((resolve, reject) => {
      /** Emitted when a command executed.
        * @event RpiInfo#exec
        * @param {string} command - The command.
        */
      this.emit('exec', 'vcgencmd ' + args.join(' '))
      execFile('vcgencmd', args, null, (error, stdout, stderr) => {
        if (error != null) {
          reject(error)
        }
        resolve(stdout)
      })
    })
  }

  /** Parse the output of `vcgencmd measure_temp`.
    * @param {string} temp - The `vcgencmd` output.
    * @return {number} - The CPU temperature.
    */
  static parseTemp (temp) {
    return parseFloat(/temp=(.*)'C/.exec(temp)[1])
  }

  /** Parse the output of `vcgencmd measure_clock arm`.
    * @param {string} freq - The `vcgencmd` output.
    * @return {integer} - The CPU frequency.
    */
  static parseFreq (freq) {
    return parseInt(/frequency\(.*\)=(.*)/.exec(freq)[1])
  }

  /** Parse the output of `vcgencmd measure_volts`.
    * @param {string} freq - The `vcgencmd` output.
    * @return {number} - The CPU voltage.
    */
  static parseVolt (volt) {
    return parseFloat(/volt=(.*)V/.exec(volt)[1])
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

  /** Parse the output of `uptime`.
    * @param {string} uptime - The `uptime` output.
    * @return {number} - The load average.
    */
  static parseLoad (uptime) {
    const a = /.*load average: ([0-9]*)[.,]([0-9]*),.*/.exec(uptime)
    return parseFloat(a[1] + '.' + a[2])
  }
}

module.exports = RpiInfo
