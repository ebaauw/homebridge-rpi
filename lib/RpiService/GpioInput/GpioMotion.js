// homebridge-rpi/lib/RpiService/GpioInput/GpioMotion.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioInput = require('./index.js')

class GpioMotion extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.MotionSensor
    super(gpioAccessory, params)

    this.addCharacteristicDelegate({
      key: 'motion',
      Characteristic: this.Characteristics.hap.MotionDetected
    })
    this.addCharacteristicDelegate({
      key: 'lastActivation',
      Characteristic: this.Characteristics.eve.LastActivation
      // silent: true
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })

    this.on('gpio', (value) => {
      this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
      if (params.reversed) {
        value = !value
      }
      this.values.motion = !value
    })
  }
}

module.exports = GpioMotion
