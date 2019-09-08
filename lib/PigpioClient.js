// homebridge-rpi/lib/PigpioClient.js
// Copyright © 2019 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const events = require('events')
const net = require('net')

// pigpio socket commmands
// See: http://abyz.me.uk/rpi/pigpio/sif.html
const commands = Object.freeze({
  MODES: 0,
  MODEG: 1,
  PUD: 2,
  READ: 3,
  WRITE: 4,
  PWM: 5,
  PRS: 6,
  PFS: 7,
  SERVO: 8,
  WDOG: 9,
  BR1: 10,
  BR2: 11,
  BC1: 12,
  BC2: 13,
  BS1: 14,
  BS2: 15,
  TICK: 16,
  HWVER: 17,
  NO: 18,
  NB: 19,
  NP: 20,
  NC: 21,
  PRG: 22,
  PFG: 23,
  PRRG: 24,
  HELP: 25,
  PIGPV: 26,
  WVCLR: 27,
  WVAG: 28,
  WVAS: 29,
  WVBSY: 32,
  WVHLT: 33,
  WVSM: 34,
  WVSP: 35,
  WVSC: 36,
  TRIG: 37,
  PROC: 38,
  PROCD: 39,
  PROCR: 40,
  PROCS: 41,
  SLRO: 42,
  SLR: 43,
  SLRC: 44,
  PROCP: 45,
  MICS: 46,
  MILS: 47,
  PARSE: 48,
  WVCRE: 49,
  WVDEL: 50,
  WVTX: 51,
  WVTXR: 52,
  WVNEW: 53,
  I2CO: 54,
  I2CC: 55,
  I2CRD: 56,
  I2CWD: 57,
  I2CWQ: 58,
  I2CRS: 59,
  I2CWS: 60,
  I2CRB: 61,
  I2CWB: 62,
  I2CRW: 63,
  I2CWW: 64,
  I2CRK: 65,
  I2CWK: 66,
  I2CRI: 67,
  I2CWI: 68,
  I2CPC: 69,
  I2CPK: 70,
  SPIO: 71,
  SPIC: 72,
  SPIR: 73,
  SPIW: 74,
  SPIX: 75,
  SERO: 76,
  SERC: 77,
  SERRB: 78,
  SERWB: 79,
  SERR: 80,
  SERW: 81,
  SERDA: 82,
  GDC: 83,
  GPW: 84,
  HC: 85,
  HP: 86,
  CF1: 87,
  CF2: 88,
  BI2CC: 89,
  BI2CO: 90,
  BI2CZ: 91,
  I2CZ: 92,
  WVCHA: 93,
  SLRI: 94,
  CGI: 95,
  CSI: 96,
  FG: 97,
  FN: 98,
  NOIB: 99,
  WVTXM: 100,
  WVTAT: 101,
  PADS: 102,
  PADG: 103,
  FO: 104,
  FC: 105,
  FR: 106,
  FW: 107,
  FS: 108,
  FL: 109,
  SHELL: 110,
  BSPIC: 111,
  BSPIO: 112,
  BSPIX: 113,
  BSCX: 114,
  EVM: 115,
  EVT: 116,
  PROCU: 117
})

// Commands that return an unsigned value.
const unsignedCommands = [10, 11, 16, 17, 26]

// Commands that return extented data.
const extCommands = [
  25, 43, 45, 56, 67, 70, 73, 75, 80, 88, 91, 92, 106, 109, 113, 114
]

/** Client to pigpio's (remote) socket interface.
  *
  * @extends Eventemitter
  */
class PigpioClient extends events.EventEmitter {
  /** Socket commands exposed by pigpio.
    * @type {object}
    */
  static get commands () {
    return commands
  }

  /** Create a new PigpioClient instance.
    *
    * @param {string} [hostname='localhost'] - Hostname of the pigpio socket.
    * @param {number} [port=8888] - Port of the pigpio socket.
    */
  constructor (hostname = 'localhost', port = 8888) {
    super()
    this._hostname = hostname
    this._port = port
    this._blockSize = 1024
  }

  get hostname () { return this._hostname }

  get port () { return this._port }

  /** Connect to pigpio.
    */
  async connect () {
    try {
      this._cmdSocket = net.createConnection(this._port, this._hostname)
      this._cmdSocket.on('data', this._onCmdData.bind(this))
      await events.once(this._cmdSocket, 'ready')
    } catch (error) {
      this.emit('error', error)
    }
  }

  /** Disconnect from pigpio.
    */
  async disconnect () {
    await this.stopListen()
    if (this._cmdSocket != null) {
      this._cmdSocket.destroy()
      delete this._cmdSocket
    }
  }

