// homebridge-rpi/lib/RpiPlatform.js
// Copyright © 2019-2023 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const os = require('os')
const PigpioClient = require('./PigpioClient')
const RpiAccessory = require('./RpiAccessory')

class RpiPlatform extends homebridgeLib.Platform {
  constructor (log, configJson, homebridge) {
    super(log, configJson, homebridge)
    this.once('heartbeat', async (beat) => { await this.init(beat) })

    this.config = {
      hosts: [
        {
          host: '127.0.0.1'
        }
      ],
      resetTimeout: 500,
      timeout: 15
    }
    const optionParser = new homebridgeLib.OptionParser(this.config, true)
    optionParser
      .stringKey('name')
      .stringKey('platform')
      .intKey('timeout', 1, 60)
      .arrayKey('hosts')
      .on('userInputError', (error) => {
        this.warn('config.json: %s', error)
      })
    try {
      optionParser.parse(configJson)
      this.rpiAccessories = {}
      this.gpioButtonAccessories = {}
      this.pigpioClients = {}
      const validHosts = []
      for (const i in this.config.hosts) {
        const host = this.config.hosts[i]
        const config = {
          port: 8888
        }
        const optionParser = new homebridgeLib.OptionParser(config, true)
        optionParser
          .stringKey('name')
          .hostKey()
          .boolKey('hidden')
          .boolKey('noFan')
          .boolKey('noPowerLed')
          .boolKey('noSmokeSensor')
          .boolKey('usbPower')
          .arrayKey('devices')
          .on('userInputError', (error) => {
            this.warn('config.json: hosts[%d]: %s', i, error)
          })
        optionParser.parse(host)
        if (config.hostname == null || config.port == null) {
          continue
        }
        if (config.name == null) {
          config.name = config.hostname === 'localhost'
            ? os.hostname().split('.')[0]
            : config.hostname
        }
        validHosts.push(config)
        const validDevices = []
        for (const j in config.devices) {
          const device = config.devices[j]
          const result = {}
          const parser = new homebridgeLib.OptionParser(result, true)
          const mandatoryKeys = []
          parser
            .stringKey('device')
            .stringKey('name')
            .on('userInputError', (error) => {
              this.warn('config.json: hosts[%d]: devices[%d]: %s', i, j, error)
            })
          switch (device.device) {
            // Input devices.
            case 'button':
              result.doublePressTimeout = 500 // ms
              result.longPressTimeout = 1000 // ms
              parser.intKey('doublePressTimeout', 0, 1000)
              parser.intKey('longPressTimeout', 0, 2000)
              /* falls through */
            case 'carbonmonoxide':
            case 'contact':
            case 'doorbell':
            case 'leak':
            case 'motion':
            case 'smoke':
              parser.boolKey('reversed')
              /* falls through */
            case 'rocker':
              result.debounceTimeout = 20 // ms
              parser.intKey('debounceTimeout', 0, 300)
              result.pull = 'up'
              parser.enumKey('pull')
              for (const pud in PigpioClient.pudValues) {
                parser.enumKeyValue('pull', pud)
              }
              mandatoryKeys.push('gpio')
              parser.intKey('gpio', 0, 31)
              break
            // Output devices.
            case 'blinkt':
              result.gpioClock = 24
              result.gpioData = 23
              result.nLeds = 8
              /* falls through */
            case 'p9813':
              if (device.device === 'p9813') {
                mandatoryKeys.push('gpioClock')
                mandatoryKeys.push('gpioData')
                result.nLeds = 1
              }
              parser
                .intKey('gpioClock', 0, 31)
                .intKey('gpioData', 0, 31)
                .intKey('nLeds', 1, 8)
              break
            case 'lock':
            case 'switch':
              parser.intKey('pulse', 20, 5000)
              /* falls through */
            case 'garage':
            case 'light':
            case 'valve':
              parser.boolKey('reversed')
              /* falls through */
            case 'dht':
            case 'servo':
              mandatoryKeys.push('gpio')
              parser.intKey('gpio', 0, 31)
              break
            case 'fanshim':
              break
            default:
              this.warn(
                'config.json: hosts[%d]: devices[%d]: device: invalid value',
                i, j
              )
              continue
          }
          parser.parse(device)
          if (result.device === 'fanshim') {
            validDevices.push({
              device: 'blinkt',
              name: 'FanShim LED',
              gpioClock: 14,
              gpioData: 15,
              nLeds: 1
            })
            validDevices.push({
              device: 'button',
              name: 'FanShim Button',
              gpio: 17,
              pull: 'up',
              debounceTimeout: 20,
              doublePressTimeout: 500,
              longPressTimeout: 1000
            })
            validDevices.push({
              device: 'switch',
              name: 'FanShim Fan',
              gpio: 18
            })
            continue
          }
          for (const key of mandatoryKeys) {
            if (result[key] == null) {
              this.warn(
                'config.json: hosts[%d]: devices[%d]: %s: key missing',
                i, j, key
              )
              continue
            }
          }
          if (result.name == null) {
            result.name = result.device[0].toUpperCase() + result.device.slice(1)
          }
          validDevices.push(result)
        }
        config.devices = validDevices
      }
      this.config.hosts = validHosts
      if (this.config.hosts.length === 0) {
        this.config.hosts.push({
          host: 'localhost',
          name: os.hostname().split('.')[0]
        })
      }
    } catch (error) {
      this.fatal(error)
    }
    this.debug('config: %j', this.config)
  }

