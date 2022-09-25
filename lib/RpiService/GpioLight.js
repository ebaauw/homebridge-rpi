// homebridge-rpi/lib/RpiService/GpioLight.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('../PigpioClient')

class GpioLight extends homebridgeLib.ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name
    params.Service = gpioAccessory.Services.hap.Lightbulb
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.mode = PigpioClient.modeValues.OUTPUT
    this.reversed = params.reversed
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        const dutyCycle = value ? Math.round(this.values.brightness * 2.55) : 0
        this.values.dutyCycle = this.reversed ? 255 - dutyCycle : dutyCycle
        await this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'brightness',
      Characteristic: this.Characteristics.hap.Brightness,
      unit: '%',
      setter: async (value) => {
        const dutyCycle = Math.round(value * 2.55)
        this.values.dutyCycle = this.reversed ? 255 - dutyCycle : dutyCycle
        await this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'dutyCycle',
      value: 0
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
  }

  async init () {
    this.debug('initialising GPIO %d: mode: %d', this.gpio, this.mode)
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, this.mode)
    this.inHeartbeat = false
    await this.update()
  }

  async heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      this.values.dutyCycle = await this.pi.command(
        PigpioClient.commands.GDC, this.gpio
      )
      const dutyCycle = this.reversed
        ? 255 - this.values.dutyCycle
        : this.values.dutyCycle
      if (dutyCycle === 0) {
        this.values.on = false
        this.inHeartbeat = false
        return
      }
      this.values.on = true
      this.values.brightness = Math.round(dutyCycle / 2.55)
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  async shutdown () {
    // this.values.dutyCycle = 0
    // await this.update()
  }

  async update () {
    this.debug('set duty cycle to %d', this.values.dutyCycle)
    await this.pi.command(
      PigpioClient.commands.PWM, this.gpio, this.values.dutyCycle
    )
  }
}

module.exports = GpioLight
