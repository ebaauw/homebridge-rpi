// homebridge-rpi/lib/RpiService/GpioInput/GpioButton.js
// Copyright © 2019-2022 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const GpioInput = require('./index.js')

class GpioButton extends GpioInput {
  constructor (gpioAccessory, params = {}) {
    params.Service = gpioAccessory.Services.hap.StatelessProgrammableSwitch
    params.subtype = params.index
    super(gpioAccessory, params)
    this.doublePressTimeout = params.doublePressTimeout
    this.longPressTimeout = params.longPressTimeout

    const props = {
      minValue: this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS,
      maxValue: this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS,
      validValues: [
        this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
      ]
    }
    if (this.doublePressTimeout > 0) {
      props.maxValue = this.Characteristics.hap.ProgrammableSwitchEvent.DOUBLE_PRESS
      props.validValues.push(
        this.Characteristics.hap.ProgrammableSwitchEvent.DOUBLE_PRESS
      )
    }
    if (this.longPressTimeout > 0) {
      props.maxValue = this.Characteristics.hap.ProgrammableSwitchEvent.LONG_PRESS
      props.validValues.push(
        this.Characteristics.hap.ProgrammableSwitchEvent.LONG_PRESS
      )
    }

    this.addCharacteristicDelegate({
      key: 'buttonevent',
      Characteristic: this.Characteristics.hap.ProgrammableSwitchEvent,
      props
    })
    this.addCharacteristicDelegate({
      key: 'index',
      Characteristic: this.Characteristics.hap.ServiceLabelIndex,
      value: params.index
    })

    this.on('gpio', (value, duration) => {
      if (params.reversed) {
        value = !value
      }
      if (value) { // button released
        if (duration == null) {
          this.debug('button released')
          return
        }
        duration = Math.round(duration / 1000) // µs => ms
        this.debug('button released after %d ms', duration)
        if (duration > this.longPressTimeout && this.longPressTimeout > 0) {
          this.doublePress = false
          this.values.buttonevent =
            this.Characteristics.hap.ProgrammableSwitchEvent.LONG_PRESS
        } else if (this.doublePress) {
          this.doublePress = false
          this.values.buttonevent =
            this.Characteristics.hap.ProgrammableSwitchEvent.DOUBLE_PRESS
        } else if (this.doublePressTimeout === 0) {
          this.values.buttonevent =
            this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
        } else {
          this.singlePressTimer = setTimeout(() => {
            this.singlePressTimer = null
            this.values.buttonevent =
              this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
          }, this.doublePressTimeout)
        }
      } else { // button pressed
        if (this.singlePressTimer == null) {
          this.debug('button pressed')
          return
        }
        duration = Math.round(duration / 1000) // µs => ms
        this.debug('button pressed after %d ms', duration)
        clearTimeout(this.singlePressTimer)
        this.singlePressTimer = null
        this.doublePress = true
      }
    })
  }
}

module.exports = GpioButton
