// homebridge-rpi/lib/RpiService/GpioInput/GpioLeak.js
// Copyright © 2019-2025 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { GpioInput } from '../GpioInput.js'
import { RpiService } from '../../RpiService.js'

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
  }

  update (value) {
    this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
    if (this.params.reversed) {
      value = !value
    }
    this.values.leak = !value
  }
}

RpiService.GpioLeak = GpioLeak
