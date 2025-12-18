#!/usr/bin/env node

// homebridge-rpi/cli/rpi.js
// Copyright © 2019-2025 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { createRequire } from 'node:module'

import { toHexString, timeout } from 'homebridge-lib'
import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { OptionParser } from 'hb-lib-tools/OptionParser'
import { SystemInfo } from 'hb-lib-tools/SystemInfo'

import { GpioClient } from '../lib/GpioClient.js'
import { RpiInfo } from '../lib/RpiInfo.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

const { b, u } = CommandLineTool
const { UsageError } = CommandLineParser

const usage = {
  rpi: `${b('rpi')} [${b('-hDV')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]]] ${u('command')} [${u('argument')} ...]`,
  info: `${b('info')} [${b('-hns')}]`,
  state: `${b('state')} [${b('-hns')}]`,
  test: `${b('test')} [${b('-hns')}]`,
  led: `${b('led')} [${b('-h')}] [${b('on')}|${b('off')}]`
}

const description = {
  rpi: 'Command line interface to Raspberry Pi.',
  info: 'Get Raspberry Pi properties.',
  state: 'Get Raspberry Pi state.',
  test: 'Repeatedly get Raspberry Pi state.',
  led: 'Get/set/clear power LED state.'
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
  Connect to Raspberry Pi at ${u('hostname')}${b(':8888')} or ${u('hostname')}${b(':')}${u('port')}.
  Default is ${b('localhost:8889')}
  Note that by default, ${b('rpi')} connects to the ${b('rgpio')} daemon on port 8889.
  To connect to the ${b('pigpio')} daemon, specify port ${b('8888')}.

Commands:
  ${usage.info}
  ${description.info}

  ${usage.state}
  ${description.state}

  ${usage.test}
  ${description.test}

  ${usage.led}
  ${description.led}

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
  Turn power LED off.`
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
      if (this.pi != null) {
        await this.pi.disconnect()
      }
    } catch (error) {
      this.error(error)
    }
  }

  parseArguments () {
    const parser = new CommandLineParser(packageJson)
    const clargs = {
      options: {
        host: process.env.LG_ADDR || process.env.PIGPIO_ADDR || 'localhost'
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
    info.state = await this._getState(!info.supportsPowerLed, !info.supportsFan)
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

  async exit (signal) {
    this.log('got %s - exiting...', signal)
    try {
      if (this.pi != null) {
        await this.pi.disconnect()
      }
    } catch (error) {
      this.error(error)
    }
    process.exit(0)
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
}

new Main().main()
