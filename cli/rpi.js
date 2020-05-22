#!/usr/bin/env node

// homebridge-rpi/cli/rpi.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const chalk = require('chalk')
const homebridgeLib = require('homebridge-lib')
const PigpioClient = require('../lib/PigpioClient')
const RpiInfo = require('../lib/RpiInfo')
const packageJson = require('../package.json')

const PI_CMD = PigpioClient.commands

const b = chalk.bold
const u = chalk.underline

class UsageError extends Error {}

const usage = {
  rpi: `${b('rpi')} [${b('-hDV')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]]] ${u('command')} [${u('argument')} ...]`,
  info: `${b('info')} [${b('-hns')}]`,
  test: `${b('test')} [${b('-hns')}]`,
  closeHandles: `${b('closeHandles')} [${b('-h')}]`
}

const description = {
  rpi: 'Command line interface to Raspberry Pi.',
  info: 'Get Raspberry Pi properties and state.',
  test: 'Repeated get Raspberry Pi properties and state.',
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

  ${usage.test}
  ${description.test}

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
  test: `${description.test}

Usage: ${b('rpi')} ${usage.test}

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
      this.pi.on('error', (error) => { this.warn(error) })
      this.pi.on('connect', (hostname, port) => {
        this.debug('connected to pigpio at %s:%d', hostname, port)
      })
      this.pi.on('disconnect', (hostname, port) => {
        this.debug('disconnected from pigpio at %s:%d', hostname, port)
      })
      this.pi.on('command', (cmd, p1, p2, p3) => {
        this.debug('command %s %d %d %j', PigpioClient.commandName(cmd), p1, p2, p3)
      })
      this.pi.on('response', (cmd, status, result) => {
        this.debug('command %s => %d', PigpioClient.commandName(cmd), status)
        // this.debug('command %s => %d %j', PigpioClient.commandName(cmd), status, result)
      })
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

    let info
    let state
    if (this._clargs.options.host == null) {
      const rpiInfo = new RpiInfo()
      rpiInfo.on('readFile', (fileName) => {
        this.debug('read file %s', fileName)
      })
      rpiInfo.on('exec', (cmd, args) => {
        this.debug('exec %s %s', cmd, args.join(' '))
      })
      info = await rpiInfo.getCpuInfo()
      try {
        state = await rpiInfo.getState()
      } catch (error) {
        // this.error(error)
        this.error(error.message.slice(0, error.message.length - 1)) // FIXME
        return
      }
    } else {
      try {
        const cpuInfo = await this.pi.readFile('/proc/cpuinfo')
        info = RpiInfo.parseCpuInfo(cpuInfo)
        await this.pi.shell('getState')
        const text = await this.pi.readFile('/tmp/getState.json')
        state = RpiInfo.parseState(text)
      } catch (error) {
        this.error(error)
        return
      }
    }
    const json = jsonFormatter.stringify(Object.assign(info, state))
    this.print(json)
  }

  async test (...args) {
    for (;;) {
      try {
        await this.info(...args)
      } catch (error) {
        this.warn(error)
      }
      await homebridgeLib.timeout(5000)
    }
  }

  async closeHandles (...args) {
    const parser = new homebridgeLib.CommandLineParser(packageJson)
    parser.help('h', 'help', this.help)
    parser.parse(...args)
    await this.pi.connect()
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
