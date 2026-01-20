#!/usr/bin/env node

// homebridge-rpi/cli/rpi.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { createRequire } from 'node:module'

import { toHexString, timeout } from 'homebridge-lib'
import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { OptionParser } from 'hb-lib-tools/OptionParser'

import { GpioClient } from '../lib/GpioClient.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

const { b, u } = CommandLineTool
const { UsageError } = CommandLineParser

const usage = {
  rpi: `${b('rpi')} [${b('-hDV')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]]] [${b('-U')} ${u('user')}] [${b('-P')} ${u('password')}] ${u('command')} [${u('argument')} ...]`,
  info: `${b('info')} [${b('-hns')}]`,
  state: `${b('state')} [${b('-hns')}]`,
  test: `${b('test')} [${b('-hns')}]`,
  led: `${b('led')} [${b('-h')}] [${b('on')}|${b('off')}]`,
  eventlog: `${b('eventlog')} [${b('-h')}] [${u('gpio')}...]`,
  ledchain: `${b('ledchain')} [${b('-h')}] [${b('-B')}|${b('-P')}] [${b('-c')} ${u('gpio')} ${b('-d')} ${u('gpio')} ${b('-n')} ${u('nLeds')}] [${b('-b')} ${u('brightness')}] [${u('mode')}]`
}

const description = {
  rpi: 'Command line interface to Raspberry Pi.',
  info: 'Get Raspberry Pi properties.',
  state: 'Get Raspberry Pi state.',
  test: 'Repeatedly get Raspberry Pi state.',
  led: 'Get/set/clear power LED state.',
  eventlog: 'Monitor GPIO state changes.',
  ledchain: 'Control Blinkt! or P9813 LED chain.'
}

const help = {
  rpi: `${description.rpi}

Usage: ${usage.rpi}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-D')}, ${b('--debug')}
  Print debug messages on stderr.

  ${b('-V')}, ${b('--version')}
  Print version and exit.

  ${b('-H')} ${u('hostname')}[${b(':')}${u('port')}], ${b('--host=')}${u('hostname')}[${b(':')}${u('port')}]
  Connect to Raspberry Pi at ${u('hostname')}${b(':')}${u('port')}.
  Default is ${b('localhost:8889')}.  If only a hostname specified, port ${b('8889')} is used.
  Note that the port indicates which GPIO daemon to connect to:
  - Use ${b('8889')} for the ${b('rgpio')} daemon,
  - Use ${b('8888')} for the ${b('pigpio')} daemon.
  The hostname and port can also be set through the environment variables
  ${b('LG_ADDR')} (for ${b('rgpio')}) or ${b('PIGPIO_ADDR')} (for ${b('pigpio')}).

  ${b('-U')} ${u('user')}, ${b('--user=')}${u('user')}
  Login to the ${b('rgpio')} daemon under ${u('user')}.
  Default is ${b('homebridge-rpi')}.
  The user can also be set through the environment variable ${b('LG_USER')}.

  ${b('-P')} ${u('password')}, ${b('--password=')}${u('password')}
  Authenticate to the ${b('rgpio')} daemon with ${u('password')}.
  Default is ${b('')} (empty).
  The password can also be set tgrough the environment variable ${b('LG_PASS')}.

Commands:
  ${usage.info}
  ${description.info}

  ${usage.state}
  ${description.state}

  ${usage.test}
  ${description.test}

  ${usage.led}
  ${description.led}

  ${usage.eventlog}
  ${description.eventlog}

  ${usage.ledchain}
  ${description.ledchain}

For more help, issue: ${b('rpi')} ${u('command')} ${b('-h')}`,
  info: `${description.info}

Usage: ${b('rpi')} ${usage.info}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-n')}, ${b('--noWhiteSpace')}
  Do not include spaces nor newlines in output.

  ${b('-s')}, ${b('--sortKeys')}
  Sort object key/value pairs alphabetically on key.`,
  state: `${description.state}

Usage: ${b('rpi')} ${usage.state}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-n')}, ${b('--noWhiteSpace')}
  Do not include spaces nor newlines in output.

  ${b('-s')}, ${b('--sortKeys')}
  Sort object key/value pairs alphabetically on key.`,
  test: `${description.test}

Usage: ${b('rpi')} ${usage.test}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-n')}, ${b('--noWhiteSpace')}
  Do not include spaces nor newlines in output.

  ${b('-s')}, ${b('--sortKeys')}
  Sort object key/value pairs alphabetically on key.`,
  led: `${description.led}

Usage: ${b('rpi')} ${usage.led}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('on')}
  Turn power LED on.

  ${b('off')}
  Turn power LED off.`,
  eventlog: `${description.eventlog}

Usage: ${b('rpi')} ${usage.eventlog}

Paramerers:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${u('gpio')}
  Log events for GPIO ${u('gpio')}.
  Default: all user GPIOs on the Rapberry Pi model.`,
  ledchain: `${description.ledchain}

Usage: ${b('rpi')} ${usage.ledchain}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-B')}, ${b('--blinkt')}
  Control Pimoroni Blinkt! LED chain (default).
  Sets clock to GPIO 24, data to GPIO 23, and number of LEDs to 8.
  You can change these with the ${b('-c')}, ${b('-d')}, and ${b('-n')} options.
  The Pimoroni FanShim uses GPIO 14 for clock, GPIO 15 for data, and has 1 LED.

  ${b('-P')}, ${b('--p9813')}
  Use P9813-based LED chain.
  Sets clock to GPIO 10, data to GPIO 11, and number of LEDs to 2.
  You can change these with the ${b('-c')}, ${b('-d')}, and ${b('-n')} options.

  ${b('-c')} ${u('gpio')}, ${b('--clock=')}${u('gpio')}
  GPIO pin for LED chain clock signal.

  ${b('-d')} ${u('gpio')}, ${b('--data=')}${u('gpio')}
  GPIO pin for LED chain data signal.

  ${b('-n')} ${u('nLeds')}, ${b('--nLeds=')}${u('nLeds')}
  Number of LEDs in the LED chain.

  ${b('-b')} ${u('brightness')}, ${b('--brightness=')}${u('brightness')}
  Set brightness between 0 and 255 (default: 255).

  ${b('colorloop')}
  Start color loop.

  ${b('cylon')}
  Start Cylon eye.

  ${b('off')}
  Turn off all LEDs.`
}

