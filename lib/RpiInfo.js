// homebridge-rpi/lib/RpiInfo.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const events = require('events')
const exec = require('child_process').execFile
const fs = require('fs').promises
const os = require('os')

const manufacturers = {
  0: 'Sony UK',
  1: 'Egoman',
  2: 'Embest',
  3: 'Sony Japan',
  4: 'Embest',
  5: 'Stadium'
}

const memorySizes = {
  0: '256MB',
  1: '512MB',
  2: '1GB',
  3: '2GB',
  4: '4GB',
  5: '8GB'
}

const models = {
  0: 'A',
  1: 'B',
  2: 'A+',
  3: 'B+',
  4: '2B',
  5: 'Alpha', // early prototype
  6: 'CM1',
  8: '3B',
  9: 'Zero',
  10: 'CM3',
  12: 'Zero W',
  13: '3B+',
  14: '3A+',
  // 15: '', // Internal use only
  16: 'CM3+',
  17: '4B'
}

const processors = {
  0: 'BCM2835',
  1: 'BCM2836',
  2: 'BCM2837',
  3: 'BCM2711'
}

const oldRevisions = {
  2: { model: 'B', revision: '1.0', memory: '256MB', manufacturer: 'Egoman' },
  3: { model: 'B', revision: '1.0', memory: '256MB', manufacturer: 'Egoman' },
  4: { model: 'B', revision: '2.0', memory: '256MB', manufacturer: 'Sony UK' },
  5: { model: 'B', revision: '2.0', memory: '256MB', manufacturer: 'Qisda' },
  6: { model: 'B', revision: '2.0', memory: '256MB', manufacturer: 'Egoman' },
  7: { model: 'A', revision: '2.0', memory: '256MB', manufacturer: 'Egoman' },
  8: { model: 'A', revision: '2.0', memory: '256MB', manufacturer: 'Sony UK' },
  9: { model: 'A', revision: '2.0', memory: '256MB', manufacturer: 'Qisda' },
  13: { model: 'B', revision: '2.0', memory: '512MB', manufacturer: 'Egoman' },
  14: { model: 'B', revision: '2.0', memory: '512MB', manufacturer: 'Sony UK' },
  15: { model: 'B', revision: '2.0', memory: '512MB', manufacturer: 'Egoman' },
  16: { model: 'B+', revision: '1.2', memory: '512MB', manufacturer: 'Sony UK' },
  17: { model: 'CM1', revision: '1.0', memory: '512MB', manufacturer: 'Sony UK' },
  18: { model: 'A+', revision: '1.1', memory: '256MB', manufacturer: 'Sony UK' },
  19: { model: 'B+', revision: '1.2', memory: '512MB', manufacturer: 'Embest' },
  20: { model: 'CM1', revision: '1.0', memory: '512MB', manufacturer: 'Embest' },
  21: { model: 'A+', revision: '1.1', memory: '256MB/512MB', manufacturer: 'Embest' }
}

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

  /** Read `/proc/cpuinfo` and extract the serial number and hardware revision
    * info.
    * @return {object} - The extracted info.
    * @throws `Error` - When not running natively on a Raspberry Pi
    * or when `/proc/cpuinfo` or `/proc/1/sched` cannot be read.
    */
  async getCpuInfo () {
    if (os.platform() !== 'linux' || os.arch() !== 'arm') {
      throw new Error(`${os.arch()} running ${os.platform()}`)
    }
    /** Emitted when a file is read.
      * @event RpiInfo#readFile
      * @param {string} fileName - The filename.
      */
    this.emit('readFile', '/proc/cpuinfo')
    const text = await fs.readFile('/proc/cpuinfo', 'utf8')
    const cpuInfo = RpiInfo.parseCpuInfo(text)
    this.emit('readFile', '/proc/1/sched')
    const sched = await fs.readFile('/proc/1/sched', 'utf8')
    if (!sched.startsWith('systemd (1, #threads: 1)')) {
      throw new Error('running inside a container')
    }
    return cpuInfo
  }

  /** Extract serial number and hardware revision info from the contents of
    * `/proc/cpuinfo`.
    * @param {string} cpuInfo - The contents of `/proc/cpuinfo`.
    * @return {object} - The extracted info.
    */
  static parseCpuInfo (cpuInfo) {
    const id = /Serial\s*: ([0-9a-f]{16})/.exec(cpuInfo)[1].toUpperCase()
    const revision = parseInt(/Revision\s*: ([0-9a-f]{4,})/.exec(cpuInfo)[1], 16)
    const rpi = RpiInfo.parseRevision(revision & 0x00FFFFFF)
    return Object.assign({ id: id }, rpi)
  }

  /** Parse the revision of a Raspberry Pi.
    * @param {int} revision - The revision.
    * @return {object} - The parsed revision.
    */
  static parseRevision (revision) {
    const result = {}
    if ((revision & 0x00800000) !== 0) { // New revision scheme.
      result.manufacturer = manufacturers[(revision & 0x000f0000) >> 16]
      result.memory = memorySizes[(revision & 0x00700000) >> 20]
      result.model = models[(revision & 0x00000ff0) >> 4]
      result.processor = processors[(revision & 0x0000f000) >> 12]
      result.revision = '1.' + ((revision & 0x0000000f) >> 0).toString()
    } else if (oldRevisions[revision] != null) { // Old incremental revisions.
      result.manufacturer = oldRevisions[revision].manufacturer
      result.memory = oldRevisions[revision].memory
      result.model = oldRevisions[revision].model
      result.processor = 'BCM2835'
      result.revision = oldRevisions[revision].revision
    }

    if (
      result.manufacturer == null || result.memory == null ||
      result.model == null || result.processor == null ||
      result.revision == null
    ) {
      const rev = ('00000000' + revision.toString(16)).slice(-8).toUpperCase()
      throw new RangeError(`0x${rev}: unknown revision`)
    }

    if (result.model.startsWith('CM')) {
      // Compute module
      result.gpioMask = 0xFFFFFFFF // 0-31
    } else if (revision >= 16) {
      // Type 3
      result.gpioMask = 0x0FFFFFFC // 2-27
    } else if (revision >= 4) {
      // Type 2
      result.gpioMask = 0xFBC6CF9C // 2-4, 7-11, 14-15, 17-18, 22-25, 27-31
    } else {
      // Type 1
      result.gpioMask = 0x03E6CF93 // 0-1, 4, 7-11, 14-15, 17-18, 21-25
    }
    result.gpioMaskSerial = (1 << 15) | (1 << 14)

    return result
  }

  /** Get the state of the localhost.
    * @return {object} - The state.
    */
  async getState () {
    this.emit('readFile', RpiInfo.powerLed)
    const now = new Date(Math.round(Date.now() / 1000) * 1000)
    return {
      date: now.toISOString(),
      boot: (new Date(now.valueOf() - os.uptime() * 1000)).toISOString(),
      powerLed: await fs.readFile(RpiInfo.powerLed, 'utf8'),
      load: Math.round(os.loadavg()[0] * 100) / 100,
      temp: RpiInfo.parseTemp(await this.vcgencmd('measure_temp')),
      freq: RpiInfo.parseFreq(await this.vcgencmd('measure_clock', 'arm')),
      volt: RpiInfo.parseVolt(await this.vcgencmd('measure_volts')),
      throttled: RpiInfo.parseThrottled(await this.vcgencmd('get_throttled'))
    }
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
  async vcgencmd () {
    return new Promise((resolve, reject) => {
      const a = Array.from(arguments)
      /** Emitted when a command executed.
        * @event RpiInfo#exec
        * @param {string} command - The command.
        * @param {string[]} arguments - The command arguments.
        */
      this.emit('exec', 'vcgencmd', a)
      exec('vcgencmd', a, null, (error, stdout, stderr) => {
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
