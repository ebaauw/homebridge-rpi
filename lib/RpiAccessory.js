// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2024 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { toHexString } from 'homebridge-lib'
import { AccessoryDelegate } from 'homebridge-lib/AccessoryDelegate'
import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'
import 'homebridge-lib/ServiceDelegate/History' // TODO: import on-demand

import { PigpioClient } from './PigpioClient.js'
import { RpiInfo } from './RpiInfo.js'
import { RpiService } from './RpiService.js'
import './RpiService/RpiFan.js' // TODO: import on-demand
import './RpiService/RpiPowerLed.js' // TODO: import on-demand
import './RpiService/RpiSmokeSensor.js' // TODO: import on-demand
import './RpiService/RpiUsbPower.js' // TODO: import on-demand

class RpiAccessory extends AccessoryDelegate {
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
      .on('listen', (map) => {
        this.debug('listen map: [%s]', PigpioClient.vmap(map))
      })
      .on('notification', (payload) => {
        this.vdebug(
          'gpio map: [%s]%s%s%s', PigpioClient.vmap(payload.map),
          payload.tick == null ? '' : ', tick: ' + payload.tick,
          payload.flags == null
            ? ''
            : ', flags: 0x' + toHexString(payload.flags, 2),
          payload.seqno == null ? '' : ', seqno: ' + payload.seqno
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
      this.historyService = new ServiceDelegate.History(
        this, {
          temperatureDelegate: this.rpiService.characteristicDelegate('temperature')
        }
      )
    }
    if (!params.noPowerLed) {
      this.powerLedService = new RpiService.PowerLed(this)
    }
    if (!params.noFan) {
      this.fanService = new RpiService.Fan(this)
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
          state = await this.rpiInfo.getState(this.powerLedService == null, this.fanService == null)
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
      if (this.fanService != null) {
        this.fanService.checkState(state)
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

  async createGpioAccessory (device) {
    this.checkGpio(device.gpio)
    if (RpiAccessory.GpioAccessory == null) {
      await import('./RpiAccessory/GpioAccessory.js')
    }
    const gpioAccessory = new RpiAccessory.GpioAccessory(this, device)
    this.gpioAccessories[device.gpio] = gpioAccessory
    return gpioAccessory
  }

  async addLedChain (device) {
    this.checkGpio(device.gpioClock)
    this.checkGpio(device.gpioData)
    if (RpiAccessory.LedChainAccessory == null) {
      await import('./RpiAccessory/LedChainAccessory.js')
    }
    const ledChainAccessory = new RpiAccessory.LedChainAccessory(this, device)
    this.gpioAccessories[device.gpioClock] = ledChainAccessory
  }

  async addButton (device) {
    this.checkGpio(device.gpio)
    this.map |= (1 << device.gpio)
    if (this.buttonAccessory == null) {
      if (RpiAccessory.ButtonAccessory == null) {
        await import('./RpiAccessory/ButtonAccessory.js')
      }
      this.buttonAccessory = new RpiAccessory.ButtonAccessory(this, device)
      this.gpioAccessories[device.gpio] = this.buttonAccessory
      setImmediate(() => { this.buttonAccessory.emit('initialised') })
    }
    await this.buttonAccessory.addButton(device)
  }

  async addCarbonMonoxide (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioCarbonMonoxide == null) {
      await import('./RpiService/GpioInput/GpioCarbonMonoxide.js')
    }
    gpioAccessory.service = new RpiService.GpioCarbonMonoxide(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addContact (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioContact == null) {
      await import('./RpiService/GpioInput/GpioContact.js')
    }
    gpioAccessory.service = new RpiService.GpioContact(gpioAccessory, device)
    gpioAccessory.historyService = new ServiceDelegate.History(
      gpioAccessory, {
        contactDelegate: gpioAccessory.service.characteristicDelegate('contact'),
        timesOpenedDelegate: gpioAccessory.service.characteristicDelegate('timesOpened'),
        lastContactDelegate: gpioAccessory.service.characteristicDelegate('lastActivation')
      }
    )
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addDht (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioDht == null) {
      await import('./RpiService/GpioInput/GpioDht.js')
    }
    gpioAccessory.service = new RpiService.GpioDht(gpioAccessory, device)
    gpioAccessory.humidityService = new RpiService.GpioDht.Humidity(gpioAccessory)
    if (gpioAccessory.service.values.temperature == null) {
      gpioAccessory.service.characteristicDelegate('temperature').once('didSet', () => {
        this.historyService = new ServiceDelegate.History(
          gpioAccessory, {
            temperatureDelegate: gpioAccessory.service.characteristicDelegate('temperature'),
            humidityDelegate: gpioAccessory.humidityService.characteristicDelegate('humidity')
          }
        )
      })
    } else {
      this.historyService = new ServiceDelegate.History(
        gpioAccessory, {
          temperatureDelegate: gpioAccessory.service.characteristicDelegate('temperature'),
          humidityDelegate: gpioAccessory.humidityService.characteristicDelegate('humidity')
        }
      )
    }
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addDoorBell (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioDoorBell == null) {
      await import('./RpiService/GpioInput/GpioDoorBell.js')
    }
    gpioAccessory.service = new RpiService.GpioDoorBell(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addGarage (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioGarage == null) {
      await import('./RpiService/GpioOutput/GpioGarage.js')
    }
    gpioAccessory.service = new RpiService.GpioGarage(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addLeak (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioLeak == null) {
      await import('./RpiService/GpioInput/GpioLeak.js')
    }
    gpioAccessory.service = new RpiService.GpioLeak(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addLight (device) {
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioLight == null) {
      await import('./RpiService/GpioLight.js')
    }
    gpioAccessory.service = new RpiService.GpioLight(gpioAccessory, device)
    gpioAccessory.historyService = new ServiceDelegate.History(
      gpioAccessory, {
        lightOnDelegate: gpioAccessory.service.characteristicDelegate('on'),
        lastLightOnDelegate: gpioAccessory.service.characteristicDelegate('lastActivation')
      }
    )
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addLock (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioLock == null) {
      await import('./RpiService/GpioOutput/GpioLock.js')
    }
    gpioAccessory.service = new RpiService.GpioLock(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addMotion (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioMotion == null) {
      await import('./RpiService/GpioInput/GpioMotion.js')
    }
    gpioAccessory.service = new RpiService.GpioMotion(gpioAccessory, device)
    gpioAccessory.historyService = new ServiceDelegate.History(
      gpioAccessory, {
        motionDelegate: gpioAccessory.service.characteristicDelegate('motion'),
        lastMotionDelegate: gpioAccessory.service.characteristicDelegate('lastActivation')
      }
    )
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addRocker (device) {
    this.checkGpio(device.gpio)
    this.map |= (1 << device.gpio)
    if (this.buttonAccessory == null) {
      this.buttonAccessory = new RpiAccessory.ButtonAccessory(this, device)
      this.gpioAccessories[device.gpio] = this.buttonAccessory
      setImmediate(() => { this.buttonAccessory.emit('initialised') })
    }
    await this.buttonAccessory.addRocker(device)
  }

  async addServo (device) {
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioServo == null) {
      await import('./RpiService/GpioServo.js')
    }
    gpioAccessory.service = new RpiService.GpioServo(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addSmoke (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioSmoke == null) {
      await import('./RpiService/GpioInput/GpioSmoke.js')
    }
    gpioAccessory.service = new RpiService.GpioSmoke(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addSwitch (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioSwitch == null) {
      await import('./RpiService/GpioOutput/GpioSwitch.js')
    }
    gpioAccessory.service = new RpiService.GpioSwitch(gpioAccessory, device)
    gpioAccessory.historyService = new ServiceDelegate.History(
      gpioAccessory, {
        onDelegate: gpioAccessory.service.characteristicDelegate('on'),
        lastOnDelegate: gpioAccessory.service.characteristicDelegate('lastActivation')
      }
    )
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addValve (device) {
    this.map |= (1 << device.gpio)
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioValve == null) {
      await import('./RpiService/GpioOutput/GpioValve.js')
    }
    gpioAccessory.service = new RpiService.GpioValve(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }
}

export { RpiAccessory }