function toHex (n) {
  return '0x' + ('00000000' + n.toString(16).toUpperCase()).slice(-8)
}

class Main extends CommandLineTool {
  constructor () {
    super()
    this.usage = usage.rpi
  }

  async main () {
    try {
      this._clargs = this.parseArguments()
      let Client
      if (this._clargs.port === 8888) {
        await import('../lib/GpioClient/PigpioClient.js')
        Client = GpioClient.Pigpio
        delete this._clargs.options.user
        delete this._clargs.options.password
      } else {
        await import('../lib/GpioClient/RgpioClient.js')
        Client = GpioClient.Rgpio
      }
      this.pi = new Client(this._clargs.options)
      this.pi
        .on('error', (error) => { this.warn(error) })
        .on('warning', (error) => { this.warn(error) })
        .on('connect', (hostname, port) => {
          this.debug('connected to %s:%d', hostname, port)
        })
        .on('disconnect', (hostname, port) => {
          this.debug('disconnected from %s:%d', hostname, port)
        })
        .on('command', (cmd, params) => {
          this.vdebug('%s %j', this.pi.commandName(cmd), params)
        })
        .on('response', (cmd, result) => {
          this.vdebug('%s => %j', this.pi.commandName(cmd), result)
        })
        .on('send', (data) => { this.vvdebug('send %s', toHexString(data)) })
        .on('data', (data) => { this.vvdebug('recv %s', toHexString(data)) })
        .on('message', (message) => { this.debug(message) })
      this.name = 'rpi ' + this._clargs.command
      this.usage = `${b('rpi')} ${usage[this._clargs.command]}`
      this.help = help[this._clargs.command]
      await this[this._clargs.command](this._clargs.args)
    } catch (error) {
      this.error(error)
    }
    try {
      await this.ledChain?.disconnect(true)
      await this.pi?.disconnect()
    } catch (error) {
      this.error(error)
    }
  }

  async destroy () {
    await this.ledChain?.disconnect(true)
    await this.pi?.disconnect()
  }

