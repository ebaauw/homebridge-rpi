// homebridge-rpi/lib/RpiService/GpioInput/GpioButton.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { GpioInput } from '../GpioInput.js'
import { RpiService } from '../../RpiService.js'

function gcd (x, y) {
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x
}

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
  }

  async init () {
    super.init()
    const timeout = this.doublePressTimeout > 0
      ? this.longPressTimeout > 0
        ? gcd(this.doublePressTimeout, this.longPressTimeout)
        : this.doublePressTimeout
      : this.longPressTimeout > 0
        ? this.longPressTimeout
        : 0
    if (timeout > 0) {
      // Setup watchdog timer for double press and long press timeouts.
      this.pi.setWatchDog(this.gpio, Math.max(100, timeout))
    }
  }

  async shutdown () {
    this.pi.setWatchDog(this.gpio, 0)
    super.shutdown()
  }

  update (value, duration, watchDog) {
    if (duration == null) {
      return
    }
    duration = Math.round(duration / 1000) // µs => ms
    if (this.params.reversed) {
      value = !value
    }
    if (value) { // button released
      if (!watchDog) {
        this.debug('button released after %d ms', duration)
      }
      if (this.waitForDoublePress && duration >= this.doublePressTimeout) {
        this.waitForDoublePress = false
        this.debug('double press timeout after %d ms', duration)
        this.values.buttonevent =
          this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
      } else if (this.waitForLongPress) {
        this.waitForLongPress = false
        if (this.doublePressTimeout > 0) {
          this.waitForDoublePress = true
        } else {
          this.values.buttonevent =
            this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
        }
      } else if (!watchDog) {
        if (this.longPressTimeout === 0 && this.doublePressTimeout > 0) {
          if (this.doublePress) {
            this.doublePress = false
          } else {
            this.waitForDoublePress = true
          }
        }
      }
    } else { // button pressed
      if (!watchDog) {
        this.debug('button pressed after %d ms', duration)
      }
      if (this.waitForDoublePress) {
        this.waitForDoublePress = false
        this.doublePress = true
        this.values.buttonevent =
          this.Characteristics.hap.ProgrammableSwitchEvent.DOUBLE_PRESS
      } else if (this.waitForLongPress && duration >= this.longPressTimeout) {
        this.waitForLongPress = false
        this.debug('long press timeout after %d ms', duration)
        this.values.buttonevent =
          this.Characteristics.hap.ProgrammableSwitchEvent.LONG_PRESS
      } else if (!watchDog) {
        if (this.longPressTimeout > 0) {
          this.waitForLongPress = true
        } else if (this.doublePressTimeout === 0) {
          this.values.buttonevent =
            this.Characteristics.hap.ProgrammableSwitchEvent.SINGLE_PRESS
        }
      }
    }
  }
}

RpiService.GpioButton = GpioButton
