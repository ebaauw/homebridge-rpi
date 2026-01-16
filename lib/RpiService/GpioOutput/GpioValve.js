// homebridge-rpi/lib/RpiService/GpioOutput/GpioValve.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { GpioOutput } from '../GpioOutput.js'
import { RpiService } from '../../RpiService.js'

class GpioValve extends GpioOutput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Valve
    super(gpioAccessory, params)

    this.addCharacteristicDelegate({
      key: 'active',
      Characteristic: this.Characteristics.hap.Active,
      setter: async (active) => {
        const value = params.reversed
          ? (active === this.Characteristics.hap.Active.ACTIVE ? 0 : 1)
          : (active === this.Characteristics.hap.Active.ACTIVE ? 1 : 0)
        await this.pi.write(this.gpio, value)
      }
    }).on('didSet', (active) => {
      if (active === this.Characteristics.hap.Active.ACTIVE) {
        this.values.inUse = this.Characteristics.hap.InUse.IN_USE
        this.values.remainingDuration = this.values.setDuration
        this.activeDue = new Date().valueOf()
        this.activeDue += this.values.setDuration * 1000
        this.activeDueTimeout = setTimeout(() => {
          this.characteristicDelegate('active')
            .setValue(this.Characteristics.hap.Active.INACTIVE)
        }, this.values.setDuration * 1000)
      } else {
        if (this.activeDueTimeout != null) {
          clearTimeout(this.activeDueTimeout)
          delete this.activeDueTimeout
        }
        this.values.inUse = this.Characteristics.hap.InUse.NOT_IN_USE
        this.values.remainingDuration = 0
        this.activeDue = 0
      }
    })
    this.addCharacteristicDelegate({
      key: 'inUse',
      Characteristic: this.Characteristics.hap.InUse,
      value: this.Characteristics.hap.InUse.NOT_IN_USE
    })
    this.addCharacteristicDelegate({
      key: 'remainingDuration',
      Characteristic: this.Characteristics.hap.RemainingDuration,
      getter: async () => {
        const remaining = this.activeDue - new Date().valueOf()
        return remaining > 0 ? Math.round(remaining / 1000) : 0
      }
    })
    this.addCharacteristicDelegate({
      key: 'setDuration',
      Characteristic: this.Characteristics.hap.SetDuration
    })
    this.addCharacteristicDelegate({
      key: 'valveType',
      Characteristic: this.Characteristics.hap.ValveType,
      value: this.Characteristics.hap.ValveType.GENERIC_VALVE
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
  }

  async init () {
    await super.init()
    this.values.active = this.Characteristics.hap.Active.INACTIVE
  }

  update (value) {
    this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
    this.values.active = this.params.reversed
      ? value
        ? this.Characteristics.hap.Active.INACTIVE
        : this.Characteristics.hap.Active.ACTIVE
      : value
        ? this.Characteristics.hap.Active.ACTIVE
        : this.Characteristics.hap.Active.INACTIVE
  }
}

RpiService.GpioValve = GpioValve