  parseArguments () {
    const parser = new CommandLineParser(packageJson)
    const clargs = {
      options: {
        host: process.env.LG_ADDR || process.env.PIGPIO_ADDR || 'localhost',
        user: process.env.LG_USER || 'homebridge-rpi',
        password: process.env.LG_PASS || ''
      },
      port: process.env.LG_ADDR == null && process.env.PIGPIO_ADDR != null ? 8888 : 8889
    }
    parser
      .help('h', 'help', help.rpi)
      .flag('D', 'debug', () => {
        if (this.vdebugEnabled) {
          this.setOptions({ vvdebug: true })
        } else if (this.debugEnabled) {
          this.setOptions({ vdebug: true })
        } else {
          this.setOptions({ debug: true, chalk: true })
        }
      })
      .version('V', 'version')
      .option('H', 'host', (value) => {
        const { hostname, port } = OptionParser.toHost('host', value, false, true)
        clargs.hostname = hostname
        clargs.port = port
        clargs.options.host = value
      })
      .option('U', 'user', (value) => {
        clargs.options.user = OptionParser.toString('user', value, true)
      })
      .option('P', 'password', (value) => {
        clargs.options.password = OptionParser.toString('password', value, true)
      })
      .parameter('command', (value) => {
        if (usage[value] == null || typeof this[value] !== 'function') {
          throw new UsageError(`${value}: unknown command`)
        }
        clargs.command = value
      })
      .remaining((list) => { clargs.args = list })
      .parse()
    return clargs
  }

  async _getInfo () {
    const { SystemInfo } = await import('hb-lib-tools/SystemInfo')
    let info
    if (['localhost', '127.0.0.1'].includes(this._clargs.options.host)) {
      const systemInfo = new SystemInfo()
      systemInfo
        .on('readFile', (fileName) => {
          this.debug('read file %s', fileName)
        })
        .on('exec', (cmd) => {
          this.debug('exec %s', cmd)
        })
      await systemInfo.init()
      if (!systemInfo.hwInfo.isRpi) {
        throw new Error('localhost: not a Rapsberry Pi')
      }
      info = systemInfo.hwInfo
    } else {
      const cpuInfo = await this.pi.readFile('/proc/cpuinfo')
      info = SystemInfo.parseRpiCpuInfo(cpuInfo)
    }
    info.gpioMask = toHex(info.gpioMask)
    info.gpioMaskSerial = toHex(info.gpioMaskSerial)
    return info
  }

  async _getState (noPowerLed, noFan) {
    const { RpiInfo } = await import('../lib/RpiInfo.js')
    let state
    if (['localhost', '127.0.0.1'].includes(this._clargs.options.host)) {
      if (this.rpiInfo == null) {
        this.rpiInfo = new RpiInfo()
        this.rpiInfo
          .on('readFile', (fileName) => {
            this.debug('read file %s', fileName)
          })
          .on('exec', (cmd) => {
            this.debug('exec %s', cmd)
          })
      }
      state = await this.rpiInfo.getState(noPowerLed, noFan)
    } else {
      await this.pi.shell('getState')
      const text = await this.pi.readFile('/tmp/getState.json')
      state = RpiInfo.parseState(text)
    }
    state.throttled = toHex(state.throttled)
    return state
  }

  async _parseCommandArgs (...args) {
    const parser = new CommandLineParser(packageJson)
    const clargs = { options: {} }
    parser
      .help('h', 'help', this.help)
      .flag('n', 'noWhiteSpace', () => {
        clargs.options.noWhiteSpace = true
      })
      .flag('s', 'sortKeys', () => {
        clargs.options.sortKeys = true
      })
      .parse(...args)
    this.jsonFormatter = new JsonFormatter(clargs.options)
  }

  async info (...args) {
    this._parseCommandArgs(...args)
    const info = await this._getInfo()
    const json = this.jsonFormatter.stringify(info)
    this.print(json)
  }

  async state (...args) {
    this._parseCommandArgs(...args)
    const info = await this._getInfo()
    const state = await this._getState(!info.supportsPowerLed, !info.supportsFan)
    const json = this.jsonFormatter.stringify(state)
    this.print(json)
  }

  async test (...args) {
    this._parseCommandArgs(...args)
    const info = await this._getInfo()
    for (;;) {
      try {
        const state = await this._getState(!info.supportsPowerLed, !info.supportsFan)
        const json = this.jsonFormatter.stringify(state)
        this.print(json)
      } catch (error) {
        this.warn(error)
      }
      await timeout(5000)
    }
  }

  async led (...args) {
    const { RpiInfo } = await import('../lib/RpiInfo.js')
    const clargs = { options: {} }
    const parser = new CommandLineParser(packageJson)
    parser
      .help('h', 'help', this.help)
      .remaining((value) => {
        if (value.length > 1) {
          throw new UsageError('too many parameters')
        }
        if (value.length === 1) {
          if (value[0] !== 'on' && value[0] !== 'off') {
            throw new UsageError(`${value[0]}: unknown state`)
          }
          clargs.options.on = value[0] === 'on'
        }
      })
      .parse(...args)
    const info = await this._getInfo()
    if (!info.supportsPowerLed) {
      throw new Error(
        `${this._clargs.options.host}: Raspberry Pi ${info.model}: no power LED support`
      )
    }
    if (clargs.options.on != null) {
      await this.pi.writeFile(RpiInfo.powerLed, clargs.options.on ? '1' : '0')
    }
    const { powerLed } = await this._getState(false, true)
    this.print(powerLed ? 'on' : 'off')
  }

