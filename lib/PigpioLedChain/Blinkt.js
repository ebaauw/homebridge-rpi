// homebridge-rpi/lib/Blinkt.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const PigpioLedChain = require('./index')

/** Class to control a Pimoroni Blinkt! (or similar devices, like the LED of
  * the Pimoroni FanShim.
  * @see https://shop.pimoroni.com/products/blinkt
  * @see https://shop.pimoroni.com/products/fan-shim
  */
class Blinkt extends PigpioLedChain {
  /** Encode values.
    * @param {int} [bri=0] - Brightness between 0 and 255.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    * @return {int[]} Four bytes encoding bri, g, b, r.
    */
  _encode (bri, r, g, b) {
    return [0xE0 | ((bri >> 3) & 0x1F), b & 0xFF, g & 0xFF, r & 0xFF]
  }
}

module.exports = Blinkt
