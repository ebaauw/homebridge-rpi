// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

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
    this.addCharacteristicDelegate({
      key: 'lastBoot',
      Characteristic: this.Characteristics.my.LastBoot
    })
    this.addCharacteristicDelegate({
      key: 'heartrate',
      Characteristic: this.Characteristics.my.Heartrate,
      props: {
        minValue: 1,
        maxValue: 60,
        minStep: 1
      },
      value: 15
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
  }

  checkState (state) {
    this.values.temperature = state.temp
    this.values.frequency = Math.round(state.freq / 1000000)
    this.values.voltage = state.volt
    this.values.throttled = (state.throttled & 0x000e) !== 0
    this.values.underVoltage = (state.throttled & 0x0001) !== 0
    this.values.load = state.load
    this.values.lastupdated = String(new Date(state.date)).slice(0, 24)
    this.values.lastBoot = String(new Date(state.boot)).slice(0, 24)
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
    this.debug('initialising GPIO %d', this.gpio)
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, 0)
    await this.pi.command(PigpioClient.commands.PUD, this.gpio, 2)
  }

  async shutdown () {}
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
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
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
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })

    this.on('gpio', (value) => {
      const now = new Date()
      if (value) { // button released
        if (this.pressed != null) {
          const duration = now - this.pressed
          this.debug('button released after %d msec', duration)
          this.pressed = null
          if (duration > 1000) {
            this.values.buttonevent =
              this.Characteristics.hap.ProgrammableSwitchEvent.LONG_PRESS
          } else if (this.singlePressTimeout != null) {
            clearTimeout(this.singlePressTimeout)
            delete this.singlePressTimeout
            this.released = null
            this.values.buttonevent =
              this.Characteristics.hap.ProgrammableSwitchEvent.DOUBLE_PRESS
          } else {
            this.released = now
            this.singlePressTimeout = setTimeout(() => {
              this.released = null
              delete this.singlePressTimeout
              this.values.buttonevent =
                this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
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
    this.debug('initialising GPIO %d', this.gpio)
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, 1)
  }

  async shutdown () {}
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
        this.values.pulseWidth = value
          ? Math.round(2500 - ((this.values.currentTiltAngle + 90) * 2000 / 180))
          : 0
        await this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'currentTiltAngle',
      Characteristic: this.Characteristics.hap.CurrentTiltAngle,
      unit: '°',
      value: 0
    })
    this.addCharacteristicDelegate({
      key: 'targetTiltAngle',
      Characteristic: this.Characteristics.hap.TargetTiltAngle,
      unit: '°',
      value: 0,
      setter: async (value) => {
        this.values.pulseWidth = Math.round(2500 - ((value + 90) * 2000 / 180))
        await this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'pulseWidth',
      value: 1500
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })
  }

  async init () {
    this.debug('initialising GPIO %d', this.gpio)
    await this.pi.command(PigpioClient.commands.MODES, this.gpio, 1)
    await this.update()
  }

  async heartbeat (beat) {
    try {
      if (!this.pi.connected) {
        return
      }
      this.values.pulseWidth = await this.pi.command(
        PigpioClient.commands.GPW, this.gpio
      )
      if (this.values.pulseWidth === 0) {
        this.values.on = false
        return
      }
      this.values.on = true
      const angle = Math.round(((2500 - this.values.pulseWidth) * 180 / 2000) - 90)
      this.values.currentTiltAngle = angle
      this.values.targetTiltAngle = angle
    } catch (error) {
      this.warn('heartbeat error %s', error)
    }
  }

  async shutdown () {
    // this.values.pulseWidth = 0
    // await this.update()
  }

  async update () {
    this.debug('set pulse width to %d', this.values.pulseWidth)
    await this.pi.command(
      PigpioClient.commands.SERVO, this.gpio, this.values.pulseWidth
    )
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
        if (params.reversed) {
          value = !value
        }
        await this.pi.command(
          PigpioClient.commands.WRITE, this.gpio, value ? 1 : 0
        )
        if (params.pulse != null) {
          setTimeout(async () => {
            await this.pi.command(
              PigpioClient.commands.WRITE, this.gpio, value ? 0 : 1
            )
          }, params.pulse)
        }
      }
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })

    this.on('gpio', (value) => {
      this.debug('gpio %s', value)
      if (params.reversed) {
        value = !value
      }
      this.values.on = value
    })
  }
}

function hs2rgb (hue, sat) {
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
    this.values.on = false
    this.values.bri = 0
    this.values.briChange = 0
    this.values.hue = 0
    this.values.sat = 0
  }

  update () {
    if (!this.blinkt.connected) {
      throw new Error('not connected')
    }
    if (this.timer != null) {
      return
    }
    this.timer = setTimeout(async () => {
      const hkBri = Math.max(0, Math.min(this.values.bri + this.values.briChange, 100))
      this.values.on = hkBri > 0
      this.values.bri = hkBri
      const bri = Math.round(this.values.bri * 31 / 100)
      const rgb = hs2rgb(this.values.hue, this.values.sat)
      this.debug(
        'set bri to %d, rgb to {%d, %d, %d}', bri, rgb.r, rgb.g, rgb.b
      )
      try {
        this.blinkt.setLed(this.ledId, bri, rgb.r, rgb.g, rgb.b)
        await this.blinkt.update()
      } catch (error) {
        this.warn(error)
      }
      delete this.timer
    }, this.platform.config.resetTimeout)
  }
}

module.exports = RpiService
