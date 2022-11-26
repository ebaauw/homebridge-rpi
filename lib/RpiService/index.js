// homebridge-rpi/lib/RpiService/index.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const homebridgeLib = require('homebridge-lib')

class RpiService extends homebridgeLib.ServiceDelegate {
  static get PowerLed () { return require('./RpiPowerLed') }
  static get SmokeSensor () { return require('./RpiSmokeSensor') }
  static get UsbPower () { return require('./RpiUsbPower') }
  static get GpioButton () { return require('./GpioInput').GpioButton }
  static get GpioCarbonMonoxide () { return require('./GpioInput').GpioCarbonMonoxide }
  static get GpioContact () { return require('./GpioInput').GpioContact }
  static get GpioDht () { return require('./GpioInput').GpioDht }
  static get GpioDoorBell () { return require('./GpioInput').GpioDoorBell }
  static get GpioMotion () { return require('./GpioInput').GpioMotion }
  static get GpioLedChain () { return require('./GpioLedChain') }
  static get GpioLeak () { return require('./GpioInput').GpioLeak }
  static get GpioLight () { return require('./GpioLight') }
  static get GpioLock () { return require('./GpioOutput').GpioLock }
  static get GpioRocker () { return require('./GpioInput').GpioRocker }
  static get GpioServo () { return require('./GpioServo') }
  static get GpioSmoke () { return require('./GpioInput').GpioSmoke }
  static get GpioSwitch () { return require('./GpioOutput').GpioSwitch }
  static get GpioValve () { return require('./GpioOutput').GpioValve }

  constructor (rpiAccessory, params = {}) {
    params.name = rpiAccessory.name
    params.Service = params.hidden
      ? rpiAccessory.Services.my.Resource
      : rpiAccessory.Services.hap.TemperatureSensor
    super(rpiAccessory, params)
    if (!params.hidden) {
      this.addCharacteristicDelegate({
        key: 'temperature',
        Characteristic: this.Characteristics.hap.CurrentTemperature,
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
      value: this.accessoryDelegate.logLevel
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

module.exports = RpiService
