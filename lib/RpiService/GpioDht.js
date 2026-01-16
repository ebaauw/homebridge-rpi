// homebridge-rpi/lib/RpiService/GpioInput/GpioDht.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

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

    this.pi.on('gpio' + this.gpio, (payload) => {
      if (payload.value) {
        const duration = payload.tick - (this._previousTick ?? 0)
        this._previousTick = payload.tick
        this.update(duration)
      }
    })
  }

  async heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      if (beat % 5 === 0) {
        await this.pi.dhtPoll(this.gpio)
      }
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.warn('heartbeat error %s', error)
    }
  }

  update (duration) {
    this.vdebug('gpio %d: rise after %d µs', this.gpio, duration)
    if (duration > 10000) {
      this.receiving = true
      this.bit = this.pi.port === 8888 ? -2 : 0
      this.data = 0n
    } else if (this.receiving) {
      if (++this.bit >= 1) {
        this.data <<= 1n
        if (duration >= 60 && duration <= 100) {
          // 0 bit
          this.vdebug('gpio %d: bit %d: 0', this.gpio, this.bit)
        } else if (duration > 100 && duration <= 160) {
          this.data += 1n // 1 bit
          this.vdebug('gpio %d: bit %d: 1', this.gpio, this.bit)
        } else {
          this.receiving = false // invalid
          this.warn('gpio %d: invalid signal', this.gpio)
        }
        if (this.receiving && this.bit === 40) {
          const buf = Buffer.alloc(8)
          buf.writeBigUint64LE(this.data)
          if (((buf[1] + buf[2] + buf[3] + buf[4]) & 0xFF) !== buf[0]) {
            this.warn('gpio %d: bad checksum', this.gpio)
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
            this.warn('gpio %d: invalid data', this.gpio)
            return
          }
          this.log(
            'gpio %d: %s: temperature: %d, humidity: %d',
            this.gpio, sensor, temp, hum
          )
          this.values.temperature = temp
          this.gpioAccessory.humidityService.values.humidity = hum
          this.values.lastUpdated = String(new Date()).slice(0, 24)
        }
      }
    }
  }

  async init () { }

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
