// homebridge-rpi/lib/RpiService/GpioBlinkt.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const { hsvToRgb } = homebridgeLib.Colour

class GpioBlinkt extends homebridgeLib.ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Lightbulb
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.blinkt = gpioAccessory.blinkt
    this.ledId = params.subtype
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      value: false,
      setter: async (value) => {
        this.values.bri = value ? 100 : 0
        return this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'bri',
      Characteristic: this.Characteristics.hap.Brightness,
      value: 0,
      unit: '%',
      setter: async (value) => { return this.update() }
    })
    this.addCharacteristicDelegate({
      key: 'briChange',
      Characteristic: this.Characteristics.my.BrightnessChange,
      value: 0,
      setter: async (value) => {
        this.update()
        setTimeout(() => {
          this.values.briChange = 0
        }, this.platform.config.resetTimeout)
      }
    })
    this.addCharacteristicDelegate({
      key: 'hue',
      Characteristic: this.Characteristics.hap.Hue,
      value: 0,
      unit: '°',
      setter: async (value) => { return this.update() }
    })
    this.addCharacteristicDelegate({
      key: 'sat',
      Characteristic: this.Characteristics.hap.Saturation,
      value: 0,
      unit: '%',
      setter: async (value) => { return this.update() }
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
    this.values.briChange = 0
  }

  update (update = true) {
    if (this.timer != null) {
      return
    }
    this.timer = setTimeout(async () => {
      const hkBri = Math.max(0, Math.min(this.values.bri + this.values.briChange, 100))
      this.values.on = hkBri > 0
      this.values.bri = hkBri
      const bri = Math.round(this.values.bri * 255 / 100)
      let { r, g, b } = hsvToRgb(this.values.hue, this.values.sat)
      r = Math.round(r * 255)
      g = Math.round(g * 255)
      b = Math.round(b * 255)
      this.debug('set bri to %d, rgb to {%d, %d, %d}', bri, r, g, b)
      try {
        this.blinkt.setLed(this.ledId, bri, r, g, b)
        if (update) {
          await this.blinkt.update()
        }
      } catch (error) {
        this.warn(error)
      }
      delete this.timer
    }, this.platform.config.resetTimeout)
  }
}

module.exports = GpioBlinkt
