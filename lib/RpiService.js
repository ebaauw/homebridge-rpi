// homebridge-rpi/lib/RpiAccessory.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('./PigpioClient')

class RpiService extends homebridgeLib.ServiceDelegate {
  static get SmokeSensor () { return RpiSmokeSensor }
  static get GpioButton () { return GpioButton }
  static get GpioContact () { return GpioContact }
  static get GpioMotion () { return GpioMotion }
  static get GpioLight () { return GpioLight }
  static get GpioServo () { return GpioServo }
  static get GpioSmoke () { return GpioSmoke }
  static get GpioSwitch () { return GpioSwitch }
  static get GpioValve () { return GpioValve }
  static get GpioBlinkt () { return GpioBlinkt }

  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name
    params.Service = params.hidden
      ? rpiAccessory.Services.my.Resource
      : rpiAccessory.Services.eve.TemperatureSensor
    super(rpiAccessory, params)
    if (!params.hidden) {
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
        key: 'cpuVoltage',
        Characteristic: this.Characteristics.my.CpuVoltage,
        unit: 'mV'
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
        key: 'lastBoot',
        Characteristic: this.Characteristics.my.LastBoot
      })
    }
    this.addCharacteristicDelegate({
      key: 'lastupdated',
      Characteristic: this.Characteristics.my.LastUpdated,
      silent: true
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
    this.addCharacteristicDelegate({
      key: 'logLevel',
      Characteristic: this.Characteristics.my.LogLevel,
      value: rpiAccessory.logLevel
    }).on('didSet', (value) => {
      rpiAccessory.logLevel = value
    })
  }

  checkState (state) {
    if (state == null) {
      this.values.lastupdated = String(new Date()).slice(0, 24)
      return
    }
    this.values.temperature = state.temp
    this.values.frequency = Math.round(state.freq / 1000000)
    this.values.cpuVoltage = Math.round(state.volt * 1000)
    this.values.throttled = (state.throttled & 0x000e) !== 0
    this.values.underVoltage = (state.throttled & 0x0001) !== 0
    this.values.load = state.load
    this.values.lastupdated = String(new Date(state.date)).slice(0, 24)
    this.values.lastBoot = String(new Date(state.boot)).slice(0, 24)
  }
}

class RpiSmokeSensor extends homebridgeLib.ServiceDelegate {
  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name
    params.Service = rpiAccessory.Services.hap.SmokeSensor
    super(rpiAccessory, params)
    this.rpiService = rpiAccessory.rpiService
    this.addCharacteristicDelegate({
      key: 'smokeDetected',
      Characteristic: this.Characteristics.hap.SmokeDetected,
      value: this.Characteristics.hap.SmokeDetected.SMOKE_NOT_DETECTED
    })
    this.update()
    this.rpiService.characteristicDelegate('throttled')
      .on('didSet', () => { this.update() })
    this.rpiService.characteristicDelegate('underVoltage')
      .on('didSet', () => { this.update() })
  }

  update () {
    this.values.smokeDetected =
      this.rpiService.values.throttled || this.rpiService.values.underVoltage
        ? this.Characteristics.hap.SmokeDetected.SMOKE_DETECTED
        : this.Characteristics.hap.SmokeDetected.SMOKE_NOT_DETECTED
  }
}

class GpioInput extends homebridgeLib.ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.pi.on('notification', (map) => {
      this.newGpioValue = (map & (1 << this.gpio)) !== 0
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
    await this.pi.command(PigpioClient.commands.PUD, this.gpio, 2) // up
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
      this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
      if (params.reversed) {
        value = !value
      }
      this.values.contact = value
        ? this.Characteristics.hap.ContactSensorState.CONTACT_NOT_DETECTED
        : this.Characteristics.hap.ContactSensorState.CONTACT_DETECTED
    })
  }
}

class GpioMotion extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.MotionSensor
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'motion',
      Characteristic: this.Characteristics.hap.MotionDetected
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
      this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
      if (params.reversed) {
        value = !value
      }
      this.values.motion = !value
    })
  }
}

