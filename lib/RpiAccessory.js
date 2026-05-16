// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { toHexString } from 'homebridge-lib'
import { AccessoryDelegate } from 'homebridge-lib/AccessoryDelegate'
import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'
import 'homebridge-lib/ServiceDelegate/History' // TODO: import on-demand
import { readdir } from 'node:fs/promises'

import { RpiInfo } from 'hb-rpi-tools/RpiInfo'

import { RpiService } from './RpiService.js'
import { isDs18b20SensorId } from './W1.js'
import './RpiService/RpiFan.js' // TODO: import on-demand
import './RpiService/RpiPowerLed.js' // TODO: import on-demand
import './RpiService/RpiSmokeSensor.js' // TODO: import on-demand
import './RpiService/RpiUsbPower.js' // TODO: import on-demand

let LedChainClient

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
        this.log('connected to %s:%s', hostname, port)
      })
      .on('ready', async () => {
        try {
          await this.init()
        } catch (error) {
          this.warn(error)
        }
      })
      .on('disconnect', (hostname, port) => {
        this.log('disconnected from %s:%s', hostname, port)
        this.setFault(true)
        for (const key in this.gpioAccessories) {
          this.gpioAccessories[key].setFault(true)
        }
      })
      .on('command', (cmd, params) => {
        this.vdebug('command %s %j', this.pi.commandName(cmd), params)
      })
      .on('response', (cmd, result) => {
        this.vdebug('command %s => %s', this.pi.commandName(cmd), result)
      })
      .on('send', (data) => { this.vvdebug('send: %j', toHexString(data)) })
      .on('data', (data) => { this.vvdebug('recv: %j', toHexString(data)) })
      .on('message', (message) => { this.debug(message) })
      .on('listen', (map) => {
        this.debug('listen map: [%s]', this.pi.vmap(map))
      })
      .on('notification', (payload) => {
        this.vdebug(
          'gpio map: [%s]%s%s%s', this.pi.vmap(payload.map),
          payload.tick == null ? '' : ', tick: ' + payload.tick,
          payload.flags == null
            ? ''
            : ', flags: 0x' + toHexString(payload.flags, 2),
          payload.seqno == null ? '' : ', seqno: ' + payload.seqno
        )
      })
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
    this.gpioAccessories = {}
    this.usedGpios = {}
    this.usesW1 = false
    this.w1Devices = []
    this.w1BaseName = null

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
    try {
      await this.pi.listen()
    } catch (error) {
      this.warn(error)
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
        if (this.usesW1) {
          this.w1Devices = []
          try {
            const localW1Devices = await readdir('/sys/bus/w1/devices')
            for (const sensorId of localW1Devices) {
              if (isDs18b20SensorId(sensorId)) {
                this.w1Devices.push(sensorId)
              } else {
                this.vdebug('1-wire: ignoring non-DS18B20 entry: %s', sensorId)
              }
            }
            if (this.w1Devices.length > 0) {
              this.vdebug('1-wire sensors: %j', this.w1Devices)
            }
          } catch (error) {
            this.debug('1-wire discovery failed: %s', error)
          }
        }
        if (this.usesGpio) {
          try {
            await this.pi.command(this.pi.commands.TICK)
          } catch (error) {
            this.warn(error)
          }
        }
      } else { // Remote Pi
        if (
          this.hidden && this.powerLedService == null && this.fanService == null &&
          !this.usesW1
        ) {
          await this.pi.command(this.pi.commands.TICK)
        } else {
          await this.pi.shell('getState')
          const text = await this.pi.readFile('/tmp/getState.json')
          this.vdebug('raw state: %s', text)
          try {
            const remoteState = JSON.parse(text)
            if (Array.isArray(remoteState.w1Devices)) {
              this.w1Devices = []
              for (const sensorId of remoteState.w1Devices) {
                if (isDs18b20SensorId(sensorId)) {
                  this.w1Devices.push(sensorId)
                } else {
                  this.vdebug('1-wire: ignoring non-DS18B20 entry: %s', sensorId)
                }
              }
            } else {
              this.w1Devices = []
            }
            if (this.w1Devices.length > 0) {
              this.vdebug('1-wire sensors: %j', this.w1Devices)
            }
          } catch (error) {
            this.w1Devices = []
          }
          state = RpiInfo.parseState(text)
          if (state.swap == null && !this.warned) {
            this.warn('old getState script on the remote Raspberry Pi')
            this.warned = true
          }
        }
      }
      await this.addDiscoveredDs18b20()
      if (state != null) {
        this.debug('state: %j', state)
      }
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
      LedChainClient = await import('hb-rpi-tools/LedChainClient')
    }
    if (device.device === 'p9813') {
      if (LedChainClient.P9813 == null) {
        await import('hb-rpi-tools/LedChainClient/P9813')
      }
    } else {
      if (LedChainClient.Blinkt == null) {
        await import('hb-rpi-tools/LedChainClient/Blinkt')
      }
    }
    const ledChainAccessory = new RpiAccessory.LedChainAccessory(this, device)
    this.gpioAccessories[device.gpioClock] = ledChainAccessory
  }

  async addButton (device) {
    this.checkGpio(device.gpio)
    if (this.buttonAccessory == null) {
      if (RpiAccessory.ButtonAccessory == null) {
        await import('./RpiAccessory/ButtonAccessory.js')
      }
      this.buttonAccessory = new RpiAccessory.ButtonAccessory(this, device)
      this.gpioAccessories[device.gpio] = this.buttonAccessory
    }
    await this.buttonAccessory.addButton(device)
  }

  async addCarbonMonoxide (device) {
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioCarbonMonoxide == null) {
      await import('./RpiService/GpioInput/GpioCarbonMonoxide.js')
    }
    gpioAccessory.service = new RpiService.GpioCarbonMonoxide(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addContact (device) {
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
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioDht == null) {
      await import('./RpiService/GpioDht.js')
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

  async addDs18b20 (device) {
    this.usesW1 = true
    if (device.sensorId == null) {
      if (this.w1BaseName != null) {
        throw new Error('duplicate auto-discovery DS18B20 entry')
      }
      this.w1BaseName = device.name == null
        ? '1-Wire Temperature Sensor'
        : device.name
      return
    }
    if (!isDs18b20SensorId(device.sensorId)) {
      throw new Error(`${device.sensorId}: invalid sensorId`)
    }
    await this.addW1Accessory(device)
  }

  async addW1Accessory (device) {
    if (this.gpioAccessories[device.sensorId] != null) {
      throw new Error(`${device.sensorId}: duplicate sensorId`)
    }
    if (RpiAccessory.W1Accessory == null) {
      await import('./RpiAccessory/W1Accessory.js')
    }
    const w1Accessory = new RpiAccessory.W1Accessory(this, device)
    this.gpioAccessories[device.sensorId] = w1Accessory
    if (RpiService.W1Temperature == null) {
      await import('./RpiService/W1Temperature.js')
    }
    w1Accessory.service = new RpiService.W1Temperature(w1Accessory, device)
    if (w1Accessory.service.values.temperature == null) {
      w1Accessory.service.characteristicDelegate('temperature').once('didSet', () => {
        w1Accessory.historyService = new ServiceDelegate.History(
          w1Accessory, {
            temperatureDelegate: w1Accessory.service.characteristicDelegate('temperature')
          }
        )
      })
    } else {
      w1Accessory.historyService = new ServiceDelegate.History(
        w1Accessory, {
          temperatureDelegate: w1Accessory.service.characteristicDelegate('temperature')
        }
      )
    }
    setImmediate(() => { w1Accessory.emit('initialised') })
  }

  async addDiscoveredDs18b20 () {
    if (this.w1BaseName == null) {
      return
    }
    for (const sensorId of this.w1Devices) {
      if (this.gpioAccessories[sensorId] != null) {
        continue
      }
      await this.addW1Accessory({
        device: 'ds18b20',
        sensorId,
        name: `${this.w1BaseName} ${sensorId}`
      })
    }
  }

  async addDoorBell (device) {
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioDoorBell == null) {
      await import('./RpiService/GpioInput/GpioDoorBell.js')
    }
    gpioAccessory.service = new RpiService.GpioDoorBell(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addFan (device) {
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioFan == null) {
      await import('./RpiService/GpioFan.js')
    }
    gpioAccessory.service = new RpiService.GpioFan(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addGarage (device) {
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioGarage == null) {
      await import('./RpiService/GpioOutput/GpioGarage.js')
    }
    gpioAccessory.service = new RpiService.GpioGarage(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addLeak (device) {
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
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioLock == null) {
      await import('./RpiService/GpioOutput/GpioLock.js')
    }
    gpioAccessory.service = new RpiService.GpioLock(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addMotion (device) {
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
    if (this.buttonAccessory == null) {
      if (RpiAccessory.ButtonAccessory == null) {
        await import('./RpiAccessory/ButtonAccessory.js')
      }
      this.buttonAccessory = new RpiAccessory.ButtonAccessory(this, device)
      this.gpioAccessories[device.gpio] = this.buttonAccessory
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
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioSmoke == null) {
      await import('./RpiService/GpioInput/GpioSmoke.js')
    }
    gpioAccessory.service = new RpiService.GpioSmoke(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }

  async addSwitch (device) {
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
    const gpioAccessory = await this.createGpioAccessory(device)
    if (RpiService.GpioValve == null) {
      await import('./RpiService/GpioOutput/GpioValve.js')
    }
    gpioAccessory.service = new RpiService.GpioValve(gpioAccessory, device)
    setImmediate(() => { gpioAccessory.emit('initialised') })
  }
}

export { RpiAccessory }
