// homebridge-rpi/lib/PigpioLedChain/Blinkt.js
// Copyright © 2019-2025 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { GpioLedChain } from '../GpioLedChain.js'

/** Class to control a Pimoroni Blinkt! (or similar devices, like the LED of
  * the Pimoroni FanShim).
  * @see https://shop.pimoroni.com/products/blinkt
  * @see https://shop.pimoroni.com/products/fan-shim
  *
  * @extends PigpioLedChain
  */
class Blinkt extends GpioLedChain {
  /** Encode LED state.
    * @param {int} [bri=0] - Brightness between 0 and 255.
    * @param {int} [r=0] - Red, between 0 and 255.
    * @param {int} [g=0] - Green, between 0 and 255.
    * @param {int} [b=0] - Blue, between 0 and 255.
    * @return {int} Four bytes encoding bri, g, b, r.
    */
  _encode (bri, r, g, b) {
    bri &= 0xFF
    bri >>= 3
    bri |= 0xE0
    r &= 0xFF
    g &= 0xFF
    b &= 0xFF
    return (bri << 24) | (b << 16) | (g << 8) | r
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
      * @param {int} led.bri - Brightness between 0 and 31.
      * @param {int} led.r - Red, between 0 and 255.
      * @param {int} led.g - Green, between 0 and 255.
      * @param {int} led.b - Blue, between 0 and 255.
      */
    this.emit('led', id, {
      bri: (led & 0x1F000000) >> 24,
      r: led & 0x000000FF,
      g: (led & 0x0000FF00) >> 8,
      b: (led & 0x00FF0000) >> 16
    })
  }
}

GpioLedChain.Blinkt = Blinkt
