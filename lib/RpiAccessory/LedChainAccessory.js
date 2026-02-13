// homebridge-rpi/lib/RpiAccessory/LedChainAccessory.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { timeout } from 'homebridge-lib'
import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'
import 'homebridge-lib/ServiceDelegate/History' // TODO: import on-demand

import { LedChainClient } from 'hb-rpi-tools/LedChainClient'

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
    this.ledChain = device.device === 'p9813'
      ? new LedChainClient.P9813(this.pi, device)
      : new LedChainClient.Blinkt(this.pi, device)
    this.ledChain.on('error', (error) => { this.warn(error) })
    this.ledChain
      .on('connect', (hostname, port) => {
        this.platform.log('%s: connected to %s:%s', this.name, hostname, port)
      })
      .on('disconnect', (hostname, port) => {
        this.platform.log('%s: disconnected from %s:%s', this.name, hostname, port)
      })
      .on('led', (id, led) => { this.vdebug('led %d: send %j', id, led) })
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
    this.services[0].values.colorLoop = false
    this.services[0].values.cylon = false
    await this.ledChain.stop()
    return this.ledChain.disconnect(true)
  }
}

RpiAccessory.LedChainAccessory = LedChainAccessory
