#!/usr/bin/env node

// homebridge-rpi/cli/rpi.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const chalk = require('chalk')
const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('../lib/PigpioClient')
const RpiRevision = require('../lib/RpiRevision')
const packageJson = require('../package.json')

const PI_CMD = PigpioClient.commands

const b = chalk.bold
const u = chalk.underline

class UsageError extends Error {}

const usage = {
  rpi: `${b('rpi')} [${b('-hDV')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]]] ${u('command')} [${u('argument')} ...]`,
  info: `${b('info')} [${b('-hns')}]`,
  closeHandles: `${b('closeHandles')} [${b('-h')}]`
}

const description = {
  rpi: 'Command line interface to Raspberry Pi.',
  info: 'Print Raspberry Pi properties.',
  closeHandles: 'Force-close stale pigpiod handles.'
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
  Default is ${b('localhost:8888')}.

Commands:
  ${usage.info}
  ${description.info}

  ${usage.closeHandles}
  ${description.closeHandles}

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
  closeHandles: `${description.closeHandles}

Usage: ${b('rpi')} ${usage.closeHandles}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.`
}

class Main extends homebridgeLib.CommandLineTool {
  constructor () {
    super()
    this.usage = usage.rpi
  }

  async main () {
    try {
      this._clargs = this.parseArguments()
      this.pi = new PigpioClient(this._clargs.options)
      this.pi.on('error', (error) => { this.error(error) })
      await this.pi.connect()
      this.debug('connected to pigpiod at %s:%d', this.pi.hostname, this.pi.port)
      this.name = 'rpi ' + this._clargs.command
      this.usage = `${b('rpi')} ${usage[this._clargs.command]}`
      this.help = help[this._clargs.command]
      await this[this._clargs.command](this._clargs.args)
      await this.pi.disconnect()
    } catch (error) {
      this.error(error)
    }
  }

  parseArguments () {
    const parser = new homebridgeLib.CommandLineParser(packageJson)
    const clargs = {
      options: {}
    }
    parser.help('h', 'help', help.rpi)
    parser.flag('D', 'debug', () => { this.setOptions({ debug: true }) })
    parser.version('V', 'version')
    parser.option('H', 'host', (value) => {
      homebridgeLib.OptionParser.toHost('host', value, true)
      clargs.options.host = value
    })
    parser.parameter('command', (value) => {
      if (usage[value] == null || typeof this[value] !== 'function') {
        throw new UsageError(`${value}: unknown command`)
      }
      clargs.command = value
    })
    parser.remaining((list) => { clargs.args = list })
    parser.parse()
    return clargs
  }

  async info (...args) {
    const parser = new homebridgeLib.CommandLineParser(packageJson)
    const clargs = { options: {} }
    parser.help('h', 'help', this.help)
    parser.flag('n', 'noWhiteSpace', () => {
      clargs.options.noWhiteSpace = true
    })
    parser.flag('s', 'sortKeys', () => {
      clargs.options.sortKeys = true
    })
    parser.parse(...args)
    const jsonFormatter = new homebridgeLib.JsonFormatter(clargs.options)

    const hwver = await this.pi.command(PI_CMD.HWVER)
    this.debug('%s: hwver: %j', this.pi.hostname, hwver)
    const rpi = new RpiRevision(hwver)

    let serial = ''
    const cpuinfo = await this.pi.readFile('/proc/cpuinfo')
    const a = /Serial\s*: ([0-9a-f]{16})/.exec(cpuinfo)
    if (a != null) {
      serial = a[1].toUpperCase()
      this.debug('%s: serial: %j', this.pi.hostname, serial)
    }

    await this.pi.command(PI_CMD.SHELL, 0, 0, Buffer.from('vcgencmd'))
    const text = await this.pi.readFile('/opt/pigpio/vcgencmd.out')
    const state = JSON.parse(text)
    this.debug('%s: vcgencmd: %j', this.pi.hostname, state)

    const result = Object.assign({
      model: rpi.model,
      revision: rpi.revision,
      processor: rpi.processor,
      memory: rpi.memory,
      manufacturer: rpi.manufacturer,
      gpioMask: '0x' + rpi.gpioMask.toString(16),
      serial: serial
    }, state)
    const json = jsonFormatter.stringify(result)
    this.print(json)
  }

  async closeHandles (...args) {
    const parser = new homebridgeLib.CommandLineParser(packageJson)
    // const clargs = { options: {} }
    parser.help('h', 'help', this.help)
    parser.parse(...args)
    let nClosed = 0
    for (let handle = 0; handle <= 15; handle++) {
      try {
        const h = await this.pi.command(PI_CMD.FC, handle)
        if (h != null) {
          nClosed++
          this.debug('%s: closed handle %d', this.pi.hostname, handle)
        }
      } catch (error) {
        // ignore
      }
    }
    this.debug('%s: closed %d handles', this.pi.hostname, nClosed)
  }
}

new Main().main()
