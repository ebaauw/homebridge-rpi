// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const events = require('events')
const homebridgeLib = require('homebridge-lib')
const FanShim = require('./FanShim')
const PigpioClient = require('./PigpioClient')

class RpiService extends homebridgeLib.ServiceDelegate {
  static get GpioSwitch () { return GpioSwitch }
  static get FanShimLed () { return FanShimLed }

  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name
    params.Service = rpiAccessory.Services.eve.TemperatureSensor
    super(rpiAccessory, params)
    this.addCharacteristicDelegate({
      key: 'temperature',
      Characteristic: this.Characteristics.eve.CurrentTemperature,
      unit: '°C'
    })
    this.addCharacteristicDelegate({
      key: 'temperatureUnit',
      Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
      value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
    })
    this.addCharacteristicDelegate({
      key: 'frequency',
      Characteristic: this.Characteristics.my.CpuFrequency,
      unit: 'MHz'
    })
    this.addCharacteristicDelegate({
      key: 'throttled',
      Characteristic: this.Characteristics.my.CpuThrottled
    })
    this.addCharacteristicDelegate({
      key: 'voltage',
      Characteristic: this.Characteristics.my.CpuVoltage,
      unit: 'V'
    })
    this.addCharacteristicDelegate({
      key: 'underVoltage',
      Characteristic: this.Characteristics.my.CpuUnderVoltage
    })
    this.addCharacteristicDelegate({
      key: 'load',
      Characteristic: this.Characteristics.my.CpuLoad
    })
    this.addCharacteristicDelegate({
      key: 'lastupdated',
      Characteristic: this.Characteristics.my.LastUpdated,
      silent: true
    })
  }

  checkState (state) {
    const throttled = parseInt(state.throttled, 16)
    this.values.temperature = state.temp
    this.values.frequency = Math.round(state.freq / 1000000)
    this.values.voltage = state.volt
    this.values.throttled = (throttled & 0x000e) !== 0
    this.values.underVoltage = (throttled & 0x0001) !== 0
    this.values.load = state.load
    this.values.lastupdated = String(new Date(state.date)).substr(0, 24)
  }
}

class GpioSwitch extends homebridgeLib.ServiceDelegate {
  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name + ' GPIO' + params.gpio
    params.Service = rpiAccessory.Services.hap.Switch
    super(rpiAccessory, params)
    this.pi = rpiAccessory.pi
    this.gpio = params.gpio
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        try {
          this.pi.command(
            PigpioClient.commands.WRITE, this.gpio, value ? 1 : 0
          )
        } catch (error) {
          this.error(error)
        }
      }
    })
  }

  checkMap (map) {
    this.values.on = (map & (1 << this.gpio)) !== 0
  }
}

function rgb (hue, sat) {
  // HSV to RGB
  // See: https://en.wikipedia.org/wiki/HSL_and_HSV
  let H = hue / 360.0
  const S = sat / 100.0
  const V = 1
  const C = V * S
  H *= 6
  const m = V - C
  let x = (H % 2) - 1.0
  if (x < 0) {
    x = -x
  }
  x = C * (1.0 - x)
  let R, G, B
  switch (Math.floor(H) % 6) {
    case 0: R = C + m; G = x + m; B = m; break
    case 1: R = x + m; G = C + m; B = m; break
    case 2: R = m; G = C + m; B = x + m; break
    case 3: R = m; G = x + m; B = C + m; break
    case 4: R = x + m; G = m; B = C + m; break
    case 5: R = C + m; G = m; B = x + m; break
  }
  return {
    r: Math.round(R * 255),
    g: Math.round(G * 255),
    b: Math.round(B * 255)
  }
}

class FanShimLed extends homebridgeLib.ServiceDelegate {
  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name + ' FanShim LED'
    params.Service = rpiAccessory.Services.hap.Lightbulb
    super(rpiAccessory, params)
    this.pi = rpiAccessory.pi // TODO open new socket
    this.fanshim = new FanShim(this.pi)
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      value: false,
      setter: async (value) => {
        this.characteristicDelegate('bri').setValue(value ? 255 : 0)
      }
    })
    this.addCharacteristicDelegate({
      key: 'bri',
      Characteristic: this.Characteristics.hap.Brightness,
      value: 0,
      unit: '%',
      setter: async (value) => {
        this.bri = Math.round(value * 255 / 100)
        this.update()
        await events.once(this, 'updated')
      }
    })
    this.addCharacteristicDelegate({
      key: 'hue',
      Characteristic: this.Characteristics.hap.Hue,
      value: 0,
      unit: '°',
      setter: async (value) => {
        this.rgb = rgb(value, this.values.sat)
        this.update()
        await events.once(this, 'updated')
      }
    })
    this.addCharacteristicDelegate({
      key: 'sat',
      Characteristic: this.Characteristics.hap.Saturation,
      value: 0,
      unit: '%',
      setter: async (value) => {
        this.rgb = rgb(this.values.sat, value)
        this.update()
        await events.once(this, 'updated')
      }
    })
    this.bri = Math.round(this.values.bri * 255 / 100)
    this.rgb = rgb(this.values.hue, this.values.sat)
  }

  update () {
    if (this.timer != null) {
      return
    }
    this.timer = setTimeout(async () => {
      this.debug('set bri to %j, colour to %j', this.bri, this.rgb)
      try {
        await this.fanshim.setLed(this.bri, this.rgb.r, this.rgb.g, this.rgb.b)
      } catch (error) {
        this.error(error)
      }
      this.debug('set bri to %j, colour to %j done', this.bri, this.rgb)
      delete this.timer
      this.emit('updated')
    }, 20)
  }
}

module.exports = RpiService
