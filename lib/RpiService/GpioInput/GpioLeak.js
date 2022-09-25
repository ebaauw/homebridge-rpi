// homebridge-rpi/lib/RpiService/GpioInput/GpioLeak.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioInput = require('./index.js')

class GpioLeak extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.LeakSensor
    super(gpioAccessory, params)

    this.addCharacteristicDelegate({
      key: 'leak',
      Characteristic: this.Characteristics.hap.LeakDetected
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
      this.values.leak = !value
    })
  }
}

module.exports = GpioLeak
