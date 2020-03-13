// homebridge-rpi/lib/RpiPlatform.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('./PigpioClient')
const RpiAccessory = require('./RpiAccessory')
const RpiRevision = require('./RpiRevision')

class RpiPlatform extends homebridgeLib.Platform {
  constructor (log, configJson, homebridge) {
    super(log, configJson, homebridge)
    if (configJson == null) {
      return
    }
    this.once('heartbeat', this.init)

    this.config = {
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
      if (this.config.hosts == null) {
        this.config.hosts = [{ host: 'localhost' }]
      }
      const validHosts = []
      for (const i in this.config.hosts) {
        const host = this.config.hosts[i]
        const config = {
          port: 8888
        }
        const optionParser = new homebridgeLib.OptionParser(config, true)
        optionParser.stringKey('name')
        optionParser.hostKey()
        optionParser.arrayKey('devices')
        optionParser.on('userInputError', (error) => {
          this.warn('config.json: hosts[%d]: %s', i, error)
        })
        optionParser.parse(host)
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
              parser.intKey('gpioClock', 1, 31)
              parser.intKey('gpioData', 1, 31)
              parser.intKey('nLeds', 1, 8)
              break
            case 'button':
            case 'contact':
            case 'switch':
              parser.boolKey('reversed')
              /* falls through */
            case 'servo':
              mandatoryKeys.push('gpio')
              parser.intKey('gpio', 1, 31)
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
    const pi = new PigpioClient({ host: host.hostname + ':' + host.port })
    pi.on('error', (error) => { this.warn('%s: %s', host.name, error) })
    pi.on('connect', () => { this.debug('%s: connect', host.name) })
    pi.on('disconnect', () => { this.debug('%s: disconnect', host.name) })
    // pi.on('command', (cmd, p1, p2, p3) => { this.debug('%s: command %s %s %s %s', host.name, cmd, p1, p2, p3) })
    // pi.on('response', (cmd, p1, p2) => { this.debug('%s: response %s %s %s', host.name, cmd, p1, p2) })
    // pi.on('request', (request) => { this.debug('%s: request: %j', host.name, request) })
    // pi.on('data', (data) => { this.debug('%s: data: %j', host.name, data) })
    let rpi
    let id = ''
    try {
      await pi.connect()
      const hwver = await pi.command(PigpioClient.commands.HWVER)
      rpi = new RpiRevision(hwver)
    } catch (error) {
      return
    }
    // Check that pigpiod has been configured.
    try {
      const cpuinfo = await pi.readFile('/proc/cpuinfo')
      const a = /Serial\s*: ([0-9a-f]{16})/.exec(cpuinfo)
      if (a != null) {
        id = a[1].toUpperCase()
      }
    } catch (error) {
      this.error('%s: %s', host.name, error)
    }
    if (this.pigpioClients[id] != null) {
      // Already found under another hostname.
      pi.disconnect()
      return
    }
    this.pigpioClients[id] = pi
    if (this.rpiAccessories[id] == null) {
      this.log(
        '%s: Raspberry Pi %s v%s (%s, %s) - %s', host.name, rpi.model,
        rpi.revision, rpi.processor, rpi.memory, id
      )
      const rpiAccessory = new RpiAccessory(this, {
        name: host.name,
        id: id,
        manufacturer: rpi.manufacturer,
        model: 'Raspberry Pi ' + rpi.model,
        // firmware: rpi.revision,
        hardware: rpi.revision,
        category: this.Accessory.Categories.Other,
        pi: pi
      })
      this.rpiAccessories[id] = rpiAccessory
      await rpiAccessory.heartbeat(0)
      let map = 0
      for (const device of host.devices) {
        switch (device.device) {
          case 'blinkt':
            await rpiAccessory.addBlinkt(device)
            break
          case 'button':
            map |= (1 << device.gpio)
            await rpiAccessory.addButton(device)
            break
          case 'contact':
            map |= (1 << device.gpio)
            await rpiAccessory.addContact(device)
            break
          case 'servo':
            await rpiAccessory.addServo(device)
            break
          case 'switch':
            map |= (1 << device.gpio)
            await rpiAccessory.addSwitch(device)
            break
        }
      }
      if (map !== 0) {
        this.debug('%s: map: %d', host.name, map)
        await pi.listen(map)
      }
      rpiAccessory.emit('initialised')
    }
  }
}

module.exports = RpiPlatform
