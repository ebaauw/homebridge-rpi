// homebridge-rpi/lib/PigpioClient.js
// Copyright © 2019-2020 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

'use strict'

const events = require('events')
const homebridgeLib = require('homebridge-lib')
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

const _commandNames = {}
for (const key in commands) {
  _commandNames[commands[key]] = key
}
const commandNames = Object.freeze(_commandNames)

function commandName (command) {
  const name = commandNames[command]
  return name == null ? command : `${name} (${command})`
}

const errorMessages = Object.freeze({
  '-1': 'gpioInitialise failed',
  '-2': 'GPIO not 0-31',
  '-3': 'GPIO not 0-53',
  '-4': 'mode not 0-7',
  '-5': 'level not 0-1',
  '-6': 'pud not 0-2',
  '-7': 'pulsewidth not 0 or 500-2500',
  '-8': 'dutycycle outside set range',
  '-9': 'timer not 0-9',
  '-10': 'ms not 10-60000',
  '-11': 'timetype not 0-1',
  '-12': 'seconds < 0',
  '-13': 'micros not 0-999999',
  '-14': 'gpioSetTimerFunc failed',
  '-15': 'timeout not 0-60000',
  '-16': 'DEPRECATED',
  '-17': 'clock peripheral not 0-1',
  '-18': 'DEPRECATED',
  '-19': 'clock micros not 1, 2, 4, 5, 8, or 10',
  '-20': 'buf millis not 100-10000',
  '-21': 'dutycycle range not 25-40000',
  '-22': 'signum not 0-63',
  '-23': 'can\'t open pathname',
  '-24': 'no handle available',
  '-25': 'unknown handle',
  '-26': 'ifFlags > 4',
  '-27': 'DMA primary channel not 0-15',
  '-28': 'socket port not 1024-32000',
  '-29': 'unrecognized fifo command',
  '-30': 'DMA secondary channel not 0-15',
  '-31': 'function called before gpioInitialise',
  '-32': 'function called after gpioInitialise',
  '-33': 'waveform mode not 0-3',
  '-34': 'bad parameter in gpioCfgInternals call',
  '-35': 'baud rate not 50-250K(RX)/50-1M(TX)',
  '-36': 'waveform has too many pulses',
  '-37': 'waveform has too many chars',
  '-38': 'no bit bang serial read on GPIO',
  '-39': 'bad (null) serial structure parameter',
  '-40': 'bad (null) serial buf parameter',
  '-41': 'GPIO operation not permitted',
  '-42': 'one or more GPIO not permitted',
  '-43': 'bad WVSC subcommand',
  '-44': 'bad WVSM subcommand',
  '-45': 'bad WVSP subcommand',
  '-46': 'trigger pulse length not 1-100',
  '-47': 'invalid script',
  '-48': 'unknown script id',
  '-49': 'add serial data offset > 30 minutes',
  '-50': 'GPIO already in use',
  '-51': 'must read at least a byte at a time',
  '-52': 'script parameter id not 0-9',
  '-53': 'script has duplicate tag',
  '-54': 'script has too many tags',
  '-55': 'illegal script command',
  '-56': 'script variable id not 0-149',
  '-57': 'no more room for scripts',
  '-58': 'can\'t allocate temporary memory',
  '-59': 'socket read failed',
  '-60': 'socket write failed',
  '-61': 'too many script parameters (> 10)',
  '-62': 'script initialising',
  '-63': 'script has unresolved tag',
  '-64': 'bad MICS delay (too large)',
  '-65': 'bad MILS delay (too large)',
  '-66': 'non existent wave id',
  '-67': 'No more CBs for waveform',
  '-68': 'No more OOL for waveform',
  '-69': 'attempt to create an empty waveform',
  '-70': 'no more waveforms',
  '-71': 'can\'t open I2C device',
  '-72': 'can\'t open serial device',
  '-73': 'can\'t open SPI device',
  '-74': 'bad I2C bus',
  '-75': 'bad I2C address',
  '-76': 'bad SPI channel',
  '-77': 'bad i2c/spi/ser open flags',
  '-78': 'bad SPI speed',
  '-79': 'bad serial device name',
  '-80': 'bad serial baud rate',
  '-81': 'bad i2c/spi/ser parameter',
  '-82': 'i2c write failed',
  '-83': 'i2c read failed',
  '-84': 'bad SPI count',
  '-85': 'ser write failed',
  '-86': 'ser read failed',
  '-87': 'ser read no data available',
  '-88': 'unknown command',
  '-89': 'spi xfer/read/write failed',
  '-90': 'bad (NULL) pointer',
  '-91': 'no auxiliary SPI on Pi A or B',
  '-92': 'GPIO is not in use for PWM',
  '-93': 'GPIO is not in use for servo pulses',
  '-94': 'GPIO has no hardware clock',
  '-95': 'GPIO has no hardware PWM',
  '-96': 'invalid hardware PWM frequency',
  '-97': 'hardware PWM dutycycle not 0-1M',
  '-98': 'invalid hardware clock frequency',
  '-99': 'need password to use hardware clock 1',
  '-100': 'illegal, PWM in use for main clock',
  '-101': 'serial data bits not 1-32',
  '-102': 'serial (half) stop bits not 2-8',
  '-103': 'socket/pipe message too big',
  '-104': 'bad memory allocation mode',
  '-105': 'too many I2C transaction segments',
  '-106': 'an I2C transaction segment failed',
  '-107': 'SMBus command not supported by driver',
  '-108': 'no bit bang I2C in progress on GPIO',
  '-109': 'bad I2C write length',
  '-110': 'bad I2C read length',
  '-111': 'bad I2C command',
  '-112': 'bad I2C baud rate, not 50-500k',
  '-113': 'bad chain loop count',
  '-114': 'empty chain loop',
  '-115': 'too many chain counters',
  '-116': 'bad chain command',
  '-117': 'bad chain delay micros',
  '-118': 'chain counters nested too deeply',
  '-119': 'chain is too long',
  '-120': 'deprecated function removed',
  '-121': 'bit bang serial invert not 0 or 1',
  '-122': 'bad ISR edge value, not 0-2',
  '-123': 'bad ISR initialisation',
  '-124': 'loop forever must be last command',
  '-125': 'bad filter parameter',
  '-126': 'bad pad number',
  '-127': 'bad pad drive strength',
  '-128': 'file open failed',
  '-129': 'bad file mode',
  '-130': 'bad file flag',
  '-131': 'bad file read',
  '-132': 'bad file write',
  '-133': 'file not open for read',
  '-134': 'file not open for write',
  '-135': 'bad file seek',
  '-136': 'no files match pattern',
  '-137': 'no permission to access file',
  '-138': 'file is a directory',
  '-139': 'bad shell return status',
  '-140': 'bad script name',
  '-141': 'bad SPI baud rate, not 50-500k',
  '-142': 'no bit bang SPI in progress on GPIO',
  '-143': 'bad event id',
  '-144': 'used by Python',
  '-145': 'not available on BCM2711',
  '-146': 'only available on BCM2711'
})

