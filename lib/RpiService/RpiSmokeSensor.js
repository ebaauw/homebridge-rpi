// homebridge-rpi/lib/RpiService/RpiSmokeSensor.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { RpiService } from '../RpiService.js'

class RpiSmokeSensor extends ServiceDelegate {
  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name
    params.Service = rpiAccessory.Services.hap.SmokeSensor
    super(rpiAccessory, params)
    this.rpiService = rpiAccessory.rpiService
    this.addCharacteristicDelegate({
      key: 'smokeDetected',
      Characteristic: this.Characteristics.hap.SmokeDetected,
      value: this.Characteristics.hap.SmokeDetected.SMOKE_NOT_DETECTED
    })
    this.update()
    this.rpiService.characteristicDelegate('throttled')
      .on('didSet', () => { this.update() })
    this.rpiService.characteristicDelegate('underVoltage')
      .on('didSet', () => { this.update() })
  }

  update () {
    this.values.smokeDetected =
      this.rpiService.values.throttled || this.rpiService.values.underVoltage
        ? this.Characteristics.hap.SmokeDetected.SMOKE_DETECTED
        : this.Characteristics.hap.SmokeDetected.SMOKE_NOT_DETECTED
  }
}

RpiService.SmokeSensor = RpiSmokeSensor
