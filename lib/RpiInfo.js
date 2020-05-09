// homebridge-rpi/lib/RpiInfo.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

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
  4: '4GB'
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

/** Class to decode the CPU info and revision of a Raspberry Pi.
  *
  * The CPU info is in `/proc/cpuinfo`.
  * The revision can be obtained (in hex) from `/proc/cpuinfo`
  * or (in decimal) by issuing `pigs hwver`.
  * @see https://www.raspberrypi.org/documentation/hardware/raspberrypi/revision-codes/README.md
  * @see http://abyz.me.uk/rpi/pigpio/index.html
  * @see https://pinout.xyz
  */
class RpiInfo {
  /** Return the parsed contents of `/proc/cpuinfo`.
    * @return {object|null} - The extracted info
    * or `null` when not running on a Raspberry Pi.
    */
  static async getCpuInfo () {
    if (os.platform() !== 'linux' || os.arch() !== 'arm') {
      throw new Error('localhost: not a Raspberry Pi')
    }
    try {
      const cpuInfo = await fs.readFile('/proc/cpuinfo')
      return RpiInfo.parseCpuInfo(cpuInfo)
    } catch (error) {
      throw new Error('localhost: cannot read /proc/cpuinfo')
    }
  }

  /** Extract serial number and revision info from the contents of
    * `/proc/cpuinfo`.
    * @param {string} cpuInfo - The contents of `/proc/cpuinfo`.
    * @return {object} - The extracted info.
    */
  static parseCpuInfo (cpuInfo) {
    const id = /Serial\s*: ([0-9a-f]{16})/.exec(cpuInfo)[1].toUpperCase()
    const revision = parseInt(/Revision\s*: ([0-9a-f]{6})/.exec(cpuInfo)[1], 16)
    const rpi = RpiInfo.parseRevision(revision)
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
      result.gpioMask = 0xffffffff // 0-31
    } else if (revision >= 16) {
      // Type 3
      result.gpioMask = 0x0ffffffc // 2-27
    } else if (revision >= 4) {
      // Type 2
      result.gpioMask = 0xfbc6cf9c // 2-4, 7-11, 14-15, 17-18, 22-25, 27-31
    } else {
      // Type 1
      result.gpioMask = 0x03e6cf93 // 0-1, 4, 7-11, 14-15, 17-18, 21-25
    }
    result.gpioMaskSerial = (1 << 15) | (1 << 14)

    return result
  }

  /** Get the state of the localhost.
    * @return {object} - The state.
    */
  static async getState () {
    const now = new Date(Math.round(Date.now() / 1000) * 1000)
    return {
      date: now.toISOString(),
      boot: (new Date(now.valueOf() - os.uptime() * 1000)).toISOString(),
      load: Math.round(os.loadavg()[0] * 100) / 100,
      temp: RpiInfo.parseTemp(await RpiInfo.vcgencmd('measure_temp')),
      freq: RpiInfo.parseFreq(await RpiInfo.vcgencmd('measure_clock', 'arm')),
      volt: RpiInfo.parseVolt(await RpiInfo.vcgencmd('measure_volts')),
      throttled: RpiInfo.parseThrottled(await RpiInfo.vcgencmd('get_throttled'))
    }
  }

  /** Parse the state of a remote Pi, as returned by the `vcgencmd` script.
    * @param {string} output - The script output.
    * @return {object} - The parsed state.
    */
  static parseState (output) {
    const state = JSON.parse(output)
    return {
      date: (new Date(state.date)).toISOString(),
      boot: (new Date(RpiInfo.parseBoot(state.boot))).toISOString(),
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
  static async vcgencmd () {
    const a = Array.from(arguments)
    return new Promise((resolve, reject) => {
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