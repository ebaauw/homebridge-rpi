// homebridge-rpi/lib/Blinkt.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const PigpioLedChain = require('./index')

function adjust (c, bri) {
  return (((c & 0xFF) * (bri & 0xFF)) / 0xFF) & 0xFF
}
/** Class to control a chain of P9813-based LEDs, like the Grove Chainable LED.
  * @see https://github.com/Seeed-Studio/Grove_Chainable_RGB_LED
  */
class P9813 extends PigpioLedChain {
  /** Encode values.
    * @param {int} [bri=0] - Brightness between 0 and 255.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    * @return {int[]} Four bytes encoding checksum, g, b, r.
    */
  _encode (bri, r, g, b) {
    r = adjust(r, bri)
    g = adjust(g, bri)
    b = adjust(b, bri)
    const sum = 0xC0 |
      ((g & 0xC0) >> 2) |
      ((b & 0xC0) >> 4) |
      ((r & 0xC0) >> 6)
    return [sum, b, g, r]
  }
}

module.exports = P9813
