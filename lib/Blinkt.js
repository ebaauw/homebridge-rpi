// homebridge-rpi/lib/Blinkt.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const net = require('net')
const PigpioClient = require('./PigpioClient')

/** Class to control a Pimoroni Blinkt (or the LED of the Pimoroni Fan SHIM).
  * @see https://shop.pimoroni.com/products/blinkt
  * @see https://shop.pimoroni.com/products/fan-shim
  */
class Blinkt {
  /** Create a new socket to pigpiod for controlling the Blinkt.
    * @param {PigpioClient} pi - The Raspberry Pi with the Blinkt.
    */
  constructor (pi, params) {
    this._pi = pi
    this._socket = net.createConnection(pi.port, pi.hostname)
    this._buffer = Buffer.alloc(16)
    this._buffer.writeUInt32LE(PigpioClient.commands.WRITE, 0)
    this._buffer.writeUInt32LE(0, 12)

    this._clk = params.gpioClock
    this._dat = params.gpioData

    this._nLeds = params.nLeds // TODO: implement

    this._leds = []
    for (let id = 0; id < this._nLeds; id++) {
      this._leds[id] = { bri: 0xE0, r: 0, g: 0, b: 0 }
    }
  }

  async init () {
    await this._pi.command(PigpioClient.commands.MODES, this._clk, 1)
    await this._pi.command(PigpioClient.commands.MODES, this._dat, 1)
  }

  /** Close socket to pigpiod.
    */
  async destroy () {
    this._socket.destroy()
  }

  /** Set LED to brightness and colour.
    *
    * @param {int} id - The LED id, between 0 and nLeds.
    * @param {int} bri - Brightness between 0 and 255.<br>
    * Note that the LED only supports 32 brightness levels;
    * the least significant three bits are ignored.
    * @param {int} r - Red, between 0 and 255.
    * @param {int} g - Green, between 0 and 255.
    * @param {int} b - Blue, between 0 and 255.
    */
  setLed (id, bri, r, g, b) {
    const led = this._leds[id]
    bri >>= 3
    bri |= 0xE0
    this._leds[id].bri = bri
    led.r = r
    led.g = g
    led.b = b
  }

  /**
    */
  async update () {
    await this._latch(32)
    for (let id = 0; id < this._nLeds; id++) {
      const led = this._leds[id]
      await this._write(led.bri)
      await this._write(led.b)
      await this._write(led.g)
      await this._write(led.r)
    }
    await this._latch(36)
  }

  /**
    */
  async _write (byte) {
    byte &= 0xFF
    // console.log('write: 0x%s', ('00' + byte.toString(16)).slice(-2))
    for (let bit = 7; bit >= 0; bit--) {
      await this._setPin(this._dat, (byte & (1 << bit)) >> bit)
      await this._setPin(this._clk, 1)
      await this._setPin(this._clk, 0)
    }
  }

  /**
    */
  async _latch (n) {
    await this._setPin(this._dat, 0)
    do {
      await this._setPin(this._clk, 1)
      await this._setPin(this._clk, 0)
    } while (--n > 0)
  }

  /** Set pin.
    * @param {int} gpio - The GPIO pin.
    * @param {0|1} value - The value.
    */
  async _setPin (gpio, value) {
    return new Promise((resolve, reject) => {
      this._buffer.writeUInt32LE(gpio, 4)
      this._buffer.writeUInt32LE(value, 8)
      this._socket.write(this._buffer, () => {
        resolve()
      })
    })
  }
}

module.exports = Blinkt
