// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const Blinkt = require('./Blinkt')
const RpiInfo = require('./RpiInfo')
const RpiService = require('./RpiService')

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
    this.setAlive()
  }
}

class BlinktAccessory extends GpioAccessory {
  constructor (rpiAccessory, device) {
    device.gpio = device.gpioClock
    super(rpiAccessory, device)
    this.gpioClock = device.gpioClock
    this.gpioData = device.gpioData
    this.blinkt = new Blinkt(this.pi, device)
    this.blinkt.on('error', (error) => { this.warn(error) })
    this.blinkt.on('connect', () => { this.debug('connected') })
    this.services = []
    for (let led = 0; led < device.nLeds; led++) {
      const service = new RpiService.GpioBlinkt(this, {
        name: this.name + (device.nLeds > 1 ? ' ' + led : ''),
        subtype: led
      })
      this.services.push(service)
    }
    this.on('shutdown', async () => {
      await this.blinkt.destroy()
    })
    setImmediate(() => {
      this.emit('initialised')
    })
  }

  async init () {
    this.debug('initialising GPIO %d', this.gpioClock)
    this.debug('initialising GPIO %d', this.gpioData)
    return this.blinkt.init()
  }
}

class RpiAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (platform, params) {
    super(platform, params)
    this.id = params.id
    this.pi = params.pi
    this.gpioMask = params.gpioMask
    this.pi.removeAllListeners()
    this.pi.on('error', (error) => { this.warn(error) })
    this.pi.on('connect', () => { this.debug('connect') })
    this.pi.on('disconnect', () => { this.debug('disconnect') })
    this.pi.on('command', (cmd, p1, p2, p3) => { this.debug('command %s %s %s %s', cmd, p1, p2, p3) })
    this.pi.on('response', (cmd, p1, p2) => { this.debug('response %s %s %s', cmd, p1, p2) })
    this.pi.on('request', (request) => { this.vdebug('request: %j', request) })
    this.pi.on('data', (data) => { this.vdebug('data: %j', data) })
    this.context.hostname = this.pi.hostname
    this.on('heartbeat', async (beat) => { await this.heartbeat(beat) })
    this.rpiService = new RpiService(this)
    this.rpiService.on('rebooted', () => { this.rebooted() })
    this.historyService = new homebridgeLib.ServiceDelegate.History.Weather(
      this, params,
      this.rpiService.characteristicDelegate('temperature')
    )
    this.map = 0
    this.buttonServices = []
    this.gpioAccessories = {}
    this.usedGpios = {}
    this.setAlive()
  }

  async init () {
    if (this.map !== 0) {
      this.debug('map: %d', this.map)
      await this.pi.listen(this.map)
    }
    this.debug('used gpios: %j', Object.keys(this.usedGpios))
    this.emit('initialised')
  }

  async heartbeat (beat) {
    if (beat % this.rpiService.values.heartrate === 0) {
      let state
      try {
        if (this.id === this.platform.localhostId) {
          state = await RpiInfo.getState()
        } else {
          await this.pi.shell('getState')
          const text = await this.pi.readFile('/tmp/getState.json')
          try {
            state = RpiInfo.parseState(text)
          } catch (error) {
            this.warn(error.message)
            this.warn('getState script output: ', text)
            return
          }
        }
        this.debug('state: %j', state)
        this.rpiService.checkState(state)
      } catch (error) {
        this.warn(error)
      }
    }
  }

  checkGpio (gpio) {
    if ((this.gpioMask & (1 << gpio)) === 0) {
      throw new Error(`${gpio}: invalid gpio`)
    }
    if (this.usedGpios[gpio] != null) {
      throw new Error(`${gpio}: duplicate gpio`)
    }
    this.usedGpios[gpio] = true
  }

  async rebooted () {
    this.init()
    for (const buttonService of this.buttonServices) {
      try {
        await buttonService.init()
      } catch (error) {
        this.warn(error)
      }
    }
    for (const key in this.gpioAccessories) {
      try {
        const gpioAccessory = this.gpioAccessories[key]
        if (gpioAccessory instanceof BlinktAccessory) {
          await gpioAccessory.init()
        } else {
          await gpioAccessory.service.init()
        }
      } catch (error) {
        this.warn(error)
      }
    }
  }

  createGpioAccessory (device) {
    this.checkGpio(device.gpio)
    const gpioAccessory = new GpioAccessory(this, device)
    this.gpioAccessories[device.gpio] = gpioAccessory
    return gpioAccessory
  }

  async addBlinkt (device) {
    this.checkGpio(device.gpioClock)
    this.checkGpio(device.gpioData)
    const blinktAccessory = new BlinktAccessory(this, device)
    this.gpioAccessories[device.gpioClock] = blinktAccessory
    await blinktAccessory.init()
  }

  async addButton (device) {
    this.checkGpio(device.gpio)
    this.map |= (1 << device.gpio)
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
      gpio: device.gpio,
      reversed: device.reversed
    })
    this.buttonServices.push(buttonService)
    await buttonService.init()
  }

  async addContact (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioContact(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio,
      reversed: device.reversed
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

  async addServo (device) {
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioServo(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio
    })
    await gpioAccessory.service.init()
    gpioAccessory.on('heartbeat', async (beat) => {
      await gpioAccessory.service.heartbeat(beat)
    })
    gpioAccessory.on('shutdown', async () => {
      await gpioAccessory.service.shutdown()
    })
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addSwitch (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioSwitch(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio,
      reversed: device.reversed,
      pulse: device.pulse
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
