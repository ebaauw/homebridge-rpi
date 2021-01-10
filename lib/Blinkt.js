// homebridge-rpi/lib/Blinkt.js
// Copyright © 2019-2021 Erik Baauw.  All rights reserved.
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
class Blinkt extends events.EventEmitter {
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
    super()
    this._pi = pi
    this._clk = params.gpioClock == null ? 24 : params.gpioClock
    this._dat = params.gpioData == null ? 23 : params.gpioData
    this._nLeds = params.nLeds == null ? 8 : params.nLeds

    this._buffer = Buffer.alloc(16)
    this._buffer.writeUInt32LE(PigpioClient.commands.WRITE, 0)
    this._buffer.writeUInt32LE(0, 12)

    this._leds = []
  }

  /** Initialise GPIO pins and turn off all LEDs.
    */
  async init () {
    await this._pi.command(PigpioClient.commands.MODES, this._clk, 1)
    await this._pi.command(PigpioClient.commands.MODES, this._dat, 1)
    this.setAllLeds()
    await this.update()
  }

  get connected () { return this._connected }

  /** Make a connection to the pigpio socket for sending commands.
    * @throws `Error` - When connection fails.
    * @emits connect
    */
  async connect () {
    this._socket = net.createConnection(this._pi.port, this._pi.hostname)
    this._socket
      .on('data', (data) => {})
      .on('error', () => { this._disconnect() })
      .on('close', () => { this._disconnect() })
    await events.once(this._socket, 'ready')
    /** Emitted when client has connected to the pigpio socket.
      * @event Blinkt#connect
      * @param {string} hostname - The hostname of the pigpio socket.
      * @param {int} port - The port of the pigpio socket.
      */
    this.emit('connect', this._pi.hostname, this._pi.port)
    this._connected = true
  }

  /** Turn off all LEDs and close socket to pigpiod.
    * @throws `Error` - When disconnect fails.
    * @emits disconnect
    */
  async disconnect () {
    this.setAllLeds()
    await this.update()
    if (this._socket) {
      this._socket.setTimeout(500)
      await events.once(this._socket, 'timeout')
      await this.update()
    }
    this._disconnect()
  }

  _disconnect () {
    if (this._socket != null) {
      this._socket.destroy()
      this._socket.removeAllListeners()
      delete this._socket
    }
    if (this._connected) {
      /** Emitted when client has disconnected from the pigpio socket.
        * @event Blinkt#disconnect
        * @param {string} hostname - The hostname of the pigpio socket.
        * @param {int} port - The port of the pigpio socket.
        */
      this.emit('disconnect', this._pi.hostname, this._pi.port)
      this._connected = false
    }
  }

  /** Set all LED states to brightness and colour.
    *
    * @param {int} [bri=0] - Brightness between 0 and 31.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    */
  setAllLeds (bri = 0, r = 0, g = 0, b = 0) {
    for (let id = 0; id < this._nLeds; id++) {
      this._leds[id] = [bri & 0x1F, b & 0xFF, g & 0xFF, r & 0xFF]
    }
  }

  /** Set LED state to brightness and colour.
    *
    * @param {int} id - The LED id, between 0 and nLeds.
    * @param {int} [bri=0] - Brightness between 0 and 31.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    */
  setLed (id, bri = 0, r = 0, g = 0, b = 0) {
    this._leds[id] = [bri & 0x1F, b & 0xFF, g & 0xFF, r & 0xFF]
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
      this._leds.push([bri & 0x1F, b & 0xFF, g & 0xFF, r & 0xFF])
    } else {
      this._leds.pop()
      this._leds.unshift([bri & 0x1F, b & 0xFF, g & 0xFF, r & 0xFF])
    }
  }

  /** Write the LED states to the Blinkt!.
    */
  async update () {
    if (this._socket == null) {
      await this.connect()
    }
    await this._latch(32)
    for (let id = 0; id < this._nLeds; id++) {
      const led = this._leds[id]
      /** Emitted when client has disconnected from the pigpio socket.
        * @event Blinkt#led
        * @param {int} id - The LED id, between 0 and nLeds.
        * @param {int} bri - Brightness between 0 and 31.
        * @param {int} r - Red, between 0 and 255.
        * @param {int} g - Green, between 0 and 255.
        * @param {int} b - Blue, between 0 and 255.
        */
      this.emit('led', id, led[0], led[3], led[2], led[1])
      await this._send(0xE0 | led[0])
      await this._send(led[1])
      await this._send(led[2])
      await this._send(led[3])
    }
    await this._latch(36)
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
    if (this._socket == null) {
      return
    }
    return new Promise((resolve, reject) => {
      this._buffer.writeUInt32LE(gpio, 4)
      this._buffer.writeUInt32LE(value, 8)
      /** Emitted when writing a request to the pigpio socket.
        * @event PigpioClient#request
        * @param {Buffer} request - The request.
        */
      this.emit('request', this._buffer)
      this._socket.write(this._buffer, () => {
        resolve()
      })
    })
  }
}

module.exports = Blinkt
