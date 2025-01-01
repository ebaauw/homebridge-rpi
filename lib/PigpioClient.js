// homebridge-rpi/lib/PigpioClient.js
// Copyright © 2019-2025 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { EventEmitter, once } from 'node:events'
import { createConnection } from 'node:net'

import { OptionParser } from 'homebridge-lib/OptionParser'

// Commands accepted by pigpio.
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

// Translate command code to command name.
function commandName (command) {
  const name = commandNames[command]
  return name == null ? command : `${name} (${command})`
}

const notifyFlags = Object.freeze({
  GPIO: 0x001F,
  WATCHDOG: 0x0020,
  ALIVE: 0x0040,
  EVENT: 0x0080
})

const modeValues = Object.freeze({
  INPUT: 0,
  OUTPUT: 1
})

const pudValues = Object.freeze({
  off: 0,
  down: 1,
  up: 2
})

// Errors returned by pigpio.
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

// Translate pigpio error number to error message.
function errorMessage (errorNumber) {
  const msg = errorMessages[errorNumber]
  return msg == null ? errorNumber : `${msg} (${errorNumber})`
}

// Commands that return an unsigned value and always succeed.
const unsignedCommands = [10, 11, 16, 17, 26]

// Commands that return extented data.
const extCommands = [
  25, 43, 45, 56, 67, 70, 73, 75, 80, 88, 91, 92, 106, 109, 113, 114
]

/** Client to pigpio's (remote) socket interface.
  *
  * @extends EventEmitter
  */
class PigpioClient extends EventEmitter {
  /** Commands accepted by pigpio.
    * @type {object}
    * @see http://abyz.me.uk/rpi/pigpio/sif.html
    */
  static get commands () {
    return commands
  }

  /** Return the name for a pigpio command.
    * @param {int} cmd - The command.
    * @return {string} - The command name.
    */
  static commandName (cmd) {
    return commandName(cmd)
  }

  /** Return the error message for a pigpio error number.
    * @param {int} errorNumber - The error number.
    * @return {string} - The error messsage.
    */
  static errorMessage (errorNumber) {
    return errorMessage(errorNumber)
  }

  /** Flags to callback of NB command.
    * @type {object}
    * @see https://abyz.me.uk/rpi/pigpio/cif.html#gpioNotifyBegin
    */
  static get notifyFlags () {
    return notifyFlags
  }

  /** Values to MODES command.
    * @type {object}
    * @see http://abyz.me.uk/rpi/pigpio/cif.html#mode
    */
  static get modeValues () {
    return modeValues
  }

  /** Values to PUD command.
    * @type {object}
    * @see http://abyz.me.uk/rpi/pigpio/cif.html#pud
    */
  static get pudValues () {
    return pudValues
  }

  /** Write a pigpio command to a Buffer.
    * @param {Buffer} buffer - The buffer.
    * @param {int} cmd - The command.
    * @param {int} [p1=0] - The command's first parameter.
    * @param {int} [p2=0] - The command's second paramter.
    * @param {string} [p3=''] - The command's third, extended parameter.
    * @param {int} [offset=0] - The offset into the buffer.
    */
  static writeCommand (buffer, cmd, p1 = 0, p2 = 0, p3 = '', offset = 0) {
    buffer.writeUInt32LE(cmd & 0xFFFFFFFF, offset)
    buffer.writeUInt32LE(p1 & 0xFFFFFFFF, offset + 4)
    buffer.writeUInt32LE(p2 & 0xFFFFFFFF, offset + 8)
    buffer.writeUInt32LE(p3.length, offset + 12)
  }

  /** Return a visual representation of a GPIO bitmap.
    * @param {int} map - The GPIO bitmap.
    * @return {string} - The visual represenation of the bitmap of
    * the GPIO bitmap.
    */
  static vmap (map) {
    let s = ''
    for (let i = 32; i--; i >= 0) {
      s += (map & (1 << i)) !== 0 ? 'x' : '.'
      if (i % 4 === 0 && i > 0) {
        s += ' '
      }
    }
    return s
  }

  /** Create a new PigpioClient instance.
    *
    * @param {object} params - Parameters.
    * @param {string} [params.host='localhost:8888'] - Hostname and port of
    * the pigpio server.
    * @param {number} [params.port=8888] - Port of the pigpio socket.
    */
  constructor (params = {}) {
    super()
    this._params = {
      blockSize: 1024,
      hostname: 'localhost',
      port: 8888,
      timeout: 15
    }
    const optionParser = new OptionParser(this._params)
    optionParser.hostKey()
    optionParser.intKey('timeout', 1, 60)
    optionParser.parse(params)
    this._params._hostname = /^\[.*\]$/.test(this._params.hostname)
      ? this._params.hostname.slice(1, -1)
      : this._params.hostname

    this._buffer = Buffer.alloc(16)
    this._buffer.writeUInt32LE(commands.WRITE, 0)
    this._buffer.writeUInt32LE(0, 12)
  }

