// homebridge-rpi/lib/RpiService/GpioInput/index.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('../../PigpioClient')

class GpioInput extends homebridgeLib.ServiceDelegate {
  static get PigpioClient () { return PigpioClient }

  static get GpioButton () { return require('./GpioButton') }
  static get GpioContact () { return require('./GpioContact') }
  static get GpioDht () { return require('./GpioDht') }
  static get GpioDoorBell () { return require('./GpioDoorBell') }
  static get GpioLeak () { return require('./GpioLeak') }
  static get GpioMotion () { return require('./GpioMotion') }
  static get GpioRocker () { return require('./GpioRocker') }
  static get GpioSmoke () { return require('./GpioSmoke') }

  constructor (gpioAccessory, params = {}) {
    if (params.name == null) {
      params.name = gpioAccessory.name
    }
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.mode = PigpioClient.modeValues.INPUT
    this.pud = PigpioClient.pudValues[params.pull]
    this.debounceTimeout = params.debounceTimeout * 1000 // ms => µs

    this.pi.on('notification', (map, tick) => {
      const newGpioValue = (map & (1 << this.gpio)) !== 0
      if (this._gpioValue == null || this._previousTick == null) {
        this._gpioValue = newGpioValue
        this._previousTick = tick
        this.vdebug(
          'gpio %d: %s initially',
          this.gpio, this._gpioValue ? 'high' : 'low'
        )
        this.emit('gpio', this._gpioValue)
        return
      }
      if (newGpioValue !== this._gpioValue) {
        this._gpioValue = newGpioValue
        if (tick < this._previousTick) {
          // tick wraps on 2^32 - 1
          this.vdebug(
            'gpio %d: tick wrapped: %d -> %d', this.gpio, this._previousTick, tick
          )
          this._previousTick -= 0x100000000
        }
        const duration = tick - this._previousTick
        this.vdebug(
          'gpio %d: %s after %d µs',
          this.gpio, this._gpioValue ? 'high' : 'low', duration
        )
        if (duration <= this.debounceTimeout) {
          this.vdebug('gpio %d: debouncing', this.gpio)
          return
        }
        this._previousTick = tick
        this.emit('gpio', this._gpioValue, duration)
      }
    })
  }

  async init () {
    this.debug(
      'initialising GPIO %d: mode: %d, pud: %j', this.gpio, this.mode, this.pud
    )
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, this.mode)
    await this.pi.command(PigpioClient.commands.PUD, this.gpio, this.pud)
  }

  async shutdown () {}
}

module.exports = GpioInput
