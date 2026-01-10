// homebridge-rpi/lib/RpiAccessory/ButtonAccessory.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'
import 'homebridge-lib/ServiceDelegate/ServiceLabel'

import { RpiAccessory } from '../RpiAccessory.js'
import './GpioAccessory.js'
import { RpiService } from '../RpiService.js'

class ButtonAccessory extends RpiAccessory.GpioAccessory {
  constructor (rpiAccessory, device) {
    super(rpiAccessory, device)
    this.service = new ServiceDelegate.ServiceLabel(
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
    this.emit('initialised')
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

  async addButton (device) {
    device.index = this.buttonServices.length + 1
    if (device.name === 'Button') {
      device.name += ' ' + device.index
    }
    if (RpiService.GpioButton == null) {
      await import('../RpiService/GpioInput/GpioButton.js')
    }
    const buttonService = new RpiService.GpioButton(this, device)
    this.buttonServices.push(buttonService)
  }

  async addRocker (device) {
    device.index = this.buttonServices.length + 1
    if (device.name === 'Rocker') {
      device.name += ' ' + device.index
    }
    if (RpiService.GpioRocker == null) {
      await import('../RpiService/GpioInput/GpioRocker.js')
    }
    const buttonService = new RpiService.GpioRocker(this, device)
    this.buttonServices.push(buttonService)
  }
}

RpiAccessory.ButtonAccessory = ButtonAccessory
