// homebridge-rpi/lib/RpiService/GpioInput/GpioCarbonMonoxide.js
// Copyright © 2019-2024 Erik Baauw and Bill Stoddart.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioInput = require('./index.js')

class GpioCarbonMonoxide extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.CarbonMonoxideSensor
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
    this.values.carbonMonoxideDetected = value
      ? this.Characteristics.hap.CarbonMonoxideDetected.CO_LEVELS_NORMAL
      : this.Characteristics.hap.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
  }
}

module.exports = GpioCarbonMonoxide
