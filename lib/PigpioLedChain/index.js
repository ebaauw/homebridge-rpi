// homebridge-rpi/lib/PigpioLedChain/index.js
// Copyright © 2019-2023 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const events = require('events')
const PigpioClient = require('../PigpioClient')

/** Abstract superclass to control a chain of LEDs using data and clock signals.
  *
  * @extends EventEmitter
  */
class PigpioLedChain extends events.EventEmitter {
  static get Blinkt () { return require('./Blinkt') }
  static get P9813 () { return require('./P9813') }

  /** Create a new socket to pigpiod for controlling the LED chain
    *
    * @param {PigpioClient} pi - The Raspberry Pi with the LED chain.
    * @param {object} params - Parameters.
    * @param {int} [params.gpioClock=24] - GPIO pin for clock signal.<br>
    * The Blinkt! uses GPIO 24; the FanShim uses GPIO 14.
    * @param {int} [params.gpioData=23] - GPIO pin for data signal.<br>
    * The Blinkt! uses GPIO 23; the FanShim uses GPIO 15.
    * @param {int} [params.nLeds = 8] - Number of LEDs.
    * The Blinkt! has 8 LEDs; the FanShim has 1 LED.
    */
  constructor (pi, params = {}) {
    super()
    this._pi = pi
    this._clk = params.gpioClock == null ? 24 : params.gpioClock
    this._dat = params.gpioData == null ? 23 : params.gpioData
    this._nLeds = params.nLeds == null ? 8 : params.nLeds

    this._leds = []

    this._initBuffer()
  }

  /** Initialise GPIO pins and update all LEDs.
    * @param {boolean} [turnOff=false] - Turn LEDs off.
    */
  async init (turnOff = false) {
    const mode = PigpioClient.modeValues.OUTPUT
    await this._pi.command(PigpioClient.commands.MODES, this._clk, mode)
    await this._pi.command(PigpioClient.commands.MODES, this._dat, mode)
    if (turnOff) {
      this.setAllLeds()
    }
    await this.update()
  }

  /** Close socket to pigpiod.
    * @param {boolean} [turnOff=false] - Turn LEDs off.
    * @throws `Error` - When disconnect fails.
    * @emits disconnect
    */
  async disconnect (turnOff = false) {
    if (turnOff) {
      this.setAllLeds()
      await this.update()
    }
  }

  /** Set all LED states to brightness and colour.
    *
    * @param {int} [bri=0] - Brightness between 0 and 255.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    */
  setAllLeds (bri = 0, r = 0, g = 0, b = 0) {
    for (let id = 0; id < this._nLeds; id++) {
      this._leds[id] = this._encode(bri, r, g, b)
    }
  }

  /** Set LED state to brightness and colour.
    *
    * @param {int} id - The LED id, between 0 and nLeds.
    * @param {int} [bri=0] - Brightness between 0 and 255.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    */
  setLed (id, bri = 0, r = 0, g = 0, b = 0) {
    this._leds[id] = this._encode(bri, r, g, b)
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
      this._leds.push(this._encode(bri, r, g, b))
    } else {
      this._leds.pop()
      this._leds.unshift(this._encode(bri, r, g, b))
    }
  }

  /** Write the LED states to the LED chain.
    */
  async update () {
    if (!this._pi.connected) {
      await this._pi.connect()
    }
    await this._sendWord(0x00000000)
    for (let id = 0; id < this._nLeds; id++) {
      const led = this._leds[id]
      this._notify(id, led)
      await this._sendWord(led)
    }
    await this._sendWord(0x00000000)
  }

  _initBuffer () {
    this._buffer = Buffer.alloc(16 * 3 * 32)
    let offset = 0

    for (let bit = 31; bit >= 0; bit--) {
      PigpioClient.writeCommand(
        this._buffer, PigpioClient.commands.WRITE, this._dat, 0, '', offset
      )
      PigpioClient.writeCommand(
        this._buffer, PigpioClient.commands.WRITE, this._clk, 1, '', offset + 16
      )
      PigpioClient.writeCommand(
        this._buffer, PigpioClient.commands.WRITE, this._clk, 0, '', offset + 32
      )
      offset += 16 * 3
    }
  }

  /** Send a single 32-bit word to the LED chain.
    *
    * @param {int} word - The four bytes to send.
    */
  async _sendWord (word) {
    word &= 0xFFFFFFFF
    let offset = 0
    for (let bit = 31; bit >= 0; bit--) {
      this._buffer.writeUInt32LE((word & (1 << bit)) ? 1 : 0, offset + 8)
      offset += 16 * 3
    }
    return this._pi.sendBuffer(this._buffer)
  }
}

module.exports = PigpioLedChain
