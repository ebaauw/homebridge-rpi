// homebridge-rpi/lib/RpiService/GpioInput/GpioRocker.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioInput = require('./index.js')

class GpioRocker extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.StatelessProgrammableSwitch
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
    duration = Math.round(duration / 1000) // µs => ms
    this.debug(
      'gpio %d: rocker flipped to %s after %d ms', this.gpio,
      value ? 'high' : 'low', duration
    )
    this.values.buttonevent =
      this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
  }
}

module.exports = GpioRocker
