// homebridge-rpi/lib/RpiService/GpioInput/GpioSmoke.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioInput = require('./index.js')

class GpioSmoke extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.SmokeSensor
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'smokeDetected',
      Characteristic: this.Characteristics.hap.SmokeDetected
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
      this.values.smokeDetected = value
        ? this.Characteristics.hap.SmokeDetected.SMOKE_NOT_DETECTED
        : this.Characteristics.hap.SmokeDetected.SMOKE_DETECTED
    })
  }
}

module.exports = GpioSmoke
