// homebridge-rpi/index.js
// Copyright © 2019-2026 Erik Baauw. All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { createRequire } from 'node:module'

import { RpiPlatform } from './lib/RpiPlatform.js'

const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

function main (homebridge) {
  RpiPlatform.loadPlatform(homebridge, packageJson, 'RPi', RpiPlatform)
}

export { main as default }
