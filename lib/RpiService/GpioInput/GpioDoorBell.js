// homebridge-rpi/lib/RpiService/GpioInput/GpioDoorBell.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { GpioInput } from '../GpioInput.js'
import { RpiService } from '../../RpiService.js'

class GpioDoorBell extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Doorbell
    params.subtype = params.index
    super(gpioAccessory, params)

    this.addCharacteristicDelegate({
      key: 'buttonevent',
      Characteristic: this.Characteristics.hap.ProgrammableSwitchEvent,
      props: {
        minValue: this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS,
        maxValue: this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
      }
    })
  }

  update (value, duration) {
    if (duration == null) {
      return
    }
    if (this.params.reversed) {
      value = !value
    }
    duration = Math.round(duration / 1000) // µs => ms
    if (value) { // button released
      this.debug('button released after %d ms', duration)
    } else { // button pressed
      this.debug('button pressed after %d ms', duration)
      this.values.buttonevent =
        this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
    }
  }
}

RpiService.GpioDoorBell = GpioDoorBell
