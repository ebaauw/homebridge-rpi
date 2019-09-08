// homebridge-rpi/lib/RpiRevision.js
// Copyright © 2019 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

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

/** Class to decode the revision of a Raspberry Pi.
  *
  * The revision can be obtained (in hex) from `/proc/cpuinfo`
  * or (in decimal) by issuing `pigs hwver`.
  * @see https://www.raspberrypi.org/documentation/hardware/raspberrypi/revision-codes/README.md
  */
class RpiRevision {
  /** Create a new instance of RpiRevision.
    * @param {int} revision - The revision.
    */
  constructor (revision) {
    if ((revision & 0x00800000) !== 0) { // New revision scheme.
      this._manufacturer = manufacturers[(revision & 0x000f0000) >> 16]
      this._memory = memorySizes[(revision & 0x00700000) >> 20]
      this._model = models[(revision & 0x00000ff0) >> 4]
      this._processor = processors[(revision & 0x0000f000) >> 12]
      this._revision = '1.' + ((revision & 0x0000000f) >> 0).toString()
    } else if (oldRevisions[revision] != null) { // Old incremental revisions.
      this._manufacturer = oldRevisions[revision].manufacturer
      this._memory = oldRevisions[revision].memory
      this._model = oldRevisions[revision].model
      this._processor = 'BCM2835'
      this._revision = oldRevisions[revision].revision
    }

    if (
      this._manufacturer == null || this._memory == null ||
      this._model == null || this._processor == null || this._revision == null
    ) {
      const rev = ('00000000' + revision.toString(16)).slice(-8).toUpperCase()
      throw new RangeError(`0x${rev}: unknown revision`)
    }

    if (this._model.startsWith('CM')) {
      // Compute module
      this._gpioMask = 0xffffffff // 0-31
    } else if (revision >= 16) {
      // Type 3
      this._gpioMask = 0x0ffffffc // 2-27
    } else if (revision >= 4) {
      // Type 2
      this._gpioMask = 0xfbc6cf9c // 2-4, 7-11, 14-15, 17-18, 22-25, 27-31
    } else {
      // Type 1
      this._gpioMask = 0x03e6cf93 // 0-1, 4, 7-11, 14-15, 17-18, 21-25
    }
  }

  /** Bit map of user GPIOs.
    * @type {int}
    * @readonly
    * @see http://abyz.me.uk/rpi/pigpio/index.html
    * @see https://pinout.xyz
    */
  get gpioMask () { return this._gpioMask }

  /** Bit map of GPIOs used by the serial interface.
    * @type {int}
    * @readonly
    * @see http://abyz.me.uk/rpi/pigpio/index.html
    * @see https://pinout.xyz
    */
  get gpioMaskSerial () { return (1 << 15) | (1 << 14) }

  /** Manufacturer.
    * @type {string}
    * @readonly
    */
  get manufacturer () { return this._manufacturer }

  /** Memory size.
    * @type {string}
    * @readonly
    */
  get memory () { return this._memory }

  /** Model.
    * @type {string}
    * @readonly
    */
  get model () { return this._model }

  /** Processor.
    * @type {string}
    * @readonly
    */
  get processor () { return this._processor }

  /** Model Revision.
    * @type {string}
    * @readonly
    */
  get revision () { return this._revision }
}

module.exports = RpiRevision
