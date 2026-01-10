// homebridge-rpi/lib/RpiService/RpiUsbPower.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { RpiInfo } from '../RpiInfo.js'
import { RpiService } from '../RpiService.js'

class RpiUsbPower extends ServiceDelegate {
  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name + ' USB Power'
    params.Service = rpiAccessory.Services.hap.Outlet
    params.primaryService = true
    super(rpiAccessory, params)
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      value: true,
      setter: async (value) => {
        await rpiAccessory.pi.writeFile(
          value ? RpiInfo.usbOn : RpiInfo.usbOff, '1-1'
        )
      }
    })
  }
}

RpiService.UsbPower = RpiUsbPower
