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

    this.pi.on('gpio' + this.gpio, (payload) => {
      this.update(payload.value)
    })
  }

  async init () {
    this.debug('initialising GPIO %d: output', this.gpio)
    await this.pi.setOutput(this.gpio, this.params.initialValue)
  }

  async shutdown () {}
}

export { GpioOutput }
