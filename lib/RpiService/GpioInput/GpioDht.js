// homebridge-rpi/lib/RpiService/GpioInput/GpioDht.js
// Copyright © 2019-2025 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { timeout } from 'homebridge-lib'
import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { GpioInput } from '../GpioInput.js'
import { PigpioClient } from '../../PigpioClient.js'
import { RpiService } from '../../RpiService.js'

class GpioDht extends GpioInput {
  static get Humidity () { return Humidity }

  constructor (gpioAccessory, params = {}) {
    params.name = gpioAccessory.name + ' Temperature'
    params.Service = gpioAccessory.Services.hap.TemperatureSensor
    params.pull = 'up'
    params.debounceTimeout = 0
    super(gpioAccessory, params)
    this.gpioAccessory = gpioAccessory
    this.previousDuration = 0

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
  }

  async heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      if (beat % 5 === 0) {
        await this.pi.command(PigpioClient.commands.WRITE, this.gpio, 0)
        await timeout(18)
        await this.pi.command(PigpioClient.commands.MODES, this.gpio, this.mode)
        await this.pi.command(PigpioClient.commands.PUD, this.gpio, this.pud)
      }
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  update (value, duration) {
    if (duration == null) {
      return
    }
    if (value) {
      duration += this.previousDuration
      this.vdebug('gpio %d: rise after %d µs', this.gpio, duration)
      if (duration > 10000) {
        this.receiving = true
        this.bit = -2
        this.data = 0n
      } else if (this.receiving) {
        if (++this.bit >= 1) {
          this.data <<= 1n
          if (duration >= 60 && duration <= 100) {
            // 0 bit
          } else if (duration > 100 && duration <= 150) {
            this.data += 1n // 1 bit
          } else {
            this.receiving = false // invalid
            this.debug('gpio %d: invalid signal', this.gpio)
          }
          if (this.receiving && this.bit === 40) {
            const buf = Buffer.alloc(8)
            buf.writeBigUint64LE(this.data)
            if (((buf[1] + buf[2] + buf[3] + buf[4]) & 0xFF) !== buf[0]) {
              this.debug('gpio %d: bad checksum', this.gpio)
              return
            }
            let ok = false
            let sensor = 'DHTxx'
            let temp = buf.readInt16LE(1) / 10
            let hum = buf.readUint16LE(3) / 10
            ok = temp >= -40 && temp <= 125 && hum <= 100
            if (!ok) {
              sensor = 'DHT11'
              temp = buf[2]
              hum = buf[4]
              ok = temp <= 50 && hum >= 20 && hum <= 80
            }
            if (!ok) {
              this.debug('gpio %d: invalid data', this.gpio)
              return
            }
            this.debug(
              'gpio %d: %s: temperature: %d, humidity: %d',
              this.gpio, sensor, temp, hum
            )
            this.values.temperature = temp
            this.gpioAccessory.humidityService.values.humidity = hum
            this.values.lastUpdated = String(new Date()).slice(0, 24)
          }
        }
      }
    } else {
      this.previousDuration = duration
    }
  }
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
