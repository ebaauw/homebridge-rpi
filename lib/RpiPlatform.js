// homebridge-rpi/lib/RpiPlatform.js
// Copyright © 2019 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const Bonjour = require('bonjour-hap')
const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('./PigpioClient')
const RpiAccessory = require('./RpiAccessory')
const RpiRevision = require('./RpiRevision')

class RpiPlatform extends homebridgeLib.Platform {
  constructor (log, configJson, homebridge) {
    super(log, configJson, homebridge)
    this.on('accessoryRestored', this.accessoryRestored)
    this.once('heartbeat', this.init)
    this.on('heartbeat', this.heartbeat)
    if (configJson == null) {
      return
    }
    const optionParser = new homebridgeLib.OptionParser(this.config, true)
    optionParser.stringKey('name')
    optionParser.stringKey('platform')
    optionParser.intKey('timeout', 1, 60)
    optionParser.on('usageError', (message) => {
      this.warn('config.json: %s', message)
    })
    try {
      optionParser.parse(configJson)
      this.rpiAccessories = {}
      this.pigpioClients = {}
      const bonjour4 = new Bonjour()
      const browser4 = bonjour4.find({ type: 'rfb' })
      browser4.on('up', this.foundDevice.bind(this))
    } catch (error) {
      this.fatal(error)
    }
  }

  async init (beat) {
    this.debug('initialised')
    this.emit('initialised')
  }

  async heartbeat (beat) {
  }

  async accessoryRestored (className, version, id, name, context) {
    if (className !== 'RpiAccessory') {
      this.warn(
        'removing cached %s accessory %s',
        className, context.location
      )
      return
    }
    await this.checkDevice(name, context.hostname)
  }

  foundDevice (obj) {
    this.debug('found %s at %s', obj.name, obj.referer.address)
    return this.checkDevice(obj.name, obj.referer.address)
  }

  // TODO:
  // - Handle socket close (pigpio restart or pi reboot)
  // - Extra socket for FanShim LED?

  async checkDevice (name, hostname) {
    if (this.pigpioClients[hostname] != null) {
      return
    }
    this.debug('check %s at %s', name, hostname)
    // Check that device has running pigpiod.
    const pi = new PigpioClient({ host: hostname })
    this.pigpioClients[hostname] = pi
    let rpi
    let id = ''
    try {
      await pi.connect()
      const hwver = await pi.command(PigpioClient.commands.HWVER)
      rpi = new RpiRevision(hwver)
    } catch (error) {
      delete this.pigpioClients[hostname]
      return
    }
    // Check that pigpiod has been configured.
    try {
      const cpuinfo = await pi.readFile('/proc/cpuinfo')
      const a = /Serial\s*: ([0-9a-f]{16})/.exec(cpuinfo)
      if (a != null) {
        id = a[1].toUpperCase()
      }
      await pi.listen(1 << 18)
    } catch (error) {
      this.error('%s: %s', name, error)
    }
    if (this.rpiAccessories[id] == null) {
      this.log(
        '%s: Raspberry Pi %s v%s (%s, %s) - %s', name, rpi.model,
        rpi.revision, rpi.processor, rpi.memory, id
      )
      this.rpiAccessories[id] = new RpiAccessory(this, {
        name: name,
        id: id,
        manufacturer: rpi.manufacturer,
        model: 'Raspberry Pi ' + rpi.model,
        // firmware: rpi.revision,
        hardware: rpi.revision,
        category: this.Accessory.Categories.Other,
        pi: pi
      })
    }
  }
}

module.exports = RpiPlatform