  /** Handle data from pigpio.
    * @param {Buffer} data - Data.
    * @emits data
    */
  _onCmdData (data) {
    /** Emitted when data is received from pigpio.
      * @param {Buffer} data
      */
    this.emit('data', data)
    if (this._data != null) {
      // Previous data was incomplete.
      data = Buffer.concat([this._data, data])
      delete this._data
    }
    const cmd = data.readUInt32LE(0)
    const p1 = data.readUInt32LE(4)
    const p2 = data.readUInt32LE(8)
    // TODO? Compare buffer range instead of fields.
    if (cmd !== this._cmd || p1 !== this._p1 || p2 !== this._p2) {
      this.emit('error', `expected ${this._cmd}, got ${cmd}`)
    }
    if (unsignedCommands.includes(cmd)) {
      this.emit(cmd, data.readUInt32LE(12))
      return
    }
    const res = data.readInt32LE(12)
    if (res < 0) {
      // TODO translate cmd to hex.
      // TODO translate error number to error message
      this.emit('error', `${cmd}: error ${res}`)
    }
    if (extCommands.includes(cmd)) {
      if (data.length >= 16 + res) {
        this.emit(cmd, data.slice(16))
        return
      }
      this._data = data
      return
    }
    this.emit(cmd, res)
  }

  /** Send a command to pigpio.
    *
    * @param {int} cmd - The command.
    * @param {?int} p1 - The command's first parameter.
    * @param {?int} p2 - The command's second paramter.
    * @prama {?Buffer} p3 - The command's third, extended parameter.
    * @returns {int|Buffer} The command result.
    */
  async command (cmd, p1 = 0, p2 = 0, p3 = Buffer.from('')) {
    try {
      this._cmd = cmd
      this._p1 = p1
      this._p2 = p2
      let request = Buffer.alloc(16)
      request.writeUInt32LE(cmd, 0)
      request.writeUInt32LE(p1, 4)
      request.writeUInt32LE(p2, 8)
      request.writeUInt32LE(p3.length, 12)
      request = Buffer.concat([request, p3])
      /** Emitted before request is sent to pigpio.
        * @event PigpioClient#request
        * @param {Buffer} request
        */
      this.emit('request', request)
      this._cmdSocket.write(request)
      const p = await events.once(this, cmd)
      return p[0]
    } catch (error) {
      this.emit('error', error)
    }
  }

  async shell (script, params = '') {
    return this.command(commands.SHELL, script.length, 0, Buffer.concat(
      [Buffer.from(script), Buffer.from([0]), Buffer.from(params)]
    ))
  }

  /** Read a text file.
    * @param {!string} filename - The name of the file to read.
    * @returns {string} The file contents as string.
    */
  async readFile (filename) {
    const handle = await this.command(commands.FO, 1, 0, Buffer.from(filename))
    let s = ''
    let result
    do {
      result = await this.command(commands.FR, handle, this._blockSize)
      s += result.toString()
    } while (result.length === this._blockSize)
    await this.command(commands.FC, handle)
    return s
  }

  /** Listen to notifications for changed GPIO values.
    *
    * Opens a second connection to pigpio to receive notifications.
    * @param {int} mask - Bitmask of the GPIO pins to monitor.
    * @emits request
    */
  async listen (mask = 0x0ffffffc) {
    this._dataSocket = net.createConnection(this._port, this._hostname)
    this._dataSocket.on('data', this._onDataData.bind(this))
    await events.once(this._dataSocket, 'ready')

    const request = Buffer.alloc(16)
    request.writeUInt32LE(commands.NOIB, 0)
    request.writeUInt32LE(0, 4)
    request.writeUInt32LE(0, 8)
    request.writeUInt32LE(0, 12)
    this.emit('request', request)
    this._dataSocket.write(request)
    const p = await events.once(this, commands.NOIB)
    this._dataHandle = p[0]

    this._mask = mask
    await this.command(commands.NB, this._dataHandle, mask)
  }

  /** Stop listening for GPIO changes.
    */
  async stopListen () {
    if (this._dataHandle != null) {
      await this.command(commands.NC, this._dataHandle)
      delete this._dataHandle
    }
    if (this._dataSocket != null) {
      this._dataSocket.destroy()
      delete this._dataSocket
    }
  }

  /** Handle 'data' events from this._dataSocket.
    * @param {Buffer} data - Data.
    * @emits data
    * @emits notification
    */
  _onDataData (data) {
    this.emit('data', data)
    if (
      data.length === 16 && data.readUInt32LE(0) === commands.NOIB &&
      data.readUInt32LE(4) === 0 && data.readUInt32LE(8) === 0
    ) {
      // Response to NOIB command.
      const res = data.readInt32LE(12)
      if (res < 0) {
        throw new Error(`${commands.NOIB}: error ${res}`)
      }
      this.emit(commands.NOIB, res)
      return
    }
    while (data.length >= 12) {
      // const seqno = data.readUInt16LE(0)
      // const flags = data.readUInt16LE(2)
      // const tick = data.readUInt32LE(4)
      const level = data.readUInt32LE(8) & this._mask
      // TODO: notification per changed GPIO.
      this.emit('notification', level)
      data = data.slice(12)
    }
  }
}

module.exports = PigpioClient
