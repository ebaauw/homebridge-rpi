// homebridge-rpi/lib/PigpioLedChain/P9813.js
// Copyright © 2022-2023 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const PigpioLedChain = require('./index')

function adjust (c, bri) {
  return (((c & 0xFF) * (bri & 0xFF)) / 0xFF) & 0xFF
}
/** Class to control a chain of P9813-based LEDs, like the Grove Chainable LED.
  * @see https://github.com/Seeed-Studio/Grove_Chainable_RGB_LED
  *
  * @extends PigpioLedChain
  */
class P9813 extends PigpioLedChain {
  /** Encode LED state.
    * @param {int} [bri=0] - Brightness between 0 and 255.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    * @return {int} Four bytes encoding checksum, g, b, r.
    */
  _encode (bri, r, g, b) {
    r = adjust(r, bri)
    g = adjust(g, bri)
    b = adjust(b, bri)
    const sum = 0xC0 |
      ((g & 0xC0) >> 2) |
      ((b & 0xC0) >> 4) |
      ((r & 0xC0) >> 6)
    return (sum << 24) | (b << 16) | (g << 8) | r
  }

  /** Emit a `led` notification.
    * @param {int} id - The LED id, between 0 and nLeds.
    * @param {int} led - The four bytes encoding the LED state.
    */
  _notify (id, led) {
    /** Emitted when led is set.
      * @event PigpioLedChain#led
      * @param {int} id - The LED id, between 0 and nLeds.
      * @param {object} led - The LED state.
      * @param {int} led.r - Red, between 0 and 255.
      * @param {int} led.g - Green, between 0 and 255.
      * @param {int} led.b - Blue, between 0 and 255.
      */
    this.emit('led', id, {
      r: led & 0x000000FF,
      g: (led & 0x0000FF00) >> 8,
      b: (led & 0x00FF0000) >> 16
    })
  }
}

module.exports = P9813
