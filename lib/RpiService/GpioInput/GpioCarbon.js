// homebridge-rpi/lib/RpiService/GpioInput/GpioCarbon.js
// Copyright © 2019-2022 Erik Baauw and Bill Stoddart.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioInput = require('./index.js')

class GpioCarbon extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.CarbonSensor
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'carbonMonoxideDetected',
      Characteristic: this.Characteristics.hap.CarbonMonoxideDetected
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
  }

  update (value) {
    this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
    if (this.params.reversed) {
      value = !value
    }
    this.values.CarbonMonoxideDetected = value
      ? this.Characteristics.hap.CarbonMonoxideDetected.CARBONMONOXIDE_NOT_DETECTED
      : this.Characteristics.hap.CarbonMonoxideDetected.CARBONMONOXIDE_DETECTED
  }
}

module.exports = GpioCarbon
