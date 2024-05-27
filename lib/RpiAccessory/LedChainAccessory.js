// homebridge-rpi/lib/RpiAccessory/LedChainAccessory.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { timeout } from 'homebridge-lib'
import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'
import 'homebridge-lib/ServiceDelegate/History' // TODO: import on-demand

import { PigpioClient } from '../PigpioClient.js'
import { PigpioLedChain } from '../PigpioLedChain.js'
import '../PigpioLedChain/P9813.js' // TODO: import on-demand
import '../PigpioLedChain/Blinkt.js' // TODO: import on-demand
import { RpiAccessory } from '../RpiAccessory.js'
import './GpioAccessory.js'
import { RpiService } from '../RpiService.js'
import '../RpiService/GpioLedChain.js'

class LedChainAccessory extends RpiAccessory.GpioAccessory {
  constructor (rpiAccessory, device) {
    device.gpio = device.gpioClock
    super(rpiAccessory, device)
    this.gpioClock = device.gpioClock
    this.gpioData = device.gpioData
    this.mode = PigpioClient.modeValues.OUTPUT
    this.ledChain = device.device === 'p9813'
      ? new PigpioLedChain.P9813(this.pi, device)
      : new PigpioLedChain.Blinkt(this.pi, device)
    this.ledChain.on('error', (error) => { this.warn(error) })
    this.ledChain
      .on('connect', (hostname, port) => {
        this.platform.log('%s: connected to %s:%s', this.name, hostname, port)
      })
      .on('disconnect', (hostname, port) => {
        this.platform.log('%s: disconnected from %s:%s', this.name, hostname, port)
      })
      .on('led', (id, led) => { this.debug('led %d: send %j', id, led) })
      .on('request', (request) => {
        this.vdebug('request: %j', request)
      })
    this.services = []
    for (let led = 0; led < device.nLeds; led++) {
      const service = new RpiService.GpioLedChain(this, {
        name: this.name + (device.nLeds > 1 ? ' ' + led : ''),
        subtype: led
      })
      this.services.push(service)
    }
    if (device.nLeds === 1) {
      this.services[0].addCharacteristicDelegate({
        key: 'lastActivation',
        Characteristic: this.Characteristics.eve.LastActivation,
        silent: true
      })
      this.historyService = new ServiceDelegate.History(
        this, {
          lightOnDelegate: this.services[0].characteristicDelegate('on'),
          lastLightOnDelegate: this.services[0].characteristicDelegate('lastActivation')
        }
      )
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
    await timeout(this.platform.config.resetTimeout)
    return this.ledChain.init()
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
    return this.ledChain.disconnect()
  }
}

RpiAccessory.LedChainAccessory = LedChainAccessory
