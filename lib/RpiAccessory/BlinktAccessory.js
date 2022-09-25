// homebridge-rpi/lib/RpiAccessory/BlinktAccessory.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const Blinkt = require('../Blinkt')
const PigpioClient = require('../PigpioClient')
const RpiService = require('../RpiService')

const GpioAccessory = require('./GpioAccessory')

class BlinktAccessory extends GpioAccessory {
  constructor (rpiAccessory, device) {
    device.gpio = device.gpioClock
    super(rpiAccessory, device)
    this.gpioClock = device.gpioClock
    this.gpioData = device.gpioData
    this.mode = PigpioClient.modeValues.OUTPUT
    this.blinkt = new Blinkt(this.pi, device)
    this.blinkt.on('error', (error) => { this.warn(error) })
    this.blinkt
      .on('connect', (hostname, port) => {
        this.platform.log('%s: connected to %s:%s', this.name, hostname, port)
      })
      .on('disconnect', (hostname, port) => {
        this.platform.log('%s: disconnected from %s:%s', this.name, hostname, port)
      })
      .on('led', (id, bri, r, g, b) => {
        this.debug('led %d: send bri: %d, rgb: {%d, %d, %d}', id, bri, r, g, b)
      })
      .on('request', (request) => {
        this.vdebug('request: %j', request)
      })
    this.services = []
    for (let led = 0; led < device.nLeds; led++) {
      const service = new RpiService.GpioBlinkt(this, {
        name: this.name + (device.nLeds > 1 ? ' ' + led : ''),
        subtype: led
      })
      this.services.push(service)
    }
    setImmediate(() => {
      this.emit('initialised')
    })
  }

  async init () {
    this.debug('initialising GPIO %d: mode: %d', this.gpioClock, this.mode)
    this.debug('initialising GPIO %d: mode: %d', this.gpioData, this.mode)
    for (const service of this.services) {
      service.update(false)
    }
    await homebridgeLib.timeout(this.platform.config.resetTimeout)
    return this.blinkt.init()
  }

  setFault (fault) {
    const statusFault = fault
      ? this.Characteristics.hap.StatusFault.GENERAL_FAULT
      : this.Characteristics.hap.StatusFault.NO_FAULT
    for (const service of this.services) {
      service.values.statusFault = statusFault
    }
  }

  async shutdown () {
    return this.blinkt.disconnect()
  }
}

module.exports = BlinktAccessory
