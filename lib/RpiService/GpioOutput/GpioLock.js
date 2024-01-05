// homebridge-rpi/lib/RpiService/GpioOutput/GpioLock.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioOutput = require('./index.js')
const { PigpioClient } = GpioOutput

class GpioLock extends GpioOutput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.LockMechanism
    super(gpioAccessory, params)
    this.pulse = params.pulse
    this.addCharacteristicDelegate({
      key: 'currentState',
      Characteristic: this.Characteristics.hap.LockCurrentState
    })
    this.addCharacteristicDelegate({
      key: 'targetState',
      Characteristic: this.Characteristics.hap.LockTargetState,
      setter: async (state) => {
        if (this.resetTimeout != null) {
          throw new Error('pulse in progress')
        }
        const value = state === this.Characteristics.hap.LockTargetState.SECURED
          ? (params.reversed ? 1 : 0)
          : (params.reversed ? 0 : 1)
        await this.pi.command(
          PigpioClient.commands.WRITE, this.gpio, value
        )
      }
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
  }

  update (value) {
    this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
    if (this.setTimeout != null) {
      clearTimeout(this.setTimeout)
      delete this.setTimeout
    }
    if (this.resetTimeout != null) {
      clearTimeout(this.resetTimeout)
      delete this.resetTimeout
    }
    this.values.targetState = value
      ? this.params.reversed
        ? this.Characteristics.hap.LockTargetState.SECURED
        : this.Characteristics.hap.LockTargetState.UNSECURED
      : this.params.reversed
        ? this.Characteristics.hap.LockTargetState.UNSECURED
        : this.Characteristics.hap.LockTargetState.SECURED
    this.setTimeout = setTimeout(async () => {
      this.values.currentState = value
        ? this.params.reversed
          ? this.Characteristics.hap.LockCurrentState.SECURED
          : this.Characteristics.hap.LockCurrentState.UNSECURED
        : this.params.reversed
          ? this.Characteristics.hap.LockCurrentState.UNSECURED
          : this.Characteristics.hap.LockCurrentState.SECURED
      delete this.setTimeout
    }, 500)
    if (
      this.pulse != null &&
      this.values.targetState === this.Characteristics.hap.LockCurrentState.UNSECURED
    ) {
      this.resetTimeout = setTimeout(async () => {
        if (this.setTimeout != null) {
          clearTimeout(this.setTimeout)
          delete this.setTimeout
        }
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

module.exports = GpioLock