  /** Hostname for the pigpio socket.
    * @type {string}
    * @readonly
    */
  get hostname () { return this._params.hostname }

  /** Port for the pigpio socket.
    * @type {int}
    * @readonly
    */
  get port () { return this._params.port }

  get connected () { return !!this._connected }

  /** Make a command connection to the pigpio socket
    * for sending commands and receiving responses.
    * @throws `Error` - When connection fails.
    * @emits connect
    */
  async connect () {
    this._cmdSocket = createConnection(this._params.port, this._params._hostname)
    this._cmdSocket
      .on('data', this._onCmdData.bind(this))
      .on('error', () => { this._disconnect() })
      .on('close', () => { this._disconnect() })
    await once(this._cmdSocket, 'ready')
    /** Emitted when client has connected to the pigpio socket.
      * @event PigpioClient#connect
      * @param {string} hostname - The hostname of the pigpio socket.
      * @param {int} port - The port of the pigpio socket.
      */
    this.emit('connect', this._params.hostname, this._params.port)
    this._connected = true
  }

  /** Disconnect from pigpio socket, cancelling any GPIO subscription,
    * and closing any data and any command connection.
    * @throws `Error` - When disconnect fails.
    * @emits disconnect
    */
  async disconnect () {
    if (this._dataHandle != null) {
      try {
        await this.command(commands.NC, this._dataHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._dataHandle
    }
    if (this._fileHandle != null) {
      try {
        await this.command(commands.FC, this._fileHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._fileHandle
    }
    this._disconnect()
  }

  _disconnect () {
    if (this._dataSocket != null) {
      this._dataSocket.destroy()
      this._dataSocket.removeAllListeners()
      delete this._dataSocket
    }
    if (this._cmdSocket != null) {
      this._cmdSocket.destroy()
      this._cmdSocket.removeAllListeners()
      delete this._cmdSocket
    }
    if (this._connected) {
      /** Emitted when client has disconnected from the pigpio socket.
        * @event PigpioClient#disconnect
        * @param {string} hostname - The hostname of the pigpio socket.
        * @param {int} port - The port of the pigpio socket.
        */
      this.emit('disconnect', this._params.hostname, this._params.port)
      this._connected = false
    }
  }

  /** Handle `data` events from the command socket.
    * @param {Buffer} data - The data.
    * @emits data
    */
  _onCmdData (data) {
    /** Emitted when data from the pigpio socket has been received.
      * @event PigpioClient#data
      * @param {Buffer} data - The data.
      */
    this.emit('data', data)
    if (this._data != null) {
      // Previous data was incomplete.
      data = Buffer.concat([this._data, data])
      delete this._data
    }

    while (data.length >= 16) {
      const cmd = data.readUInt32LE(0)
      const res = unsignedCommands.includes(cmd)
        ? data.readUInt32LE(12)
        : data.readInt32LE(12)

      // Commands that return extended status.
      if (res >= 0 && extCommands.includes(cmd)) {
        if (data.length >= 16 + res) {
          this.emit(cmd, res, data.slice(16, 16 + res))
          data = data.slice(16 + res)
        }
        this._data = data
        return
      } else {
        this.emit(cmd, res)
        data = data.slice(16)
      }
    }
  }

  /** Send a command to pigpio.
    * @param {int} cmd - The command.
    * @param {int} [p1=0] - The command's first parameter.
    * @param {int} [p2=0] - The command's second paramter.
    * @param {string} [p3=''] - The command's third, extended parameter.
    * @returns {int|string} The command result.
    * @emits command
    * @emits response
    * @throws `Error` - When command fails.
    */
  async command (cmd, p1 = 0, p2 = 0, p3 = '') {
    /** Emitted when sending a command to the pigpio socket.
      * @event PigpioClient#command
      * @param {int} cmd - The command.
      * @param {int} p1 - The command's first parameter.
      * @param {int} p2 - The command's second paramter.
      * @param {string} p3 - The command's third, extended parameter.
      */
    this.emit(
      'command', cmd, p1, p2,
      cmd === commands.SHELL ? p3.slice(0, p3.length - 1) : p3
    )
    if (this._cmdSocket == null) {
      await this.connect()
    }
    let request = Buffer.alloc(16)
    PigpioClient.writeCommand(request, cmd, p1, p2, p3)
    request = Buffer.concat([request, Buffer.from(p3)])
    const timeout = setTimeout(() => {
      this.emit('error', new Error(`${commandName(cmd)}: timeout`))
    }, this._params.timeout * 1000)
    /** Emitted when writing a request to the pigpio socket.
      * @event PigpioClient#request
      * @param {Buffer} request - The request.
      */
    this.emit('request', request)
    this._cmdSocket.write(request)
    let p
    try {
      p = await once(this, cmd)
    } catch (error) {
      this._disconnect()
      return 0
    }
    clearTimeout(timeout)
    const status = p[0]
    if (status < 0) {
      throw new Error(`${commandName(cmd)}: ${errorMessage(status)}`)
    }
    if (p[1] != null) {
      /** Emitted when receving a command response from the pigpio socket.
        * @event PigpioClient#response
        * @param {int} cmd - The command.
        * @param {int} status - The command return status.
        * @param {?Buffer} result - The command extended result.
        */
      this.emit('response', cmd, status, p[1])
      return p[1]
    }
    this.emit('response', cmd, status)
    return status
  }

  /** Send a buffer to `pigpio`.
    *
    * @param {Buffer} buffer - The buffer to send.
    */
  async sendBuffer (buffer) {
    if (this._cmdSocket == null) {
      await this.connect()
    }
    return new Promise((resolve, reject) => {
      this.emit('request', buffer)
      this._cmdSocket.write(buffer, () => {
        resolve()
      })
    })
  }

  /** Execute a remote shell script.
    * @param {string} script - The script to execute.
    * @returns {int} - The SHELL command return status.
    * @throws `Error` - When SHELL command fails.
    */
  async shell (script) {
    const status = await this.command(
      commands.SHELL, script.length, 0, script + '\0'
    )
    if (status === 32512) {
      throw new Error(
        `${commandName(commands.SHELL)}: ${script}: script not found`
      )
    } else if (status !== 0) {
      throw new Error(
        `${commandName(commands.SHELL)}: ${script}: exit status ${status / 256}`
      )
    }
    return status
  }

  /** Read a remote text file.
    * @param {!string} filename - The name of the file to read.
    * @returns {string} The file contents as string.
    * @throws `Error` - When file cannot be read.
    */
  async readFile (filename) {
    if (this._fileHandle != null) {
      this.emit('warning', new Error(`file handle ${this._fileHandle} still open`))
      try {
        await this.command(commands.FC, this._fileHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._fileHandle
    }
    this._fileHandle = await this.command(commands.FO, 1, 0, filename)
    if (this._fileHandle !== 0) {
      this.emit('warning', new Error(`got file handle ${this._fileHandle}`))
    }
    let s = ''
    let result
    do {
      result = await this.command(commands.FR, this._fileHandle, this._params.blockSize)
      s += result.toString()
    } while (result.length === this._params.blockSize)
    await this.command(commands.FC, this._fileHandle)
    delete this._fileHandle
    return s
  }

  /** Write to a remote text file.
    * @param {!string} filename - The name of the file to write to.
    * @param {!string} text - The text to write.
    * @throws `Error` - When file cannot be written.
    */
  async writeFile (filename, text) {
    if (this._fileHandle != null) {
      this.emit('warning', new Error(`file handle ${this._fileHandle} still open`))
      try {
        await this.command(commands.FC, this._fileHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._fileHandle
    }
    this._fileHandle = await this.command(commands.FO, 2, 0, filename)
    if (this._fileHandle !== 0) {
      this.emit('warning', new Error(`got file handle ${this._fileHandle}`))
    }
    await this.command(commands.FW, this._fileHandle, 0, text)
    await this.command(commands.FC, this._fileHandle)
    delete this._fileHandle
  }

  /** Subscribe to notifications for changed GPIO values.
    *
    * Opens a second data connection to the pigpio socket to receive
    * notifications when GPIOs change state.
    * @param {int} [mask=0xFFFFFFFC] - Bitmask of the GPIOs to monitor
    * (default: 2-31).
    * @emits listen
    * @throws `Error` - When connection fails.
    */
  async listen (mask = 0xFFFFFFFC) {
    if (this._dataHandle != null) {
      try {
        await this.command(commands.NC, this._dataHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._dataHandle
    }

    // Open data socket.
    this._dataSocket = createConnection(this._params.port, this._params._hostname)
    this._dataSocket
      .on('data', this._onDataData.bind(this))
      .on('error', () => { this._disconnect() })
      .on('close', () => {
        // delete this._dataSocket
        this._disconnect()
      })
    await once(this._dataSocket, 'ready')

    // Get notification handle on data socket.
    this.emit('command', commands.NOIB, 0, 0, 0)
    const request = Buffer.alloc(16)
    request.writeUInt32LE(commands.NOIB, 0)
    request.writeUInt32LE(0, 4)
    request.writeUInt32LE(0, 8)
    request.writeUInt32LE(0, 12)
    this.emit('request', request)
    this._dataSocket.write(request)
    const p = await once(this, commands.NOIB)
    const status = p[0]
    this.emit('response', commands.NOIB, status)
    if (status < 0) {
      throw new Error(`${commandName(commands.NOIB)}: ${errorMessage(status)}`)
    }
    this._dataHandle = status
    if (this._dataHandle !== 0) {
      this.emit('warning', new Error(`got data handle ${this._dataHandle}`))
    }

    // Send start notifications commands on command socket
    this._mask = mask
    await this.command(commands.NB, this._dataHandle, mask)
    /** Emitted when client has subscribed to GPIO notifications.
      * @event PigpioClient#listen
      * @param {int} mask - A bitmap of the subscribed GPIOs.
      */
    this.emit('listen', mask)

    // Get initial map.
    const map = await this.command(commands.BR1)
    const tick = await this.command(commands.TICK)
    this._checkNotification({ flags: 0x0000, tick, map })
  }

  /** Handle `data` events from the data socket.
    * @param {Buffer} data - Data.
    * @emits data
    */
  _onDataData (data) {
    this.emit('data', data)
    while (data.length >= 12) {
      if (
        data.length >= 16 && data.readUInt32LE(0) === commands.NOIB &&
        data.readUInt32LE(4) === 0 && data.readUInt32LE(8) === 0
      ) {
        // Response to NOIB command.
        const res = data.readInt32LE(12)
        this.emit(commands.NOIB, res)
        data = data.slice(16)
        continue
      }
      this._checkNotification({
        seqno: data.readUInt16LE(0),
        flags: data.readUInt16LE(2),
        tick: data.readUInt32LE(4),
        map: data.readUInt32LE(8)
      })
      data = data.slice(12)
    }
  }

  /** Handle `pigpio` notification from the data socket.
    * @param {Object} payload - The `pigpio` notification payload.
    * @param {?int} payload.seqno - The sequence number.
    @ @param {int} payload.flags - A bitmap of notification flags.
    * @param {int} payload.tick - Timestamp in µs (wraps at 2^32).
    * @param {int} payload.map - A bitmap of the GPIO values.
    * @emits notification
    */
  _checkNotification (payload) {
    payload.map &= this._mask
    /** Emitted when a GPIO notification is received from pigpio.
      * @event PigpioClient#notification
      * @param {Object} payload - The `pigpio` notification payload.
      * @param {?int} payload.seqno - The sequence number.
      @ @param {int} payload.flags - A bitmap of notification flags.
      * @param {?int} payload.tick - Timestamp in µs (wraps at 2^32).
      * @param {int} payload.map - A bitmap of the GPIO values.
      * the GPIO values.
      */
    this.emit('notification', payload)

    if (payload.flags === 0) {
      for (let gpio = 0; gpio < 32; gpio++) {
        this._checkGpio(payload, gpio)
      }
    } else if (payload.flags & notifyFlags.WATCHDOG) {
      this._checkGpio(payload, payload.flags & notifyFlags.GPIO, true)
    }
    this._map = payload.map
  }

  /** Handle `data` events from the data socket.
    * @param {Buffer} data - Data.
    * @param {Object} payload - The `pigpio` notification payload.
    * @param {?int} payload.seqno - The sequence number.
    @ @param {int} payload.flags - A bitmap of notification flags.
    * @param {?int} payload.tick - Timestamp in µs (wraps at 2^32).
    * @param {int} payload.map - A bitmap of the GPIO values.
    * @param {int} gpio - The number of the GPIO to check.
    * @param {boolean} [watchDog = false] - True iff notification was issued
    * because of a watchdog timer or initial setup.
    * @emits gpioN
    */
  _checkGpio (payload, gpio, watchDog = (this._map == null)) {
    const mask = 1 << gpio
    if (this._mask & mask) {
      const value = (payload.map & mask) !== 0
      const oldValue = (this._map & mask) !== 0
      if (watchDog || value !== oldValue) {
        /** Emitted when a GPIO pin has changed value or received a watchdog
          * timeout
          * @event PigpioClient#gpioN
          * @param {Object} payload- The `pigpio` notification payload.
          * @param {boolean} payload.value - The value of the GPIO pin.
          // * @param {boolean} payload.oldValue - The old value of the GPIO pin.
          * @param {int} payload.tick - Timestamp in µs (wraps at 2^32).
          * @param {boolean} payload.watchDog - Event triggered by watchdog timer.
          */
        this.emit('gpio' + gpio, { value, tick: payload.tick, watchDog })
      }
    }
  }
}

export { PigpioClient }