function errorMessage (errorNumber) {
  const msg = errorMessages[errorNumber]
  return msg == null ? errorNumber : `${msg} (${errorNumber})`
}

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
  constructor (options = {}) {
    super()
    this._options = {
      hostname: 'localhost',
      port: 8888
    }
    const optionParser = new homebridgeLib.OptionParser(this._options)
    optionParser.hostKey()
    optionParser.parse(options)
    this._hostname = this._options.hostname
    this._port = this._options.port
    this._blockSize = 1024
  }

  get hostname () { return this._hostname }

  get port () { return this._port }

  /** Connect to pigpio.
    * @throws
    */
  async connect () {
    this._cmdSocket = net.createConnection(this._port, this._hostname)
    this._cmdSocket.on('data', this._onCmdData.bind(this))
    this._cmdSocket.on('error', async (error) => {
      this.emit('error', error)
      this._cmdSocket.destroy()
      delete this._cmdSocket
    })
    await events.once(this._cmdSocket, 'ready')
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
      this.emit(
        'error',
        new Error(`expected ${commandName(this._cmd)}, got ${commandName(cmd)}`)
      )
    }
    if (unsignedCommands.includes(cmd)) {
      this.emit(cmd, data.readUInt32LE(12))
      return
    }
    const res = data.readInt32LE(12)
    if (res < 0) {
      this.emit(
        'error', new Error(`${commandName(cmd)}: error ${errorMessage(res)}`)
      )
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
    * @throws
    */
  async command (cmd, p1 = 0, p2 = 0, p3 = Buffer.from('')) {
    if (this._cmdSocket == null) {
      await this.connect()
    }
    this._cmd = cmd
    this._p1 = p1
    this._p2 = p2
    this.emit('command', commandName(cmd), p1, p2, p3.toString())
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
    this.emit('response', commandName(cmd), p[0])
    return p[0]
  }

  /** Sens a shell command to pigpio.
    * @param {string} script - The script to execute.
    * @param {string} params - Parameters to the script.
    * @returns {int} - The command result
    * @throws
    */
  async shell (script, params = '') {
    return this.command(commands.SHELL, script.length, 0, Buffer.concat(
      [Buffer.from(script), Buffer.from([0]), Buffer.from(params)]
    ))
  }

  /** Read a text file.
    * @param {!string} filename - The name of the file to read.
    * @returns {string} The file contents as string.
    * @throws
    */
  async readFile (filename) {
    const handle = await this.command(commands.FO, 1, 0, Buffer.from(filename))
    if (handle !== 0) {
      this.emit('error', new Error('file handle !== 0'))
    }
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
    if (this._dataHandle !== 0) {
      this.emit('error', new Error('data handle !== 0'))
    }

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
        throw new Error(
          `${commandName(commands.NOIB)}: error ${errorMessage(res)}`
        )
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
