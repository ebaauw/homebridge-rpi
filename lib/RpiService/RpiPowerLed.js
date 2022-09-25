// homebridge-rpi/lib/RpiService/RpiPowerLed.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const RpiInfo = require('../RpiInfo')

class RpiPowerLed extends homebridgeLib.ServiceDelegate {
  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name + ' Power LED'
    params.Service = rpiAccessory.Services.hap.Lightbulb
    params.primaryService = true
    super(rpiAccessory, params)
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      value: true,
      setter: async (value) => {
        await rpiAccessory.pi.writeFile(RpiInfo.powerLed, value ? '1' : '0')
      }
    })
  }

  checkState (state) {
    if (state == null || state.powerLed == null) {
      return
    }
    this.values.on = state.powerLed !== 0
  }
}

module.exports = RpiPowerLed
