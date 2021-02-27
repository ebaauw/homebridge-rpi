// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2021 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const Blinkt = require('./Blinkt')
const PigpioClient = require('./PigpioClient')
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

class GpioButtonAccessory extends GpioAccessory {
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
    const index = this.buttonServices.length + 1
    if (device.name === 'Button') {
      device.name += ' ' + index
    }
    const buttonService = new RpiService.GpioButton(this, {
      name: this.name + ' ' + device.name,
      index: index,
      gpio: device.gpio,
      reversed: device.reversed
    })
    this.buttonServices.push(buttonService)
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
    this.debug('initialising GPIO %d', this.gpioClock)
    this.debug('initialising GPIO %d', this.gpioData)
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

class RpiAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (platform, params) {
    super(platform, params)
    this.id = params.id
    if (params.rpiInfo != null) {
      this.rpiInfo = params.rpiInfo
      this.rpiInfo.removeAllListeners()
      this.rpiInfo
        .on('readFile', (fileName) => {
          this.debug('read file %s', fileName)
        })
        .on('exec', (cmd, args) => {
          this.debug('exec %s %s', cmd, args.join(' '))
        })
    }
    this.pi = params.pi
    this.pi.removeAllListeners()
    this.pi
      .on('error', (error) => { this.error(error) })
      .on('warning', (error) => { this.warn(error) })
      .on('connect', (hostname, port) => {
        this.platform.log('%s: connected to %s:%s', this.name, hostname, port)
        this.init()
      })
      .on('disconnect', (hostname, port) => {
        this.platform.log('%s: disconnected from %s:%s', this.name, hostname, port)
        this.setFault(true)
        for (const key in this.gpioAccessories) {
          this.gpioAccessories[key].setFault(true)
        }
      })
      .on('command', (cmd, p1, p2, p3) => {
        this.debug('command %s %s %s "%s"', PigpioClient.commandName(cmd), p1, p2, p3)
      })
      .on('response', (cmd, status, result) => {
        this.debug('command %s => %s', PigpioClient.commandName(cmd), status)
      })
      .on('request', (request) => { this.vdebug('request: %j', request) })
      .on('data', (data) => { this.vdebug('data: %j', data) })
    this.context.hostname = this.pi.hostname
    this.gpioMask = params.gpioMask
    this.hidden = params.hidden

    this.rpiService = new RpiService(this, { hidden: this.hidden })
    if (!this.hidden) {
      this.historyService = new homebridgeLib.ServiceDelegate.History.Weather(
        this, params,
        this.rpiService.characteristicDelegate('temperature')
      )
      if (!params.noPowerLed) {
        this.powerLedService = new RpiService.PowerLed(this)
      }
      if (!params.noSmokeSensor) {
        this.smokeService = new RpiService.SmokeSensor(this)
      }
    }
    this.map = 0
    this.gpioAccessories = {}
    this.usedGpios = {}

    this
      .on('heartbeat', async (beat) => { await this.heartbeat(beat) })
      .on('shutdown', async () => { return this.shutdown() })
  }

  async init () {
    this.setFault(false)
    for (const key in this.gpioAccessories) {
      try {
        await this.gpioAccessories[key].init()
        this.gpioAccessories[key].setFault(false)
      } catch (error) {
        this.warn(error)
      }
    }
    if (this.map !== 0) {
      const map = ('00000000' + this.map.toString(16)).slice(-8).toUpperCase()
      this.debug('map: 0x%s', map)
      try {
        await this.pi.listen(this.map)
      } catch (error) {
        this.warn(error)
      }
    }
    this.debug('used gpios: %j', Object.keys(this.usedGpios))
    this.emit('initialised')
    this.heartbeatEnabled = true
  }

  setFault (fault) {
    const statusFault = fault
      ? this.Characteristics.hap.StatusFault.GENERAL_FAULT
      : this.Characteristics.hap.StatusFault.NO_FAULT
    this.rpiService.values.statusFault = statusFault
  }

  async shutdown () {
    for (const key in this.gpioAccessories) {
      try {
        await this.gpioAccessories[key].shutdown()
      } catch (error) {
        this.warn(error)
      }
    }
    await this.pi.disconnect()
  }

  async heartbeat (beat) {
    if (beat % this.rpiService.values.heartrate === 0) {
      try {
        if (this.hidden && this.usesGpio) {
          await this.pi.command(PigpioClient.commands.HWVER)
          this.rpiService.checkState()
          return
        }
        let state
        if (this.id === this.platform.localId) {
          state = await this.rpiInfo.getState(this.powerLedService == null)
          if (this.usesGpio) {
            try {
              await this.pi.command(PigpioClient.commands.HWVER)
            } catch (error) {
              this.emit('warning', error)
            }
          }
        } else {
          await this.pi.shell('getState')
          const text = await this.pi.readFile('/tmp/getState.json')
          this.vdebug('raw state: %s', text)
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
        if (this.powerLedService != null) {
          this.powerLedService.checkState(state)
        }
      } catch (error) {
        this.warn(error)
      }
    }
    for (const gpio in this.gpioAccessories) {
      const gpioAccessory = this.gpioAccessories[gpio]
      if (gpioAccessory.service != null && gpioAccessory.service.heartbeat != null) {
        try {
          await gpioAccessory.service.heartbeat(beat)
        } catch (error) {
          this.emit('warning', error)
        }
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
    this.usesGpio = true
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
  }

  async addButton (device) {
    this.checkGpio(device.gpio)
    this.map |= (1 << device.gpio)
    if (this.buttonAccessory == null) {
      this.buttonAccessory = new GpioButtonAccessory(this, device)
      this.gpioAccessories[device.gpio] = this.buttonAccessory
      setImmediate(() => {
        this.buttonAccessory.emit('initialised')
      })
    }
    this.buttonAccessory.addButton(device)
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
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addMotion (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioMotion(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio,
      reversed: device.reversed
    })
    gpioAccessory.historyService = new homebridgeLib.ServiceDelegate.History.Motion(
      gpioAccessory, { name: gpioAccessory.name },
      gpioAccessory.service.characteristicDelegate('motion'),
      gpioAccessory.service.characteristicDelegate('lastActivation')
    )
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addLight (device) {
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioLight(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio,
      reversed: device.reversed
    })
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
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addSmoke (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioSmoke(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio,
      reversed: device.reversed
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
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addValve (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioValve(gpioAccessory, {
      name: gpioAccessory.name,
      gpio: device.gpio,
      reversed: device.reversed
    })
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }
}

module.exports = RpiAccessory