class GpioSmoke extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.SmokeSensor
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'smokeDetected',
      Characteristic: this.Characteristics.hap.SmokeDetected
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })

    this.on('gpio', (value) => {
      this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
      if (params.reversed) {
        value = !value
      }
      this.values.smokeDetected = value
        ? this.Characteristics.hap.SmokeDetected.SMOKE_NOT_DETECTED
        : this.Characteristics.hap.SmokeDetected.SMOKE_DETECTED
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
      if (params.reversed) {
        value = !value
      }
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

class GpioLight extends homebridgeLib.ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Lightbulb
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.gpio = params.gpio
    this.reversed = params.reversed
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (value) => {
        const dutyCycle = value ? Math.round(this.values.brightness * 2.55) : 0
        this.values.dutyCycle = this.reversed ? 255 - dutyCycle : dutyCycle
        await this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'brightness',
      Characteristic: this.Characteristics.hap.Brightness,
      unit: '%',
      setter: async (value) => {
        const dutyCycle = Math.round(value * 2.55)
        this.values.dutyCycle = this.reversed ? 255 - dutyCycle : dutyCycle
        await this.update()
      }
    })
    this.addCharacteristicDelegate({
      key: 'dutyCycle',
      value: 0
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
    this.inHeartbeat = false
    await this.update()
  }

  async heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      this.values.dutyCycle = await this.pi.command(
        PigpioClient.commands.GDC, this.gpio
      )
      const dutyCycle = this.reversed
        ? 255 - this.values.dutyCycle
        : this.values.dutyCycle
      if (dutyCycle === 0) {
        this.values.on = false
        this.inHeartbeat = false
        return
      }
      this.values.on = true
      this.values.brightness = Math.round(dutyCycle / 2.55)
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  async shutdown () {
    // this.values.dutyCycle = 0
    // await this.update()
  }

  async update () {
    this.debug('set duty cycle to %d', this.values.dutyCycle)
    await this.pi.command(
      PigpioClient.commands.PWM, this.gpio, this.values.dutyCycle
    )
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
    this.inHeartbeat = false
    await this.update()
  }

  async heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      this.values.pulseWidth = await this.pi.command(
        PigpioClient.commands.GPW, this.gpio
      )
      if (this.values.pulseWidth === 0) {
        this.values.on = false
        this.inHeartbeat = false
        return
      }
      this.values.on = true
      const angle = Math.round(((2500 - this.values.pulseWidth) * 180 / 2000) - 90)
      this.values.currentTiltAngle = angle
      this.values.targetTiltAngle = angle
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
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
    this.pulse = params.pulse
    this.addCharacteristicDelegate({
      key: 'on',
      Characteristic: this.Characteristics.hap.On,
      setter: async (on) => {
        if (this.resetTimeout != null) {
          throw new Error('pulse in progress')
        }
        const value = params.reversed ? (on ? 0 : 1) : (on ? 1 : 0)
        await this.pi.command(
          PigpioClient.commands.WRITE, this.gpio, value
        )
      }
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })

    this.on('gpio', (value) => {
      if (this.resetTimeout != null) {
        clearTimeout(this.resetTimeout)
        delete this.resetTimeout
      }
      this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
      this.values.on = params.reversed ? !value : value
      if (this.pulse != null && this.values.on) {
        this.resetTimeout = setTimeout(async () => {
          try {
            await this.pi.command(
              PigpioClient.commands.WRITE, this.gpio, params.reversed ? 1 : 0
            )
          } catch (error) {
            this.emit('warning', error)
          }
          clearTimeout(this.resetTimeout)
          delete this.resetTimeout
        }, params.pulse)
      }
    })
  }
}

class GpioValve extends GpioOutput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.Valve
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'active',
      Characteristic: this.Characteristics.hap.Active,
      setter: async (active) => {
        const value = params.reversed
          ? (active === this.Characteristics.hap.Active.ACTIVE ? 0 : 1)
          : (active === this.Characteristics.hap.Active.ACTIVE ? 1 : 0)
        await this.pi.command(
          PigpioClient.commands.WRITE, this.gpio, value
        )
      }
    }).on('didSet', (active) => {
      if (active === this.Characteristics.hap.Active.ACTIVE) {
        this.values.inUse = this.Characteristics.hap.InUse.IN_USE
        this.values.remainingDuration = this.values.setDuration
        this.activeDue = new Date().valueOf()
        this.activeDue += this.values.setDuration * 1000
        this.activeDueTimeout = setTimeout(() => {
          this.characteristicDelegate('active')
            .setValue(this.Characteristics.hap.Active.INACTIVE)
        }, this.values.setDuration * 1000)
      } else {
        if (this.activeDueTimeout != null) {
          clearTimeout(this.activeDueTimeout)
          delete this.activeDueTimeout
        }
        this.values.inUse = this.Characteristics.hap.InUse.NOT_IN_USE
        this.values.remainingDuration = 0
        this.activeDue = 0
      }
    })
    this.addCharacteristicDelegate({
      key: 'inUse',
      Characteristic: this.Characteristics.hap.InUse,
      value: this.Characteristics.hap.InUse.NOT_IN_USE
    })
    this.addCharacteristicDelegate({
      key: 'remainingDuration',
      Characteristic: this.Characteristics.hap.RemainingDuration,
      getter: async () => {
        const remaining = this.activeDue - new Date().valueOf()
        return remaining > 0 ? Math.round(remaining / 1000) : 0
      }
    })
    this.addCharacteristicDelegate({
      key: 'setDuration',
      Characteristic: this.Characteristics.hap.SetDuration
    })
    this.addCharacteristicDelegate({
      key: 'valveType',
      Characteristic: this.Characteristics.hap.ValveType,
      value: this.Characteristics.hap.ValveType.GENERIC_VALVE
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })

    this.on('gpio', (value) => {
      this.debug('gpio %d: %s', this.gpio, value ? 'high' : 'low')
      this.values.active = params.reversed
        ? value
          /* eslint-disable indent */
          ? this.Characteristics.hap.Active.INACTIVE
          : this.Characteristics.hap.Active.ACTIVE
          /* eslint-enable indent */
        : value
          ? this.Characteristics.hap.Active.ACTIVE
          : this.Characteristics.hap.Active.INACTIVE
    })
  }

  async init () {
    await super.init()
    this.values.active = this.Characteristics.hap.Active.INACTIVE
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
