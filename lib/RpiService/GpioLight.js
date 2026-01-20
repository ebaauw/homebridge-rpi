// homebridge-rpi/lib/RpiService/GpioLight.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { RpiService } from '../RpiService.js'

class GpioLight extends ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name
    params.Service = gpioAccessory.Services.hap.Lightbulb
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.reversed = params.reversed
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        await this.setDutyCycle(value, this.values.brightness)
      }
    })
    this.addCharacteristicDelegate({
      key: 'brightness',
      Characteristic: this.Characteristics.hap.Brightness,
      unit: '%',
      setter: async (value) => {
        await this.setDutyCycle(this.values.on, value)
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
    if (this.pi.port === 8888) {
      this.heartbeat = async (beat) => { return this._heartbeat(beat) }
    }
  }

  async init () {
    this.debug('initialising GPIO %d: output', this.gpio)
    await this.pi.setPwm(this.gpio)
    this.inHeartbeat = false
    await this.setDutyCycle(this.values.on, this.values.brightness)
  }

  async _heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      let dutyCycle = Math.round((await this.pi.command(
        this.pi.commands.GDC, this.gpio
      )).status / 2.55)
      dutyCycle = this.reversed ? 100 - dutyCycle : dutyCycle
      if (dutyCycle === 0) {
        this.values.on = false
        this.inHeartbeat = false
        return
      }
      this.values.on = true
      this.values.brightness = dutyCycle
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  async shutdown () {
    // await this.setDutyCycle(false, this.values.brightness)
  }

  async setDutyCycle (on, brightness) {
    let dutyCycle = on ? brightness : 0
    dutyCycle = this.reversed ? 100 - dutyCycle : dutyCycle
    this.debug('set duty cycle to %d%%', dutyCycle)
    await this.pi.writePwm(this.gpio, dutyCycle)
  }
}

RpiService.GpioLight = GpioLight
