// homebridge-rpi/lib/RpiService/GpioOutput/GpioGarage.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { GpioOutput } from '../GpioOutput.js'
import { RpiService } from '../../RpiService.js'

class GpioGarage extends GpioOutput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.GarageDoorOpener
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'currentState',
      Characteristic: this.Characteristics.hap.CurrentDoorState
    })
    this.addCharacteristicDelegate({
      key: 'targetState',
      Characteristic: this.Characteristics.hap.TargetDoorState,
      setter: async (state) => {
        const value = state === this.Characteristics.hap.TargetDoorState.CLOSED
          ? (params.reversed ? 1 : 0)
          : (params.reversed ? 0 : 1)
        await this.pi.command(
          this.pi.commands.WRITE, this.gpio, value
        )
      }
    })
    this.addCharacteristicDelegate({
      key: 'obstruction',
      Characteristic: this.Characteristics.hap.ObstructionDetected,
      value: false
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
        ? this.Characteristics.hap.TargetDoorState.CLOSED
        : this.Characteristics.hap.TargetDoorState.OPEN
      : this.params.reversed
        ? this.Characteristics.hap.TargetDoorState.OPEN
        : this.Characteristics.hap.TargetDoorState.CLOSED
    this.values.currentState = value
      ? this.params.reversed
        ? this.Characteristics.hap.CurrentDoorState.CLOSING
        : this.Characteristics.hap.CurrentDoorState.OPENING
      : this.params.reversed
        ? this.Characteristics.hap.CurrentDoorState.OPENING
        : this.Characteristics.hap.CurrentDoorState.CLOSING
    this.setTimeout = setTimeout(async () => {
      this.values.currentState = value
        ? this.params.reversed
          ? this.Characteristics.hap.CurrentDoorState.CLOSED
          : this.Characteristics.hap.CurrentDoorState.OPEN
        : this.params.reversed
          ? this.Characteristics.hap.CurrentDoorState.OPEN
          : this.Characteristics.hap.CurrentDoorState.CLOSED
      delete this.setTimeout
    }, 5000)
  }
}

RpiService.GpioGarage = GpioGarage
