// homebridge-rpi/lib/RpiService/GpioOutput.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

class GpioOutput extends ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.params = params
    this.gpio = params.gpio
    this.mode = this.pi.modeValues.OUTPUT

    this.pi.on('gpio' + this.gpio, (payload) => {
      this.update(payload.value)
    })
  }

  async init () {
    this.debug('initialising GPIO %d: mode %d', this.gpio, this.mode)
    await this.pi.command(this.pi.commands.MODES, this.gpio, this.mode)
  }

  async shutdown () {}
}

export { GpioOutput }
