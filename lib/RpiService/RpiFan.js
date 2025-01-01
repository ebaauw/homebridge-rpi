// homebridge-rpi/lib/RpiService/RpiFan.js
// Copyright © 2019-2025 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { RpiService } from '../RpiService.js'

class RpiFan extends ServiceDelegate {
  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name + ' Fan'
    params.Service = rpiAccessory.Services.hap.Fan
    params.primaryService = true
    super(rpiAccessory, params)
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      value: false
    })
    this.addCharacteristicDelegate({
      key: 'speed',
      Characteristic: this.Characteristics.hap.RotationSpeed,
      unit: '%',
      value: 0
    })
  }

  checkState (state) {
    if (state == null || state.fan == null) {
      return
    }
    this.values.on = state.fan !== 0
    this.values.speed = Math.round(state.fan / 2.55)
  }
}

RpiService.Fan = RpiFan
