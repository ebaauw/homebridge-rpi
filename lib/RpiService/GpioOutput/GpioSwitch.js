// homebridge-rpi/lib/RpiService/GpioOutput/GpioSwitch.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { GpioOutput } from '../GpioOutput.js'
import { PigpioClient } from '../../PigpioClient.js'
import { RpiService } from '../../RpiService.js'

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
    if (params.duration) {
      this.addCharacteristicDelegate({
        key: 'setDuration',
        Characteristic: this.Characteristics.hap.SetDuration,
        value: 0,
        properties: {
          minValue: 0,
          maxValue: 7200
        }
      })
      this.characteristicDelegate('on').on('didSet', (on) => {
        if (this.durationTimeout != null) {
          clearTimeout(this.durationTimeout)
          delete this.durationTimeout
          this.debug('On: duration cleared')
        }
        if (on && this.values.setDuration > 0) {
          this.debug('On: %ss duration', this.values.setDuration)
          this.durationTimeout = setTimeout(() => {
            this.debug('On: duration expired')
            this.characteristicDelegate('on').setValue(false)
          }, this.values.setDuration * 1000)
        }
      })
    }
  }

  async init () {
    if (this.pulse != null) {
      this.debug('initialising GPIO %d: %s', this.gpio, this.params.reversed ? 'high' : 'low')
      await this.pi.command(
        PigpioClient.commands.WRITE, this.gpio, this.params.reversed ? 1 : 0
      )
    }
    return super.init()
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

RpiService.GpioSwitch = GpioSwitch