  async init (beat) {
    const jobs = []
    for (const host of this.config.hosts) {
      jobs.push(this.checkDevice(host))
    }
    for (const job of jobs) {
      await job
    }
    this.debug('initialised')
    this.emit('initialised')
  }

  async checkDevice (host) {
    this.debug('check %s at %s:%d', host.name, host.hostname, host.port)
    // Check that device has running pigpiod.
    const pi = new PigpioClient({
      host: host.hostname + ':' + host.port,
      timeout: this.config.timeout
    })
    pi
      .on('error', (error) => { this.warn('%s: %s', host.name, error) })
      .on('warning', (error) => { this.warn('%s: %s', host.name, error) })
      .on('connect', (hostname, port) => {
        this.log('%s: connected to %s:%s', host.name, hostname, port)
      })
      .on('disconnect', (hostname, port) => {
        this.log('%s: disconnected from %s:%s', host.name, hostname, port)
      })
      .on('command', (cmd, p1, p2, p3) => {
        this.debug(
          '%s: command %s %s %s %j', host.name,
          PigpioClient.commandName(cmd), p1, p2, p3
        )
      })
      .on('response', (cmd, status, result) => {
        this.debug(
          '%s: command %s => %s', host.name,
          PigpioClient.commandName(cmd), status
        )
      })
      .on('request', (request) => {
        this.vdebug('%s: request: %j', host.name, request)
      })
      .on('listen', (map) => {
        this.debug('%s: listen map: [%s]', host.name, PigpioClient.vmap(map))
      })
      .on('notification', (payload) => {
        this.vdebug(
          '%s: gpio map: [%s]%s%s%s', host.name, PigpioClient.vmap(payload.map),
          payload.tick == null ? '' : ', tick: ' + payload.tick,
          payload.flags == null
            ? ''
            : ', flags: 0x' + homebridgeLib.toHexString(payload.flags, 2),
          payload.seqno == null ? '' : ', seqno: ' + payload.seqno
        )
      })
      .on('data', (data) => { this.vdebug('%s: data: %j', host.name, data) })

    let cpuInfo
    if (host.hostname === 'localhost' || host.hostname === '127.0.0.1') {
      if (!this.systemInfo.hwInfo.isRpi) {
        this.warn('localhost: not a Rapsberry Pi')
        return
      }
      try {
        const sched = await this.systemInfo.readTextFile('/proc/1/sched')
        if (!sched.startsWith('systemd (1, #threads: 1)')) {
          this.warn('localhost: runnning inside a container')
          return
        }
      } catch (error) {}
      try {
        await this.systemInfo.exec('vcgencmd', 'measure_temp')
      } catch (error) {
        this.warn('localhost: %s', error)
        return
      }
      this.localId = this.systemInfo.hwInfo.id
      cpuInfo = this.systemInfo.hwInfo
      if (host.devices.length > 0) {
        try {
          await pi.connect()
        } catch (error) {
          this.warn('%s: %s', host.name, error)
        }
      }
    } else {
      try {
        const text = await pi.readFile('/proc/cpuinfo')
        cpuInfo = homebridgeLib.SystemInfo.parseRpiCpuInfo(text)
      } catch (error) {
        this.warn('%s: %s', host.name, error)
        await homebridgeLib.timeout(15000)
        return this.checkDevice(host)
      }
    }
    if (this.pigpioClients[cpuInfo.id] != null) {
      // Already found under another hostname.
      await pi.disconnect()
      return
    }
    this.pigpioClients[cpuInfo.id] = pi
    if (this.rpiAccessories[cpuInfo.id] == null) {
      this.log(
        '%s: %s - %s', host.name, cpuInfo.prettyName, cpuInfo.id
      )
      if (cpuInfo.id === this.localId && host.name !== 'localhost') {
        this.log('%s: localhost', host.name)
      }
      if (host.usbPower && !['B+', '2B', '3B', '3B+'].includes(cpuInfo.model)) {
        this.warn(
          '%s: Raspberry Pi %s: no USB power support',
          host.name, cpuInfo.model
        )
        host.usbPower = false
      }
      if (cpuInfo.model === '5' && host.devices.length > 0) {
        this.warn('%s: Raspberry Pi %s: no GPIO support', host.name, cpuInfo.mode)
        host.devices = []
      }
      if (['A', 'B', 'Zero', 'Zero W', 'Zero 2 W', '5'].includes(cpuInfo.model)) {
        host.noPowerLed = true
      }
      if (cpuInfo.model !== '5') {
        host.noFan = true
      }
      const rpiAccessory = new RpiAccessory(this, {
        name: host.name,
        id: cpuInfo.id,
        manufacturer: cpuInfo.manufacturer,
        model: 'Raspberry Pi ' + cpuInfo.model,
        // firmware: rpi.revision,
        hardware: cpuInfo.revision,
        category: this.Accessory.Categories.Other,
        pi,
        gpioMask: cpuInfo.gpioMask,
        hidden: host.hidden,
        noFan: host.noFan,
        noPowerLed: host.noPowerLed,
        noSmokeSensor: host.noSmokeSensor,
        usbPower: host.usbPower
      })
      this.rpiAccessories[cpuInfo.id] = rpiAccessory
      for (const device of host.devices) {
        try {
          switch (device.device) {
            case 'blinkt':
            case 'p9813':
              await rpiAccessory.addLedChain(device)
              break
            case 'button':
              await rpiAccessory.addButton(device)
              break
            case 'carbonmonoxide':
              await rpiAccessory.addCarbonMonoxide(device)
              break
            case 'contact':
              await rpiAccessory.addContact(device)
              break
            case 'dht':
              await rpiAccessory.addDht(device)
              break
            case 'doorbell':
              await rpiAccessory.addDoorBell(device)
              break
            case 'garage':
              await rpiAccessory.addGarage(device)
              break
            case 'leak':
              await rpiAccessory.addLeak(device)
              break
            case 'light':
              await rpiAccessory.addLight(device)
              break
            case 'lock':
              await rpiAccessory.addLock(device)
              break
            case 'motion':
              await rpiAccessory.addMotion(device)
              break
            case 'rocker':
              await rpiAccessory.addRocker(device)
              break
            case 'servo':
              await rpiAccessory.addServo(device)
              break
            case 'smoke':
              await rpiAccessory.addSmoke(device)
              break
            case 'switch':
              await rpiAccessory.addSwitch(device)
              break
            case 'valve':
              await rpiAccessory.addValve(device)
              break
          }
        } catch (error) {
          this.warn('ignoring %s %s: %s', host.name, device.name, error)
        }
      }
      await rpiAccessory.init()
    }
  }
}

module.exports = RpiPlatform
