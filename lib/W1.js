// homebridge-rpi/lib/W1.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

const ds18b20SensorIdPattern = /^28-[0-9a-fA-F]{12}$/

function isDs18b20SensorId (sensorId) {
  return typeof sensorId === 'string' && ds18b20SensorIdPattern.test(sensorId)
}

export { ds18b20SensorIdPattern, isDs18b20SensorId }
