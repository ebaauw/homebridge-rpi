// homebridge-rpi/lib/PigpioClient.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const net = require('net')
const PigpioClient = require('./PigpioClient')

/** Class to control a Pimoroni Fan SHIM.
  * @see https://shop.pimoroni.com/products/fan-shim
  */
class FanShim {
  /** Create a new socket to pigpiod for controlling the LED on the Fan SHIM.
    * @param {PigpioClient} pi - The Raspberry Pi with the Fan SHIM.
    */
  constructor (pi) {
    this._socket = net.createConnection(pi.port, pi.hostname)
    this._buffer = Buffer.alloc(16)
    this._buffer.writeUInt32LE(PigpioClient.commands.WRITE, 0)
    this._buffer.writeUInt32LE(0, 12)

    this._clk = 14 // GPIO for LED clock.
    this._dat = 15 // GPIO for LED data.
    this._btn = 17 // GPIO for button.
    this._fan = 18 // GPIO for fan.
  }

  /** Close socket to pigpiod.
    */
  async destroy () {
    this._socket.destroy()
  }

  /** Set the fan.
    * @param {boolean} on - 0 for off, 1 for on
    */
  async setFan (on) {
    return this._setPin(this._fan, on ? 1 : 0)
  }

  /** Set led to brightness and colour.
    *
    * @param {int} bri - Brightness between 0 and 255.<br>
    * Note that the LED only supports 32 brightness levels;
    * the least significant three bits are ignored.
    * @param {int} r - Red, between 0 and 255.
    * @param {int} g - Green, between 0 and 255.
    * @param {int} b - Blue, between 0 and 255.
    */
  async setLed (bri, r, g, b) {
    bri >>= 3
    bri |= 0xE0
    await this._latch(32)
    await this._write(bri)
    await this._write(b)
    await this._write(g)
    await this._write(r)
    await this._latch(1)
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

module.exports = FanShim
