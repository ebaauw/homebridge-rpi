// homebridge-rpi/lib/RpiService/GpioInput/GpioMotion.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { GpioInput } from '../GpioInput.js'
import { RpiService } from '../../RpiService.js'

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
      key: 'duration',
      Characteristic: this.Characteristics.eve.Duration,
      unit: 's',
      value: this.Characteristics.eve.Duration.VALID_VALUES[0]
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
    if (this.timer != null) {
      this.debug('cancel timer')
      clearTimeout(this.timer)
      delete this.timer
    }
    if (value) {
      this.debug('set timer for %ds', this.values.duration)
      this.timer = setTimeout(() => {
        delete this.timer
        this.values.motion = false
      }, this.values.duration * 1000)
    } else {
      this.values.motion = true
    }
  }
}

RpiService.GpioMotion = GpioMotion
