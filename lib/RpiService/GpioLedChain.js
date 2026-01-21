// homebridge-rpi/lib/RpiService/GpioLedChain.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { Colour } from 'homebridge-lib/Colour'
import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { RpiService } from '../RpiService.js'

const { hsvToRgb } = Colour

class GpioLedChain extends ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Lightbulb
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.ledChain = gpioAccessory.ledChain
    this.ledId = params.subtype
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      value: false,
      setter: async (value) => {
        return this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'bri',
      Characteristic: this.Characteristics.hap.Brightness,
      value: 100,
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
      key: 'index',
      Characteristic: this.Characteristics.hap.ServiceLabelIndex,
      value: params.subtype + 1
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
    this.values.briChange = 0

    if (this.ledId === 0) {
      this.addCharacteristicDelegate({
        key: 'colorLoop',
        Characteristic: this.Characteristics.my.ColorLoop
      }).on('didSet', async (value, fromHomeKit) => {
        if (!fromHomeKit) {
          return
        }
        this.values.cylon = false
        await this.ledChain.stop()
        this.ledChain.setAllLeds()
        await this.ledChain.update()
        if (value) {
          this.ledChain.colorloop().catch((error) => {
            this.warn(error)
          })
        }
      })
      this.addCharacteristicDelegate({
        key: 'cylon',
        Characteristic: this.Characteristics.my.CylonEffect
      }).on('didSet', async (value, fromHomeKit) => {
        if (!fromHomeKit) {
          return
        }
        this.values.colorLoop = false
        await this.ledChain.stop()
        this.ledChain.setAllLeds()
        await this.ledChain.update()
        if (value) {
          this.ledChain.cylon().catch((error) => {
            this.warn(error)
          })
        }
      })
    }
  }

  update (update = true) {
    if (this.timer != null) {
      return
    }
    this.timer = setTimeout(async () => {
      this.values.bri = Math.max(1, Math.min(this.values.bri + this.values.briChange, 100))
      const bri = this.values.on
        ? Math.round(this.values.bri * 255 / 100)
        : 0
      let { r, g, b } = hsvToRgb(this.values.hue, this.values.sat)
      r = Math.round(r * 255)
      g = Math.round(g * 255)
      b = Math.round(b * 255)
      this.debug('set bri to %d, rgb to {%d, %d, %d}', bri, r, g, b)
      try {
        this.ledChain.setLed(this.ledId, bri, r, g, b)
        if (update) {
          await this.ledChain.update()
        }
      } catch (error) {
        this.warn(error)
      }
      delete this.timer
    }, this.platform.config.resetTimeout)
  }
}

RpiService.GpioLedChain = GpioLedChain
