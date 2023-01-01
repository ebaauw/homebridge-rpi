// homebridge-rpi/lib/RpiService/GpioInput/index.js
// Copyright © 2019-2023 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('../../PigpioClient')

class GpioInput extends homebridgeLib.ServiceDelegate {
  static get PigpioClient () { return PigpioClient }

  static get GpioButton () { return require('./GpioButton') }
  static get GpioCarbonMonoxide () { return require('./GpioCarbonMonoxide') }
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
    this.params = params
    this.gpio = params.gpio
    this.mode = PigpioClient.modeValues.INPUT
    this.pud = PigpioClient.pudValues[params.pull]
    this.debounceTimeout = params.debounceTimeout * 1000 // ms => µs

    this.pi.on('gpio' + this.gpio, (payload) => {
      if (this._gpioValue == null || this._tick == null) {
        this._gpioValue = payload.value
        this._tick = payload.tick
        this.vdebug(
          'gpio %d: %s initially',
          this.gpio, this._gpioValue ? 'high' : 'low'
        )
        this.emit('gpio', this._gpioValue)
        return
      }
      if (payload.watchDog || payload.value !== this._gpioValue) {
        if (payload.tick < this._tick) {
          // tick wraps on 2^32 - 1
          this.vdebug(
            'gpio %d: tick wrapped: %d -> %d', this.gpio, this._tick, payload.tick
          )
          this._tick -= 0x100000000
        }
        const duration = payload.tick - this._tick
        if (!payload.watchDog) {
          this._tick = payload.tick
        }
        this._gpioValue = payload.value
        this.vdebug(
          'gpio %d: %s%s after %d µs',
          this.gpio, payload.watchDog ? 'still ' : '',
          this._gpioValue ? 'high' : 'low', duration
        )
        this.update(this._gpioValue, duration, payload.watchDog)
      }
    })
  }

  async init () {
    this.debug(
      'initialising GPIO %d: mode: %d, pud: %j', this.gpio, this.mode, this.pud
    )
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, this.mode)
    await this.pi.command(PigpioClient.commands.PUD, this.gpio, this.pud)
    if (this.debounceTimeout > 0) {
      await this.pi.command(
        PigpioClient.commands.FG, this.gpio, this.debounceTimeout
      )
    }
  }

  async shutdown () {}
}

module.exports = GpioInput
