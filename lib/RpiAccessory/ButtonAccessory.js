// homebridge-rpi/lib/RpiAccessory/ButtonAccessory.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const RpiService = require('../RpiService')

const GpioAccessory = require('./GpioAccessory')

class ButtonAccessory extends GpioAccessory {
  constructor (rpiAccessory, device) {
    super(rpiAccessory, device)
    this.service = new homebridgeLib.ServiceDelegate.ServiceLabel(
      this, {
        name: this.name,
        namespace: this.Characteristics.hap.ServiceLabelNamespace.ARABIC_NUMERALS
      }
    )
    this.service.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
    this.buttonServices = []
  }

  async init () {
    for (const buttonService of this.buttonServices) {
      try {
        await buttonService.init()
      } catch (error) {
        this.warn(error)
      }
    }
  }

  async shutdown () {
    for (const buttonService of this.buttonServices) {
      try {
        await buttonService.shutdown()
      } catch (error) {
        this.warn(error)
      }
    }
  }

  addButton (device) {
    device.index = this.buttonServices.length + 1
    if (device.name === 'Button') {
      device.name += ' ' + device.index
    }
    const buttonService = new RpiService.GpioButton(this, device)
    this.buttonServices.push(buttonService)
  }

  addRocker (device) {
    device.index = this.buttonServices.length + 1
    if (device.name === 'Rocker') {
      device.name += ' ' + device.index
    }
    const buttonService = new RpiService.GpioRocker(this, device)
    this.buttonServices.push(buttonService)
  }
}

module.exports = ButtonAccessory
