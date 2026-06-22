// homebridge-rpi/lib/RpiAccessory/W1Accessory.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { AccessoryDelegate } from 'homebridge-lib/AccessoryDelegate'

import { RpiAccessory } from '../RpiAccessory.js'

class W1Accessory extends AccessoryDelegate {
  constructor (rpiAccessory, device) {
    const params = {
      name: rpiAccessory.name + ' ' + device.name,
      id: rpiAccessory.id + '-' + device.sensorId,
      manufacturer: 'homebridge-rpi',
      model: 'DS18B20',
      category: rpiAccessory.Accessory.Categories.Sensor
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

RpiAccessory.W1Accessory = W1Accessory
