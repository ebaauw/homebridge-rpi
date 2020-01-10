// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const Blinkt = require('./Blinkt')
const RpiService = require('./RpiService')

class RpiAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (platform, params) {
    super(platform, params)
    this.id = params.id
    this.pi = params.pi
    this.context.hostname = this.pi.hostname
    this.on('heartbeat', this.heartbeat)
    this.rpiService = new RpiService(this)
    this.historyService = new homebridgeLib.ServiceDelegate.History.Weather(
      this, params,
      this.rpiService.characteristicDelegate('temperature')
    )
    this.buttonServices = []
    this.gpioAccessories = {}
    this.setAlive()
  }

  async heartbeat (beat) {
    if (beat % 15 === 0) {
      try {
        if (await this.pi.shell('vcgencmd') === 0) {
          const text = await this.pi.readFile('/opt/pigpio/vcgencmd.out')
          const state = JSON.parse(text)
          this.rpiService.checkState(state)
        }
      } catch (error) {
        this.error(error)
      }
    }
  }

  createGpioAccessory (device) {
    const gpioAccessory = new homebridgeLib.AccessoryDelegate(this.platform, {
      name: this.name + ' ' + device.name,
      id: this.id + '-' + device.gpio,
      manufacturer: 'homebridge-rpi',
      model: device.device[0].toUpperCase() + device.device.substr(1),
      category: this.Accessory.Categories.Other
    })
    gpioAccessory.pi = this.pi
    this.gpioAccessories[device.gpio] = gpioAccessory
    return gpioAccessory
  }

  async addBlinkt (device) {
    device.gpio = device.gpioClock
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.blinkt = new Blinkt(this.pi, device)
    await gpioAccessory.blinkt.init()
    gpioAccessory.services = []
    for (let led = 0; led < device.nLeds; led++) {
      const service = new RpiService.GpioBlinkt(gpioAccessory, {
        name: gpioAccessory.name + (device.nLeds > 1 ? ' ' + led : ''),
        subtype: led
      })
      gpioAccessory.services.push(service)
    }
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addButton (device) {
    const index = this.buttonServices.length + 1
    if (index === 1) {
      this.labelService = new homebridgeLib.ServiceDelegate.ServiceLabel(
        this, {
          name: this.name,
          namespace: this.Characteristics.hap.ServiceLabelNamespace.ARABIC_NUMERALS
        }
      )
    }
    const buttonService = new RpiService.GpioButton(this, {
      name: this.name + ' ' + device.name,
      index: index,
      gpio: device.gpio
    })
    this.buttonServices.push(buttonService)
    await buttonService.init()
  }

  async addContact (device) {
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioContact(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio
    })
    gpioAccessory.historyService = new homebridgeLib.ServiceDelegate.History.Contact(
      gpioAccessory, { name: gpioAccessory.name },
      gpioAccessory.service.characteristicDelegate('contact'),
      gpioAccessory.service.characteristicDelegate('timesOpened'),
      gpioAccessory.service.characteristicDelegate('lastActivation')
    )
    await gpioAccessory.service.init()
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addSwitch (device) {
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioSwitch(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio
    })
    gpioAccessory.historyService = new homebridgeLib.ServiceDelegate.History.On(
      gpioAccessory, { name: gpioAccessory.name },
      gpioAccessory.service.characteristicDelegate('on')
    )
    await gpioAccessory.service.init()
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }
}

module.exports = RpiAccessory