  async eventlog (...args) {
    const { gpioMask, model } = await this._getInfo()
    let mask = 0
    const parser = new CommandLineParser(packageJson)
    parser
      .help('h', 'help', this.help)
      .remaining((list) => {
        for (const i in list) {
          const gpio = OptionParser.toInt(`gpio[${i}]`, list[i])
          const bit = 1 << gpio
          this.debug('gpio %d, bit %d', gpio, bit)
          if ((bit & gpioMask) === 0) {
            throw new UsageError(`gpio[${i}]: GPIO ${gpio}: not available on Raspberry Pi ${model}`)
          }
          mask |= bit
          this.pi.on('gpio' + gpio, (payload) => {
            this.print('gpio %d: %s', gpio, payload.value ? 'high' : 'low')
          })
        }
      })
      .parse(...args)
    this.pi.on('listen', (mask) => { this.debug('listening for %s', this.pi.vmap(mask)) })
    if (mask === 0) {
      this.pi.on('notification', (payload) => {
        this.print(
          '%s (0x%s, tick: %d)', this.pi.vmap(payload.map), toHexString(payload.map, 8), payload.tick >>> 0
        )
      })
    }
    await this.pi.listen(mask === 0 ? gpioMask : mask)
    await new Promise(() => {})
  }

  async ledchain (...args) {
    const clargs = {
      mode: 'cylon',
      type: 'Blinkt',
      config: {
        gpioClock: 24,
        gpioData: 23,
        nLeds: 8
      },
      brightness: 255
    }
    const parser = new CommandLineParser(packageJson)
    parser
      .help('h', 'help', this.help)
      .flag('B', 'blinkt', () => {
        clargs.type = 'Blinkt'
        clargs.config = {
          gpioClock: 24,
          gpioData: 23,
          nLeds: 8
        }
      })
      .flag('P', 'p9813', () => {
        clargs.type = 'P9813'
        clargs.config = {
          gpioClock: 10,
          gpioData: 11,
          nLeds: 2
        }
      })
      .option('c', 'gpioClock', (value) => {
        clargs.config.gpioClock = OptionParser.toInt('clock', value, 0, 31)
      })
      .option('d', 'gpioData', (value) => {
        clargs.config.gpioData = OptionParser.toInt('data', value, 0, 31)
      })
      .option('n', 'nLeds', (value) => {
        clargs.config.nLeds = OptionParser.toInt('nLeds', value, 1, 1024)
      })
      .option('b', 'brightness', (value) => {
        clargs.brightness = OptionParser.toInt('brightness', value, 0, 255)
      })
      .parameter('mode', (value) => {
        if (!['colorloop', 'cylon', 'off'].includes(value)) {
          throw new UsageError(`${value}: unknown mode`)
        }
        clargs.mode = value
      })
      .parse(...args)

    // Check if RPi model supports specified GPIOs.
    const { gpioMask, model } = await this._getInfo()
    if (((1 << clargs.config.gpioClock) & gpioMask) === 0) {
      throw new UsageError(
        `clock: GPIO ${clargs.config.gpioClock}: not available on Raspberry Pi ${model}`
      )
    }
    if (((1 << clargs.config.gpioClock) & gpioMask) === 0) {
      throw new UsageError(
        `data: GPIO ${clargs.config.gpioClock}: not available on Raspberry Pi ${model}`
      )
    }

    const { GpioLedChain } = await import('../lib/GpioLedChain.js')
    await import(`../lib/GpioLedChain/${clargs.type}.js`)
    this.ledChain = new GpioLedChain[clargs.type](this.pi, clargs.config)
    this.ledChain
      .on('led', (id, led) => {
        this.vdebug('led %d: %j', id, led)
      })
    await this.ledChain.init(true)
    if (clargs.mode === 'off') {
      return
    }
    process.removeAllListeners('SIGINT')
    process.on('SIGINT', () => {
      this.log('got SIGINT: stopping ledchain %s', clargs.mode)
      this.ledChain.stop()
    })
    await this.ledChain[clargs.mode](clargs.brightness)
  }
}

new Main().main()
