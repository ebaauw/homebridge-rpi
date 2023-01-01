// homebridge-rpi/lib/RpiAccessory/GpioAccessory.js
// Copyright © 2019-2023 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')

class GpioAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (rpiAccessory, device) {
    const params = {
      name: rpiAccessory.name + ' ' + device.name,
      id: rpiAccessory.id + '-' + device.gpio,
      manufacturer: 'homebridge-rpi',
      model: device.device[0].toUpperCase() + device.device.slice(1),
      category: rpiAccessory.Accessory.Categories.Other
    }
    super(rpiAccessory.platform, params)
    this.rpiAccessory = rpiAccessory
    this.pi = rpiAccessory.pi
    this.inheritLogLevel(rpiAccessory)
  }

  async init () {
    return this.service.init()
  }

  setFault (fault) {
    this.service.values.statusFault = fault
      ? this.Characteristics.hap.StatusFault.GENERAL_FAULT
      : this.Characteristics.hap.StatusFault.NO_FAULT
  }

  async shutdown () {
    return this.service.shutdown()
  }
}

module.exports = GpioAccessory
