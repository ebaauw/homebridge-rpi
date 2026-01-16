// homebridge-rpi/lib/PigpioClient.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { timeout } from 'homebridge-lib'
import { OptionParser } from 'homebridge-lib/OptionParser'

import { GpioClient } from '../GpioClient.js'

function gcd (x, y) {
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x
}

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
  * @extends GpioClient
  */
class PigpioClient extends GpioClient {
  /** Create a new PigpioClient instance.
    *
    * @param {object} params - Parameters.
    * @param {string} [params.host='localhost:8888'] - Hostname and port of
    * the pigpio server.<br>
    * Can also be specified through the environment variable PIGPIO_ADDR.
    * @param {int} [timeout=15] - Timeout in seconds for socket operations.
    */
  constructor (params = {}) {
    super()
    this._params = {
      blockSize: 1024,
      hostname: process.env.PIGPIO_ADDR || 'localhost',
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
  }

  get mesageSize () { return 16 }

  get notificationSize () { return 12 }

  /** Commands accepted by pigpio.
    * @type {object}
    * @see http://abyz.me.uk/rpi/pigpio/sif.html
    */
  get commands () {
    return commands
  }

  /** Return the name for a pigpio command.
    * @param {int} cmd - The command.
    * @return {string} - The command name.
    */
  commandName (cmd) {
    const name = commandNames[cmd]
    return name == null ? cmd : `${name} (${cmd})`
  }

  /** Return the error message for a pigpio error number.
    * @param {int} errorNumber - The error number.
    * @return {string} - The error messsage.
    */
  errorMessage (errorNumber) {
    return errorMessage(errorNumber)
  }

  /** Flags to callback of NB command.
    * @type {object}
    * @see https://abyz.me.uk/rpi/pigpio/cif.html#gpioNotifyBegin
    */
  get notifyFlags () {
    return notifyFlags
  }

  /** Values to MODES command.
    * @type {object}
    * @see http://abyz.me.uk/rpi/pigpio/cif.html#mode
    */
  get modeValues () {
    return modeValues
  }

  /** Values to PUD command.
    * @type {object}
    * @see http://abyz.me.uk/rpi/pigpio/cif.html#pud
    */
  get pudValues () {
    return pudValues
  }

  /** Make a command connection to the pigpio socket
    * for sending commands and receiving responses.
    * @throws `Error` - When connection fails.
    * @emits connect
    */
  async connect () {
    await super.connect()
    await this.command(commands.HWVER)
    this.emit('message', 'connected to pigpio')
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
  async listen (mask = 0x0FFFFFFC) {
    if (this.dataHandle != null) {
      try {
        await this.command(commands.NC, this.dataHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this.dataHandle
    }

    await super.listen(mask)

    if (this.dataHandle !== 0) {
      this.emit('warning', new Error(`got data handle ${this.dataHandle}`))
    }

    this.mask = mask
    await this.command(commands.NB, this.dataHandle, mask >>> 0)

    // Get initial map.
    const map = (await this.command(commands.BR1)).status
    const tick = (await this.command(commands.TICK)).status
    this.#checkNotification({ seqno: 0, flags: 0x0000, tick, map })
  }

  /** Disconnect from pigpio socket, cancelling any GPIO subscription,
    * and closing any data and any command connection.
    * @throws `Error` - When disconnect fails.
    * @emits disconnect
    */
  async disconnect () {
    if (this.dataHandle != null) {
      try {
        await this.command(commands.NC, this.dataHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this.dataHandle
    }
    if (this.fileHandle != null) {
      try {
        await this.command(commands.FC, this.fileHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this.fileHandle
    }
    super.disconnect()
  }

  /** Return the buffer size needed to hold command parameters.
    * @param {object} [params={}] - The command parameters.
    * @returns {int} - The buffer size.
    */
  bufferSize (params) {
    return this.messageSize + (Buffer.byteLength(params.p3) ?? 0)
  }

  /** Encode a command into a Buffer.
    * @param {Buffer} buffer - The buffer.
    * @param {int} cmd - The command.
    * @param {object} [params={}] - The command parameters.
    * @param {int} [offset=0] - The offset into the buffer.
    */
  encode (buffer, cmd, params, offset = 0) {
    buffer.writeUInt32LE(cmd & 0xFFFFFFFF, offset)
    buffer.writeUInt32LE((params.p1 & 0xFFFFFFFF) >>> 0, offset + 4)
    buffer.writeUInt32LE((params.p2 & 0xFFFFFFFF) >>> 0, offset + 8)
    buffer.writeUInt32LE(params.p3.length, offset + 12)
    if (params.p3 !== '') {
      buffer.write(params.p3, offset + 16)
    }
  }

  /** Decode a command response from the GPIO server.
    * @params {Buffer} data - The data received.
    * @returns int - The number of bytes consumed from data.
    * @emits GpioClient#command
    */
  decode (data) {
    const cmd = data.readUInt32LE(0)
    const result = {
      status: unsignedCommands.includes(cmd)
        ? data.readUInt32LE(12)
        : data.readInt32LE(12)
    }
    let len = this.messageSize
    // Commands that return extended status.
    if (result.status >= 0 && extCommands.includes(cmd)) {
      len += result.status
      if (data.length < len) {
        return 0
      }
      const buffer = data.subarray(this.messageSize, len)
      result.string = buffer.toString()
      if (cmd === commands.FR) {
        result.more = buffer.length === this._params.blockSize
      }
    }
    this.emit(cmd, result)
    return len
  }

  /** Decode a notification from the GPIO server.
    * @params {Buffer} data - The data received.
    * @returns int - The number of bytes consumed from data.
    * @emits GpioClient#gpioN
    * @emits PigpioClient#gpioN
    */
  ntfDecode (data) {
    this.#checkNotification({
      seqno: data.readUInt16LE(0),
      flags: data.readUInt16LE(2),
      tick: data.readUInt32LE(4),
      map: data.readUInt32LE(8)
    })
    return this.notificationSize
  }

  #checkNotification (payload) {
    payload.map &= this.mask
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
        this.#checkGpio(payload, gpio)
      }
    } else if (payload.flags & notifyFlags.WATCHDOG) {
      this.#checkGpio(payload, payload.flags & notifyFlags.GPIO, true)
    }
    this._map = payload.map
  }

  #checkGpio (payload, gpio, watchDog = (this._map == null)) {
    const mask = 1 << gpio
    if (this.mask & mask) {
      const value = (payload.map & mask) !== 0
      const oldValue = (this._map & mask) !== 0
      if (watchDog || value !== oldValue) {
        /** Emitted when a GPIO pin has changed value or received a watchdog
          * timeout
          * @event GpioClient#gpioN
          * @param {Object} payload- The `pigpio` notification payload.
          * @param {boolean} payload.value - The value of the GPIO pin.
          * @param {int} payload.tick - Timestamp in µs (wraps at 2^32).
          * @param {boolean} payload.watchDog - Event triggered by watchdog timer.
          */
        this.emit('gpio' + gpio, { value, tick: payload.tick, watchDog })
      }
    }
  }

  /** Send a command to pigpio.
    * @param {int} cmd - The command.
    * @param {int} [p1=0] - The command's first parameter.
    * @param {int} [p2=0] - The command's second paramter.
    * @param {string} [p3=''] - The command's third, extended parameter.
    * @returns {int|string} The command response.
    * @emits command
    * @emits response
    * @throws `Error` - When command fails.
    */
  async command (cmd, p1 = 0, p2 = 0, p3 = '') {
    if (typeof p1 === 'object' && p1 != null) {
      return super.command(cmd, p1)
    }
    return super.command(cmd, { p1, p2, p3 })
  }

  setOutputCommand (gpio) {
    return {
      cmd: this.commands.MODEG,
      params: { p1: gpio, p2: this.modeValues.OUTPUT, p3: '' }
    }
  }

  writeCommand (gpio, value) {
    return {
      cmd: this.commands.WRITE,
      params: { p1: gpio, p2: (value ? 1 : 0), p3: '' }
    }
  }

  async setInput (gpio, pud = this.pudValues.off, debounceTimeout = 0) {
    await this.command(this.commands.MODES, gpio, this.modeValues.INPUT)
    await this.command(this.commands.PUD, gpio, pud)
    if (debounceTimeout > 0) {
      await this.command(this.commands.FG, gpio, debounceTimeout)
    }
  }

  async setOutput (gpio, value) {
    if (value != null) {
      await this.command(this.commands.WRITE, gpio, (value ? 1 : 0))
    }
    await this.command(this.commands.MODES, gpio, this.modeValues.OUTPUT)
  }

  async setWatchDog (gpio, doublePressTimeout, longPressTimeout) {
    const timeout = doublePressTimeout > 0
      ? longPressTimeout > 0
        ? gcd(doublePressTimeout, longPressTimeout)
        : doublePressTimeout
      : longPressTimeout > 0
        ? longPressTimeout
        : 0
    await this.command(this.commands.WDOG, gpio, timeout)
  }

  async dhtPoll (gpio) {
    await this.write(gpio, 0)
    await timeout(18)
    await this.setInput(gpio, this.pudValues.up)
  }

  async write (gpio, value) {
    await this.command(this.commands.WRITE, gpio, (value ? 1 : 0))
  }

  /** Execute a remote shell script.
    * @param {string} script - The script to execute.
    * @returns {int} - The SHELL command return status.
    * @throws `Error` - When SHELL command fails.
    */
  async shell (script) {
    await super.shell(script)
    const status = (await this.command(
      commands.SHELL, script.length, 0, script + '\0'
    )).status
    if (status === 32512) {
      throw new Error(
        `${this.commandName(commands.SHELL)}: ${script}: script not found`
      )
    } else if (status !== 0) {
      throw new Error(
        `${this.commandName(commands.SHELL)}: ${script}: exit status ${status / 256}`
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
    await super.readFile(filename)
    if (this.fileHandle != null) {
      this.emit('warning', new Error(`file handle ${this.fileHandle} still open`))
      try {
        await this.command(commands.FC, this.fileHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this.fileHandle
    }
    this.fileHandle = (await this.command(commands.FO, 1, 0, filename)).status
    if (this.fileHandle !== 0) {
      this.emit('warning', new Error(`got file handle ${this.fileHandle}`))
    }
    let s = ''
    let response
    do {
      response = await this.command(
        commands.FR, this.fileHandle, this._params.blockSize
      )
      s += response.string
    } while (response.more)
    await this.command(commands.FC, this.fileHandle)
    delete this.fileHandle
    return s
  }

  /** Write to a remote text file.
    * @param {!string} filename - The name of the file to write to.
    * @param {!string} text - The text to write.
    * @throws `Error` - When file cannot be written.
    */
  async writeFile (filename, text) {
    await super.writeFile(filename, text)
    if (this.fileHandle != null) {
      this.emit('warning', new Error(`file handle ${this.fileHandle} still open`))
      try {
        await this.command(commands.FC, this.fileHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this.fileHandle
    }
    this.fileHandle = (await this.command(commands.FO, 2, 0, filename)).status
    if (this.fileHandle !== 0) {
      this.emit('warning', new Error(`got file handle ${this.fileHandle}`))
    }
    await this.command(commands.FW, this.fileHandle, 0, text)
    await this.command(commands.FC, this.fileHandle)
    delete this.fileHandle
  }
}

GpioClient.Pigpio = PigpioClient
