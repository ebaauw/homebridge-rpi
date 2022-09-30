// homebridge-rpi/lib/RpiAccessory/index.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('../PigpioClient')
const RpiInfo = require('../RpiInfo')
const RpiService = require('../RpiService')

class RpiAccessory extends homebridgeLib.AccessoryDelegate {
  static get BlinktAccessory () { return require('./BlinktAccessory') }
  static get ButtonAccessory () { return require('./ButtonAccessory') }
  static get GpioAccessory () { return require('./GpioAccessory') }

  constructor (platform, params) {
    super(platform, params)
    this.id = params.id
    if (this.id === this.platform.localId) { // Local Pi
      this.rpiInfo = new RpiInfo()
      this.rpiInfo
        .on('error', (error) => { this.warn(error) })
        .on('exec', (command) => { this.debug('exec: %s', command) })
        .on('readFile', (fileName) => { this.debug('read file: %s', fileName) })
    }
    this.pi = params.pi
    this.pi.removeAllListeners()
    this.pi
      .on('error', (error) => { this.warn(error) })
      .on('warning', (error) => { this.warn(error) })
      .on('connect', async (hostname, port) => {
        this.platform.log('%s: connected to %s:%s', this.name, hostname, port)
        try {
          await this.init()
        } catch (error) {
          this.warn(error)
        }
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
      .on('notification', (map, tick) => {
        let s = ''
        for (let i = 32; i--; i >= 0) {
          s += (map & (1 << i)) !== 0 ? 'x' : '.'
          if (i % 4 === 0 && i > 0) {
            s += ' '
          }
        }
        this.vdebug(
          'gpio map: [%s]%s', s, tick == null ? '' : ', tick: ' + tick
        )
      })
      .on('data', (data) => { this.vdebug('data: %j', data) })
    this.context.hostname = this.pi.hostname
    this.gpioMask = params.gpioMask
    this.hidden = params.hidden

    this.rpiService = new RpiService(this, { hidden: this.hidden })
    this.manageLogLevel(this.rpiService.characteristicDelegate('logLevel'))
    if (!this.hidden) {
      if (!params.noSmokeSensor) {
        this.smokeService = new RpiService.SmokeSensor(this)
      }
      this.historyService = new homebridgeLib.ServiceDelegate.History.Weather(
        this, params,
        this.rpiService.characteristicDelegate('temperature')
      )
    }
    if (!params.noPowerLed) {
      this.powerLedService = new RpiService.PowerLed(this)
    }
    if (params.usbPower) {
      this.usbPowerService = new RpiService.UsbPower(this)
    }
    this.map = 0
    this.gpioAccessories = {}
    this.usedGpios = {}

    this
      .on('heartbeat', async (beat) => {
        if (beat % this.rpiService.values.heartrate === 0) {
          if (this.inHeartbeat) {
            return
          }
          this.inHeartbeat = true
          await this.heartbeat(beat)
          this.inHeartbeat = false
        }
      })
      .on('shutdown', async () => { await this.shutdown() })
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
    try {
      let state
      if (this.id === this.platform.localId) { // Local Pi
        if (!this.hidden) {
          state = await this.rpiInfo.getState(this.powerLedService == null)
        }
        if (this.usesGpio) {
          try {
            await this.pi.command(PigpioClient.commands.HWVER)
          } catch (error) {
            this.warn(error)
          }
        }
      } else { // Remote Pi
        if (this.hidden && this.powerLedService == null) {
          await this.pi.command(PigpioClient.commands.HWVER)
        } else {
          await this.pi.shell('getState')
          const text = await this.pi.readFile('/tmp/getState.json')
          this.vdebug('raw state: %s', text)
          state = RpiInfo.parseState(text)
        }
      }
      this.debug('state: %j', state)
      if (!this.hidden) {
        this.rpiService.checkState(state)
      }
      if (this.powerLedService != null) {
        this.powerLedService.checkState(state)
      }
    } catch (error) {
      this.warn('heartbeat error: %s', error)
    }
    for (const gpio in this.gpioAccessories) {
      const gpioAccessory = this.gpioAccessories[gpio]
      if (gpioAccessory.service != null && gpioAccessory.service.heartbeat != null) {
        try {
          await gpioAccessory.service.heartbeat(beat)
        } catch (error) {
          this.warn(error)
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
    const gpioAccessory = new RpiAccessory.GpioAccessory(this, device)
    this.gpioAccessories[device.gpio] = gpioAccessory
    return gpioAccessory
  }

  async addBlinkt (device) {
    this.checkGpio(device.gpioClock)
    this.checkGpio(device.gpioData)
    const blinktAccessory = new RpiAccessory.BlinktAccessory(this, device)
    this.gpioAccessories[device.gpioClock] = blinktAccessory
  }

  async addButton (device) {
    this.checkGpio(device.gpio)
    this.map |= (1 << device.gpio)
    if (this.buttonAccessory == null) {
      this.buttonAccessory = new RpiAccessory.ButtonAccessory(this, device)
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
    gpioAccessory.service = new RpiService.GpioContact(gpioAccessory, device)
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

  async addDht (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioDht(gpioAccessory, device)
    gpioAccessory.humidityService = new RpiService.GpioDht.Humidity(gpioAccessory)
    this.historyService = new homebridgeLib.ServiceDelegate.History.Weather(
      gpioAccessory, { name: gpioAccessory.name },
      gpioAccessory.service.characteristicDelegate('temperature'),
      gpioAccessory.humidityService.characteristicDelegate('humidity')
    )
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addDoorBell (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioDoorBell(gpioAccessory, device)
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addLeak (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioLeak(gpioAccessory, device)
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addLight (device) {
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioLight(gpioAccessory, device)
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addLock (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioLock(gpioAccessory, device)
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addMotion (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioMotion(gpioAccessory, device)
    gpioAccessory.historyService = new homebridgeLib.ServiceDelegate.History.Motion(
      gpioAccessory, { name: gpioAccessory.name },
      gpioAccessory.service.characteristicDelegate('motion'),
      gpioAccessory.service.characteristicDelegate('lastActivation')
    )
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addRocker (device) {
    this.checkGpio(device.gpio)
    this.map |= (1 << device.gpio)
    if (this.buttonAccessory == null) {
      this.buttonAccessory = new RpiAccessory.ButtonAccessory(this, device)
      this.gpioAccessories[device.gpio] = this.buttonAccessory
      setImmediate(() => {
        this.buttonAccessory.emit('initialised')
      })
    }
    this.buttonAccessory.addRocker(device)
  }

  async addServo (device) {
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioServo(gpioAccessory, device)
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addSmoke (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioSmoke(gpioAccessory, device)
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }

  async addSwitch (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = this.createGpioAccessory(device)
    gpioAccessory.service = new RpiService.GpioSwitch(gpioAccessory, device)
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
    gpioAccessory.service = new RpiService.GpioValve(gpioAccessory, device)
    setImmediate(() => {
      gpioAccessory.emit('initialised')
    })
  }
}

module.exports = RpiAccessory
