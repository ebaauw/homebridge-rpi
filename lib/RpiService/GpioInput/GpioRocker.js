// homebridge-rpi/lib/RpiService/GpioInput/GpioRocker.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioInput = require('./index.js')

class GpioRocker extends GpioInput {
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

    this.on('gpio', (value) => {
      this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
      this.values.buttonevent =
        this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
    })
  }
}

module.exports = GpioRocker
