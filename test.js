// homebridge-rpi/test.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

// const Bonjour = require('bonjour-hap')
const FanShim = require('./lib/FanShim')
const PigpioClient = require('./lib/PigpioClient')
const RpiRevision = require('./lib/RpiRevision')

const PI_CMD = PigpioClient.commands

async function delay (ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => { resolve() }, ms)
  })
}

async function connect (hostname = 'localhost') {
  try {
    const pi = new PigpioClient(hostname)
    // pi.on('error', (error) => {
    //   console.log('%s: error %s', hostname, error)
    // })
    // pi.on('request', (request) => {
    //   console.log('%s: send: %o', hostname, request)
    // })
    // pi.on('data', (data) => {
    //   console.log('%s: recv: %o', hostname, data)
    // })
    pi.on('notification', (level) => {
      console.log(
        '%s: GPIO: 0x%s, fan: %s', hostname,
        ('00000000' + level.toString(16).toUpperCase()).slice(-8),
        (level & (1 << 18)) >> 18
      )
    })

    try {
      await pi.connect()
    } catch (error) {
      return
    }
    // setTimeout(() => { pi.disconnect() }, 70000)
    // setTimeout(() => { pi.disconnect() }, 10000)

    const hwver = await pi.command(PI_CMD.HWVER)
    const rpi = new RpiRevision(hwver)
    let mask = rpi.gpioMask
    mask &= ~rpi.gpioMaskSerial
    mask >>>= 0
    let gpio = await pi.command(PI_CMD.BR1)
    gpio &= mask

    let serial = ''
    const cpuinfo = await pi.readFile('/proc/cpuinfo')
    const a = /Serial\s*: ([0-9a-f]{16})/.exec(cpuinfo)
    if (a != null) {
      serial = a[1].toUpperCase()
    }

    await pi.command(PI_CMD.SHELL, 0, 0, Buffer.from('vcgencmd'))
    const text = await pi.readFile('/opt/pigpio/vcgencmd.out')
    const state = JSON.parse(text)

    console.log(
      '%s: Raspberry Pi %s v%s (%s, %s) - %s', hostname, rpi.model, rpi.revision,
      rpi.processor, rpi.memory, serial
    )
    console.log(
      '%s: %s°C, %sMHz, %sV, throttled: %s, load: %s, GPIO: 0x%s, fan: %s',
      hostname,
      state.temp, Math.round(state.freq / 1000000), state.volt,
      state.throttled, state.load,
      ('00000000' + gpio.toString(16).toUpperCase()).slice(-8),
      (gpio & (1 << 18)) >> 18
    )

    if (hostname === 'pi5') {
      const fanshim = new FanShim(pi)
      await fanshim.setLed(0x08, 0xFF, 0x00, 0x00)
      await delay(200)
      await fanshim.setLed(0x08, 0x00, 0xFF, 0x00)
      await delay(200)
      await fanshim.setLed(0x08, 0x00, 0x00, 0xFF)
      await delay(200)
      await fanshim.setLed(0x08, 0xFF, 0xFF, 0xFF)
      await delay(200)
      await fanshim.setLed(0x00, 0x00, 0x00, 0x00)
      fanshim.destroy()
      pi.disconnect()
    }

    // await pi.listen(mask)
    // setTimeout(() => { pi.stopListen() }, 10000)
  } catch (error) {
    console.log('%s: error: %s', hostname, error)
  }
}

async function main () {
  // connect('pi1')
  // connect('pi2')
  // connect('pi3')
  connect('pi5')
  // const bonjour4 = new Bonjour()
  // const browser4 = bonjour4.find({ type: 'rfb' })
  // browser4.on('up', (obj) => {
  //   // console.log('found %o', obj)
  //   connect(obj.name)
  // })
  // setTimeout(() => {
  //   bonjour4.destroy()
  // }, 1000)
}

main()
