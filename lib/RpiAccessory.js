// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
// const PigpioClient = require('./PigpioClient')
const RpiService = require('./RpiService')

class RpiAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (platform, params) {
    super(platform, params)
    this.pi = params.pi
    this.context.hostname = this.pi.hostname
    this.on('heartbeat', this.heartbeat)
    this.rpiService = new RpiService(this)
    this.gpioService = new RpiService.GpioSwitch(this, { gpio: 18 })
    this.gpioService2 = new RpiService.GpioStatelessSwitch(this, { gpio: 17 })
    this.pi.on('notification', (map) => {
      this.gpioService.checkMap(map)
      this.gpioService2.checkMap(map)
    })
    this.historyService = new homebridgeLib.ServiceDelegate.History.Rpi(
      this, params,
      this.rpiService.characteristicDelegate('temperature'),
      this.gpioService.characteristicDelegate('on')
    )

    if (this.name === 'pi5') {
      this.ledService = new RpiService.FanShimLed(this)
    }

    this.setAlive()
    setImmediate(() => {
      this.emit('initialised')
    })
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
}

module.exports = RpiAccessory
