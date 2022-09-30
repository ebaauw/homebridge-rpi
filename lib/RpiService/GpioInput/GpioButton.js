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
      if (duration == null) {
        return
      }
      duration = Math.round(duration / 1000) // µs => ms
      if (params.reversed) {
        value = !value
      }
      if (value) { // button released
        this.debug('button released after %d ms', duration)
        let setDoublePressTimer = false
        if (this.pressedTimer != null) {
          clearTimeout(this.pressedTimer)
          this.pressedTimer = null
          if (this.doublePressTimeout > 0) {
            setDoublePressTimer = true
          } else {
            this.values.buttonevent =
              this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
          }
        } else if (this.longPressTimeout === 0 && this.doublePressTimeout > 0) {
          if (this.doublePress) {
            this.doublePress = false
          } else if (duration > 0) {
            setDoublePressTimer = true
          }
        }
        if (setDoublePressTimer) {
          this.releasedTimer = setTimeout(() => {
            this.releasedTimer = null
            this.debug('double press timeout after %d ms', this.doublePressTimeout)
            this.values.buttonevent =
              this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
          }, this.doublePressTimeout)
        }
      } else { // button pressed
        this.debug('button pressed after %d ms', duration)
        if (this.releasedTimer != null) {
          clearTimeout(this.releasedTimer)
          this.releasedTimer = null
          this.doublePress = true
          this.values.buttonevent =
            this.Characteristics.hap.ProgrammableSwitchEvent.DOUBLE_PRESS
        } else if (this.longPressTimeout > 0) {
          this.pressedTimer = setTimeout(() => {
            this.pressedTimer = null
            this.debug('long press timeout after %d ms', this.longPressTimeout)
            this.values.buttonevent =
              this.Characteristics.hap.ProgrammableSwitchEvent.LONG_PRESS
          }, this.longPressTimeout)
        } else if (this.doublePressTimeout === 0) {
          this.values.buttonevent =
            this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
        }
      }
    })
  }
}

module.exports = GpioButton
