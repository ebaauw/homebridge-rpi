// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const events = require('events')
const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('./PigpioClient')

class RpiService extends homebridgeLib.ServiceDelegate {
  static get GpioInput () { return GpioInput }
  static get GpioButton () { return GpioButton }
  static get GpioContact () { return GpioContact }
  static get GpioOutput () { return GpioOutput }
  static get GpioServo () { return GpioServo }
  static get GpioSwitch () { return GpioSwitch }
  static get GpioBlinkt () { return GpioBlinkt }

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

class GpioInput extends homebridgeLib.ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.pi.on('notification', (map) => {
      this.newGpioValue = (map & (1 << this.gpio)) !== 0
      if (params.reversed) {
        this.newGpioValue = !this.newGpioValue
      }
      if (this.debounceTimeout == null) {
        this.debounceTimeout = setTimeout(() => {
          delete this.debounceTimeout
          if (this.newGpioValue !== this.gpioValue) {
            this.gpioValue = this.newGpioValue
            this.emit('gpio', this.gpioValue)
          }
        }, 20)
      }
    })
  }

  async init () {
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, 0)
    await this.pi.command(PigpioClient.commands.PUD, this.gpio, 2)
  }
}

class GpioContact extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.ContactSensor
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'contact',
      Characteristic: this.Characteristics.hap.ContactSensorState
    })
    this.addCharacteristicDelegate({
      key: 'timesOpened',
      Characteristic: this.Characteristics.eve.TimesOpened,
      value: 0
      // silent: true
    })
    this.addCharacteristicDelegate({
      key: 'lastActivation',
      Characteristic: this.Characteristics.eve.LastActivation
      // silent: true
    })
    this.on('gpio', (value) => {
      this.debug('gpio %s', value)
      this.values.contact = value ? 1 : 0
    })
  }
}

class GpioButton extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.StatelessProgrammableSwitch
    params.subtype = params.index
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'buttonevent',
      Characteristic: this.Characteristics.hap.ProgrammableSwitchEvent
    })
    this.addCharacteristicDelegate({
      key: 'index',
      Characteristic: this.Characteristics.hap.ServiceLabelIndex,
      value: params.index
    })
    this.on('gpio', (value) => {
      const now = new Date()
      if (value) { // button released
        if (this.pressed != null) {
          const duration = now - this.pressed
          this.debug('button released after %d msec', duration)
          this.pressed = null
          if (duration > 1000) {
            this.values.buttonevent = 2 // long press
          } else if (this.singlePressTimeout != null) {
            clearTimeout(this.singlePressTimeout)
            delete this.singlePressTimeout
            this.released = null
            this.values.buttonevent = 1 // double press
          } else {
            this.released = now
            this.singlePressTimeout = setTimeout(() => {
              this.released = null
              delete this.singlePressTimeout
              this.values.buttonevent = 0 // single press
            }, 500)
          }
        }
      } else { // button pressed
        if (this.pressed == null) {
          if (this.released != null) {
            const duration = now - this.released
            this.debug('button pressed after %d msec', duration)
          } else if (this.pressed == null) {
            this.debug('button pressed')
          }
          this.released = null
          this.pressed = new Date()
        }
      }
    })
  }
}

class GpioOutput extends homebridgeLib.ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.pi.on('notification', (map) => {
      this.newGpioValue = (map & (1 << this.gpio)) !== 0
      if (this.newGpioValue !== this.gpioValue) {
        this.gpioValue = this.newGpioValue
        this.emit('gpio', this.gpioValue)
      }
    })
  }

  async init () {
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, 1)
  }
}

class GpioServo extends homebridgeLib.ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Switch
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        let pulseWidth = 0
        if (value) {
          this.values.targetTiltAngle = 0
          pulseWidth = 1500
        }
        await this.setPulseWidth(pulseWidth)
      }
    })
    this.addCharacteristicDelegate({
      key: 'currentTiltAngle',
      Characteristic: this.Characteristics.hap.CurrentTiltAngle,
      unit: '°'
    })
    this.addCharacteristicDelegate({
      key: 'targetTiltAngle',
      Characteristic: this.Characteristics.hap.TargetTiltAngle,
      unit: '°',
      setter: async (value) => {
        const pulseWidth = Math.round(2500 - ((value + 90) * 2000 / 180))
        await this.setPulseWidth(pulseWidth)
      }
    })
  }

  async init () {
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, 1)
    this.values.targetTiltAngle = 0
    await this.setPulseWidth(1500)
  }

  async heartbeat (beat) {
    try {
      const pulseWidth = await this.pi.command(PigpioClient.commands.GPW, this.gpio)
      if (pulseWidth === 0) {
        this.values.on = false
        return
      }
      this.values.on = true
      const angle = Math.round(((2500 - pulseWidth) * 180 / 2000) - 90)
      this.values.currentTiltAngle = angle
    } catch (error) {
      this.error(error)
    }
  }

  async shutdown () {
    await this.setPulseWidth(0)
  }

  async setPulseWidth (pulseWidth) {
    this.debug('set pulse width to %d', pulseWidth)
    await this.pi.command(PigpioClient.commands.SERVO, this.gpio, pulseWidth)
  }
}

class GpioSwitch extends GpioOutput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Switch
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        await this.pi.command(
          PigpioClient.commands.WRITE, this.gpio, value ? 1 : 0
        )
      }
    })
    this.on('gpio', (value) => {
      this.debug('gpio %s', value)
      this.values.on = value
    })
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
    this.values.on = false
    this.values.bri = 0
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
        this.blinkt.setLed(
          this.ledId, this.bri, this.rgb.r, this.rgb.g, this.rgb.b
        )
        await this.blinkt.update()
      } catch (error) {
        this.error(error)
      }
      // this.debug('set bri to %j, colour to %j done', this.bri, this.rgb)
      delete this.timer
      this.emit('updated')
    }, 20)
  }
}

module.exports = RpiService
