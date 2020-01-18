// homebridge-rpi/lib/Blinkt.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const events = require('events')
const net = require('net')
const PigpioClient = require('./PigpioClient')

/** Class to control a Pimoroni Blinkt! (or similar devices, like the LED of
  * the Pimoroni FanShim.
  * @see https://shop.pimoroni.com/products/blinkt
  * @see https://shop.pimoroni.com/products/fan-shim
  */
class Blinkt {
  /** Create a new socket to pigpiod for controlling the Blinkt!.
    *
    * @param {PigpioClient} pi - The Raspberry Pi with the Blinkt!.
    * @param {object} params - Parameters.
    * @param {int} [params.gpioClock=24] - GPIO pin for clock signal.<br>
    * The Blinkt! uses GPIO 24; the FanShim uses GPIO 14.
    * @param {int} [params.gpioData=23] - GPIO pin for data signal.<br>
    * The Blinkt! uses GPIO 23; the FanShim uses GPIO 15.
    * @param {int} [params.nLeds = 8] - Number of LEDs.
    * The Blinkt! has 8 LEDs; the FanShim has 1 LED.
    */
  constructor (pi, params = {}) {
    this._pi = pi
    this._clk = params.gpioClock == null ? 24 : params.gpioClock
    this._dat = params.gpioData == null ? 23 : params.gpioData
    this._nLeds = params.nLeds == null ? 8 : params.nLeds

    this._socket = net.createConnection(pi.port, pi.hostname)
    this._socket.on('data', (data) => {})
    // this._socket.setTimeout(1)
    this._buffer = Buffer.alloc(16)
    this._buffer.writeUInt32LE(PigpioClient.commands.WRITE, 0)
    this._buffer.writeUInt32LE(0, 12)

    this._leds = []
    this.setAllLeds()
  }

  /** Initialise GPIO pins and turn off all LEDs.
    */
  async init () {
    await this._pi.command(PigpioClient.commands.MODES, this._clk, 1)
    await this._pi.command(PigpioClient.commands.MODES, this._dat, 1)
    await this.update()
  }

  /** Turn off all LEDs and close socket to pigpiod.
    */
  async destroy () {
    this.setAllLeds()
    await this.update()
    this._socket.setTimeout(500)
    await events.once(this._socket, 'timeout')
    await this.update()
    this._socket.destroy()
  }

  /** Adjust brightness from 8 bits (0..255) to 5 bits (0..31), adding
    * 3 leading `1` bits.
    *
    * @param {int} bri - Brightness.
    * @returns {int} brightness byte
    */
  _adjustBri (bri) {
    if (bri > 0 && bri < 0x08) {
      return 0xE1
    }
    bri >>= 3
    bri |= 0xE0
    return bri
  }

  /** Set all LED states to brightness and colour.
    *
    * @param {int} id - The LED id, between 0 and nLeds.
    * @param {int} [bri=0] - Brightness between 0 and 255.<br>
    * Note that the LED only supports 32 brightness levels;
    * the least significant three bits are ignored.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    */
  setAllLeds (bri = 0, r = 0, g = 0, b = 0) {
    bri = this._adjustBri(bri)
    for (let id = 0; id < this._nLeds; id++) {
      this._leds[id] = [bri, b, g, r]
    }
  }

  /** Set LED state to brightness and colour.
    *
    * @param {int} id - The LED id, between 0 and nLeds.
    * @param {int} [bri=0] - Brightness between 0 and 255.<br>
    * Note that the LED only supports 32 brightness levels;
    * the least significant three bits are ignored.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    */
  setLed (id, bri = 0, r = 0, g = 0, b = 0) {
    this._leds[id] = [this._adjustBri(bri), b, g, r]
  }

  /** Rotate the LED states.
    *
    * @param {boolean} [left=false] - Rotate direction.
    */
  rotateLeds (left = false) {
    if (left) {
      this._leds.push(this._leds.shift())
    } else {
      this._leds.unshift(this._leds.pop())
    }
  }

  /** Shift the LED states (filling in the emptied LED).
    *
    * @param {boolean} [left=false] - Shift direction.
    * @param {int} [bri=0] - Brightness for emptied LED.
    * @param {int} [r=0] - Red for emptied LED.
    * @param {int} [g=0] - Green for emptied LED.
    * @param {int} [b=0] - Blue for emptied LED.
    */
  shiftLeds (left = false, bri = 0, r = 0, g = 0, b = 0) {
    if (left) {
      this._leds.shift()
      this._leds.push([this._adjustBri(bri), b, g, r])
    } else {
      this._leds.pop()
      this._leds.unshift([this._adjustBri(bri), b, g, r])
    }
  }

  /** Write the LED states to the Blinkt!.
    */
  async update () {
    await this._latch(32)
    for (let id = 0; id < this._nLeds; id++) {
      const led = this._leds[id]
      await this._send(led[0])
      await this._send(led[1])
      await this._send(led[2])
      await this._send(led[3])
    }
    await this._latch(36)
    // await events.once(this._socket, 'timeout')
  }

  /** Send a single byte to the Blinkt!.
    *
    * @param {int} byte - The byte to send.
    */
  async _send (byte) {
    byte &= 0xFF
    // console.log('write: 0x%s', ('00' + byte.toString(16)).slice(-2))
    for (let bit = 7; bit >= 0; bit--) {
      await this._setPin(this._dat, (byte & (1 << bit)) >> bit)
      await this._setPin(this._clk, 1)
      await this._setPin(this._clk, 0)
    }
  }

  /** Send a sequence of `0` bits.
    *
    * @param {int} n - Number of bits to send.
    */
  async _latch (n) {
    await this._setPin(this._dat, 0)
    do {
      await this._setPin(this._clk, 1)
      await this._setPin(this._clk, 0)
    } while (--n > 0)
  }

  /** Set a GPIO pin.
    *
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
