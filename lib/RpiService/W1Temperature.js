// homebridge-rpi/lib/RpiService/W1Temperature.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'

import { RpiService } from '../RpiService.js'

class W1Temperature extends ServiceDelegate {
  constructor (w1Accessory, params = {}) {
    params.name = w1Accessory.name + ' Temperature'
    params.Service = w1Accessory.Services.hap.TemperatureSensor
    super(w1Accessory, params)
    this.pi = w1Accessory.pi
    this.rpiAccessory = w1Accessory.rpiAccessory
    this.sensorId = params.sensorId
    this.w1SlavePath = `/sys/bus/w1/devices/${this.sensorId}/w1_slave`

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
  }

  async heartbeat (beat) {
    try {
      if (!this.pi.connected || this.inHeartbeat) {
        return
      }
      this.inHeartbeat = true
      if (!this.sensorWarned) {
        this.notFoundBeats = (this.notFoundBeats ?? 0) + 1
        if (
          this.rpiAccessory.w1Devices.includes(this.sensorId)
        ) {
          this.sensorWarned = true
        } else if (this.notFoundBeats >= 5) {
          this.warn(
            '%s: not found in getState w1Devices: %j',
            this.sensorId, this.rpiAccessory.w1Devices
          )
          this.sensorWarned = true
        }
      }
      if (beat % 5 === 0) {
        this.values.temperature = await this.read()
        this.values.lastUpdated = String(new Date()).slice(0, 24)
        this.values.statusFault = this.Characteristics.hap.StatusFault.NO_FAULT
      }
      this.inHeartbeat = false
    } catch (error) {
      this.inHeartbeat = false
      this.values.statusFault = this.Characteristics.hap.StatusFault.GENERAL_FAULT
      this.warn('heartbeat error: %s', error)
    }
  }

  async read () {
    const text = await this.pi.readFile(this.w1SlavePath)
    const lines = text.trim().split('\n')
    if (lines.length < 2 || !lines[0].endsWith(' YES')) {
      throw new Error(`${this.sensorId}: 1-wire CRC validation failed`)
    }
    const match = /t=(-?[0-9]+)/.exec(lines[1])
    if (match === null) {
      throw new Error(`${this.sensorId}: 1-wire temperature value not found`)
    }
    return Number(match[1]) / 1000
  }

  async init () { }

  async shutdown () { }
}

RpiService.W1Temperature = W1Temperature
