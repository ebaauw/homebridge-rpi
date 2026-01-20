// homebridge-rpi/lib/RpiService/GpioServo.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { timeout } from 'homebridge-lib'
import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { RpiService } from '../RpiService.js'

class GpioServo extends ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name
    params.Service = gpioAccessory.Services.hap.Switch
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        this.values.pulseWidth = value
          ? Math.round(2500 - ((this.values.currentTiltAngle + 90) * 2000 / 180))
          : 0
        await this.setPulseWidth()
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
        await this.setPulseWidth()
      }
    })
    this.addCharacteristicDelegate({
      key: 'pulseWidth',
      value: 1500,
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
    await this.update()
  }

  async _heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      this.values.pulseWidth = (await this.pi.command(
        this.pi.commands.GPW, this.gpio
      )).status
      this.update()
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  update () {
    if (this.values.pulseWidth === 0) {
      this.values.on = false
      return
    }
    this.values.on = true
    const angle = Math.round(((2500 - this.values.pulseWidth) * 180 / 2000) - 90)
    this.values.currentTiltAngle = angle
    this.values.targetTiltAngle = angle
  }

  async shutdown () {
    if (this.values.pulseWidth !== 0) {
      this.values.pulseWidth = 0
      await this.setPulseWidth()
    }
  }

  async setPulseWidth () {
    await this.pi.writeServo(this.gpio, this.values.pulseWidth)
    await timeout(500)
    this.update()
  }
}

RpiService.GpioServo = GpioServo
