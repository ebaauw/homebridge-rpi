// homebridge-rpi/lib/RpiService/GpioServo.js
// Copyright © 2019-2023 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('../PigpioClient')

class GpioServo extends homebridgeLib.ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name
    params.Service = gpioAccessory.Services.hap.Switch
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.mode = PigpioClient.modeValues.OUTPUT
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        this.values.pulseWidth = value
          ? Math.round(2500 - ((this.values.currentTiltAngle + 90) * 2000 / 180))
          : 0
        await this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'currentTiltAngle',
      Characteristic: this.Characteristics.hap.CurrentTiltAngle,
      unit: '°',
      value: 0
    })
    this.addCharacteristicDelegate({
      key: 'targetTiltAngle',
      Characteristic: this.Characteristics.hap.TargetTiltAngle,
      unit: '°',
      value: 0,
      setter: async (value) => {
        this.values.pulseWidth = Math.round(2500 - ((value + 90) * 2000 / 180))
        await this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'pulseWidth',
      value: 1500
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
      this.values.pulseWidth = await this.pi.command(
        PigpioClient.commands.GPW, this.gpio
      )
      if (this.values.pulseWidth === 0) {
        this.values.on = false
        this.inHeartbeat = false
        return
      }
      this.values.on = true
      const angle = Math.round(((2500 - this.values.pulseWidth) * 180 / 2000) - 90)
      this.values.currentTiltAngle = angle
      this.values.targetTiltAngle = angle
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  async shutdown () {
    // this.values.pulseWidth = 0
    // await this.update()
  }

  async update () {
    this.debug('set pulse width to %d', this.values.pulseWidth)
    await this.pi.command(
      PigpioClient.commands.SERVO, this.gpio, this.values.pulseWidth
    )
  }
}

module.exports = GpioServo
