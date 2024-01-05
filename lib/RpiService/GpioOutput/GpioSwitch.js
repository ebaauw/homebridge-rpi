// homebridge-rpi/lib/RpiService/GpioOutput/GpioSwitch.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioOutput = require('./index.js')
const { PigpioClient } = GpioOutput

class GpioSwitch extends GpioOutput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Switch
    super(gpioAccessory, params)
    this.pulse = params.pulse
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (on) => {
        const value = params.reversed ? (on ? 0 : 1) : (on ? 1 : 0)
        await this.pi.command(
          PigpioClient.commands.WRITE, this.gpio, value
        )
      }
    })
    this.addCharacteristicDelegate({
      key: 'lastActivation',
      Characteristic: this.Characteristics.eve.LastActivation,
      silent: true
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
  }

  update (value) {
    this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
    if (this.resetTimeout != null) {
      clearTimeout(this.resetTimeout)
      delete this.resetTimeout
    }
    this.values.on = this.params.reversed ? !value : value
    if (this.pulse != null && this.values.on) {
      this.resetTimeout = setTimeout(async () => {
        try {
          await this.pi.command(
            PigpioClient.commands.WRITE, this.gpio, this.params.reversed ? 1 : 0
          )
        } catch (error) {
          this.warn(error)
        }
        delete this.resetTimeout
      }, this.params.pulse)
    }
  }
}

module.exports = GpioSwitch
