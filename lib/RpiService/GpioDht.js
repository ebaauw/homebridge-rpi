// homebridge-rpi/lib/RpiService/GpioInput/GpioDht.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { DhtClient } from 'hb-rpi-tools/DhtClient'

import { RpiService } from '../RpiService.js'

class GpioDht extends ServiceDelegate {
  static get Humidity () { return Humidity }

  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name + ' Temperature'
    params.Service = gpioAccessory.Services.hap.TemperatureSensor
    super(gpioAccessory, params)
    this.pi = gpioAccessory.pi
    this.params = params
    this.gpio = params.gpio
    this.gpioAccessory = gpioAccessory

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
      key: 'lastUpdated',
      Characteristic: this.Characteristics.my.LastUpdated,
      silent: true
    })
    this.addCharacteristicDelegate({
      key: 'statusFault',
      Characteristic: this.Characteristics.hap.StatusFault,
      silent: true
    })

    this.dht = new DhtClient(this, this.pi, this.gpio)
  }

  async heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      if (beat % 5 === 0) {
        const { temperature, humidity } = await this.dht.read()
        this.values.temperature = temperature
        this.gpioAccessory.humidityService.values.humidity = humidity
        this.values.lastUpdated = String(new Date()).slice(0, 24)
      }
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  async init () {
    this.debug(
      'initialising GPIO %d: mode: input, pud: %j', this.gpio, this.pud
    )
    await this.pi.setInput(this.gpio, this.pud)
  }

  async shutdown () { }
}

class Humidity extends ServiceDelegate {
  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name + ' Humidity'
    params.Service = gpioAccessory.Services.hap.HumiditySensor
    super(gpioAccessory, params)
    this.addCharacteristicDelegate({
      key: 'humidity',
      Characteristic: this.Characteristics.hap.CurrentRelativeHumidity,
      unit: '%'
    })
  }

  async init () { }

  async shutdown () { }
}

RpiService.GpioDht = GpioDht
