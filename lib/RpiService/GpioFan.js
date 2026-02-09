// homebridge-rpi/lib/RpiService/GpioFan.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { RpiService } from '../RpiService.js'

class GpioFan extends ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name
    params.Service = gpioAccessory.Services.hap.Fan
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.reversed = params.reversed
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        await this.setDutyCycle(value, this.values.speed)
      }
    })
    this.addCharacteristicDelegate({
      key: 'speed',
      Characteristic: this.Characteristics.hap.RotationSpeed,
      unit: '%',
      setter: async (value) => {
        await this.setDutyCycle(this.values.on, value)
      }
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
    await this.setDutyCycle(this.values.on, this.values.speed)
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
      this.values.speed = dutyCycle
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  async shutdown () {
    await this.setDutyCycle(false, this.values.speed)
  }

  async setDutyCycle (on, speed) {
    let dutyCycle = on ? speed : 0
    dutyCycle = this.reversed ? 100 - dutyCycle : dutyCycle
    this.debug('set duty cycle to %d%%', dutyCycle)
    try {
      await this.pi.writePwm(this.gpio, dutyCycle)
    } catch (error) {
      if (dutyCycle !== 0 || !(error.message.endsWith('(-86)'))) {
        throw error
      }
    }
  }
}

RpiService.GpioFan = GpioFan
