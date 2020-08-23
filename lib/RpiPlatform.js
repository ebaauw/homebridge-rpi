// homebridge-rpi/lib/RpiPlatform.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const os = require('os')
const PigpioClient = require('./PigpioClient')
const RpiAccessory = require('./RpiAccessory')
const RpiInfo = require('./RpiInfo')

class RpiPlatform extends homebridgeLib.Platform {
  constructor (log, configJson, homebridge) {
    super(log, configJson, homebridge)
    this.once('heartbeat', this.init)

    this.config = {
      resetTimeout: 500,
      timeout: 15
    }
    const optionParser = new homebridgeLib.OptionParser(this.config, true)
    optionParser.stringKey('name')
    optionParser.stringKey('platform')
    optionParser.intKey('timeout', 1, 60)
    optionParser.arrayKey('hosts')
    optionParser.on('userInputError', (error) => {
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
        optionParser.stringKey('name')
        optionParser.hostKey()
        optionParser.boolKey('hidden')
        optionParser.boolKey('noSmokeSensor')
        optionParser.arrayKey('devices')
        optionParser.on('userInputError', (error) => {
          this.warn('config.json: hosts[%d]: %s', i, error)
        })
        optionParser.parse(host)
        if (config.hostname == null || config.port == null) {
          continue
        }
        if (config.name == null) {
          config.name = config.hostname
        }
        validHosts.push(config)
        const validDevices = []
        for (const j in config.devices) {
          const device = config.devices[j]
          const result = {}
          const parser = new homebridgeLib.OptionParser(result, true)
          const mandatoryKeys = []
          parser.stringKey('device')
          parser.stringKey('name')
          switch (device.device) {
            case 'blinkt':
              result.gpioClock = 24
              result.gpioData = 23
              result.nLeds = 8
              parser.intKey('gpioClock', 0, 31)
              parser.intKey('gpioData', 0, 31)
              parser.intKey('nLeds', 1, 8)
              break
            case 'switch':
              parser.intKey('pulse', 20, 5000)
              /* falls through */
            case 'button':
            case 'contact':
            case 'smoke':
            case 'valve':
              parser.boolKey('reversed')
              /* falls through */
            case 'light':
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
          parser.on('userInputError', (error) => {
            this.warn('config.json: hosts[%d]: devices[%d]: %s', i, j, error)
          })
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
              gpio: 17
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
    } catch (error) {
      this.fatal(error)
    }
    this.debug('config: %j', this.config)
  }

  async init (beat) {
    await this.checkLocalhost()
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

  async checkLocalhost () {
    this.rpiInfo = new RpiInfo()
    this.rpiInfo.on('readFile', (fileName) => {
      this.debug('localhost: read file %s', fileName)
    })
    this.rpiInfo.on('exec', (cmd, args) => {
      this.debug('localhost: exec %s %s', cmd, args.join(' '))
    })
    let cpuInfo
    try {
      cpuInfo = await this.rpiInfo.getCpuInfo()
    } catch (error) {
      this.debug('localhost: %s', error)
      if (this.config.hosts.length === 0) {
        this.warn('localhost: not a Raspberry Pi')
      }
      return
    }
    this.debug(
      'localhost: Raspberry Pi %s v%s (%s, %s) - %s', cpuInfo.model,
      cpuInfo.revision, cpuInfo.processor, cpuInfo.memory, cpuInfo.id
    )
    if (this.config.hosts.length === 0) {
      this.config.hosts.push({
        host: 'localhost',
        name: os.hostname().split('.')[0]
      })
    }
    this.localCpuInfo = cpuInfo
    this.localId = cpuInfo.id
  }

  async checkDevice (host) {
    this.debug('check %s at %s:%d', host.name, host.hostname, host.port)
    // Check that device has running pigpiod.
    const pi = new PigpioClient({ host: host.hostname + ':' + host.port })
    pi.on('error', (error) => { this.warn('%s: %s', host.name, error) })
    pi.on('warning', (error) => { this.warn('%s: %s', host.name, error) })
    pi.on('connect', (hostname, port) => {
      this.log('%s: connected to %s:%s', host.name, hostname, port)
    })
    pi.on('disconnect', (hostname, port) => {
      this.log('%s: disconnected from %s:%s', host.name, hostname, port)
    })
    pi.on('command', (cmd, p1, p2, p3) => {
      this.debug(
        '%s: command %s %s %s %s', host.name,
        PigpioClient.commandName(cmd), p1, p2, p3
      )
    })
    pi.on('response', (cmd, status, result) => {
      this.debug(
        '%s: command %s => %s', host.name,
        PigpioClient.commandName(cmd), status
      )
    })
    pi.on('request', (request) => {
      this.vdebug('%s: request: %j', host.name, request)
    })
    pi.on('data', (data) => { this.vdebug('%s: data: %j', host.name, data) })

    let rpiInfo
    let cpuInfo
    if (host.hostname === 'localhost' || host.hostname === '127.0.0.1') {
      rpiInfo = this.rpiInfo
      cpuInfo = this.localCpuInfo
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
        cpuInfo = RpiInfo.parseCpuInfo(text)
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
        '%s: Raspberry Pi %s v%s (%s, %s) - %s', host.name, cpuInfo.model,
        cpuInfo.revision, cpuInfo.processor, cpuInfo.memory, cpuInfo.id
      )
      if (cpuInfo.id === this.localId && host.name !== 'localhost') {
        rpiInfo = this.rpiInfo
        this.log('%s: localhost', host.name)
      }
      const rpiAccessory = new RpiAccessory(this, {
        name: host.name,
        id: cpuInfo.id,
        manufacturer: cpuInfo.manufacturer,
        model: 'Raspberry Pi ' + cpuInfo.model,
        // firmware: rpi.revision,
        hardware: cpuInfo.revision,
        category: this.Accessory.Categories.Other,
        rpiInfo: rpiInfo,
        pi: pi,
        gpioMask: cpuInfo.gpioMask,
        hidden: host.hidden,
        noSmokeSensor: host.noSmokeSensor
      })
      this.rpiAccessories[cpuInfo.id] = rpiAccessory
      for (const device of host.devices) {
        try {
          switch (device.device) {
            case 'blinkt':
              await rpiAccessory.addBlinkt(device)
              break
            case 'button':
              await rpiAccessory.addButton(device)
              break
            case 'contact':
              await rpiAccessory.addContact(device)
              break
            case 'light':
              await rpiAccessory.addLight(device)
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
