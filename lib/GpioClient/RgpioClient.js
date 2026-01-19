// homebridge-rpi/lib/RgpioClient.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { createHash, randomBytes } from 'node:crypto'

import { timeout, toHexString } from 'homebridge-lib'
import { OptionParser } from 'homebridge-lib/OptionParser'

import { GpioClient } from '../GpioClient.js'

const LG_MAGIC = 0x6C67646D // 'lgdm'

const alertModes = Object.freeze({
  risingEdge: 1,
  fallingEdge: 2,
  bothEdges: 3
})

// Commands accepted by rgpio.
const commands = Object.freeze({
  FO: 1, // file open
  FC: 2, // file close
  FR: 3, // file read
  FW: 4, // file write
  FS: 5, // file seek
  FL: 6, // file list

  GO: 10, // gpiochip open
  GC: 11, // gpiochip close

  GSIX: 12, // gpio claim for input
  GSOX: 13, // gpio claim for output
  GSAX: 14, // gpio claim for alerts
  GSF: 15, // gpio free

  GSGIX: 16, // gpio group claim for input
  GSGOX: 17, // gpio group claim for output
  GSGF: 18, // gpio group free

  GR: 19, // gpio read
  GW: 20, // gpio write
  GGR: 21, // gpio group read
  GGWX: 22, // gpio group write

  GPX: 23, // gpio software timed pulses
  PX: 24, // gpio software timed PWM
  SX: 25, // gpio software timed servo pulses
  GWAVE: 26, // gpio software timed waves
  GBUSY: 27, // tx busy
  GROOM: 28, // tx room
  GDEB: 29, // gpio set debounce time
  GWDOG: 30, // gpio set watchdog time

  GIC: 31, // gpiochip get chip info
  GIL: 32, // gpiochip get line info
  GMODE: 33, // gpio get mode

  I2CO: 40, // I2C open
  I2CC: 41, // I2C close
  I2CRD: 42, // I2C read device
  I2CWD: 43, // I2C write device
  I2CWQ: 44, // SMBus Write Quick
  I2CRS: 45, // SMBus Read Byte
  I2CWS: 46, // SMBus Write Byte
  I2CRB: 47, // SMBus Read Byte Data
  I2CWB: 48, // SMBus Write Byte Data
  I2CRW: 49, // SMBus Read Word
  I2CWW: 50, // SMBus Write Word
  I2CRK: 51, // SMBus Read Block Data
  I2CWK: 52, // SMBus Write Block Data
  I2CRI: 53, // SMBus Read I2C Block Data
  I2CWI: 54, // SMBus Write I2C Block Data
  I2CPC: 55, // SMBus Process Call
  I2CPK: 56, // SMBus Block Process Call
  I2CZ: 57, // I2C zip (multiple commands)

  NO: 70, // notification open
  NC: 71, // notification close
  NR: 72, // notification resume
  NP: 73, // notification pause

  PARSE: 80, // script parse
  PROC: 81, // script store
  PROCD: 82, // script delete
  PROCP: 83, // script status
  PROCR: 84, // script run
  PROCS: 85, // script stop
  PROCU: 86, // script update parameters

  SERO: 90, // serial open
  SERC: 91, // serial close
  SERRB: 92, // serial read byte
  SERWB: 93, // serial write byte
  SERR: 94, // serial read bytes
  SERW: 95, // serial write bytes
  SERDA: 96, // serial data available

  SPIO: 100, // SPI open
  SPIC: 101, // SPI close
  SPIR: 102, // SPI read bytes
  SPIW: 103, // SPI write bytes
  SPIX: 104, // SPI transfer bytes

  MICS: 113, // delay for a number of microseconds
  MILS: 114, // delay for a number of milliseconds
  CGI: 115, // get internals setting
  CSI: 116, // set internals setting
  NOIB: 117, // open a notification inband in a socket
  SHELL: 118, // run a shell command

  SBC: 120, // print the SBC's host name
  FREE: 121, // release resources

  SHARE: 130, // set the share id for handles
  USER: 131, // set the user
  PASSW: 132, // submit the password
  LCFG: 133, // reload the permits file
  SHRU: 134, // use this share to access handles
  SHRS: 135, // set this share on created handles
  PWD: 136, // print the daemon working directory
  PCD: 137, // print the daemon configuration directory

  LGV: 140, // print the lg library version
  TICK: 141, // print the number of nanonseconds since the Epoch

  GGW: 600, // simple GPIO group write
  GP: 601, // simple GPIO tx pulses
  GSA: 602, // simple GPIO claim for alerts
  GSGI: 603, // simple GPIO group claim for inputs
  GSGO: 604, // simple GPIO group claim for outputs
  GSI: 605, // simple GPIO claim for input
  GSO: 606, // simple GPIO claim for output
  P: 607, // simple GPIO tx PWM
  S: 608 // simple GPIO tx servo pulses
})

const _commandNames = {}
for (const key in commands) {
  _commandNames[commands[key]] = key
}
const commandNames = Object.freeze(_commandNames)

// Errors returned by rgpio.
const errorMessages = Object.freeze([
  'no error',
  'initialisation failed',
  'micros not 0-999999',
  'can not open pathname',
  'no handle available',
  'unknown handle',
  'socket port not 1024-32000',
  'GPIO operation not permitted',
  'one or more GPIO not permitted',
  'invalid script',
  'bad tx type for GPIO and group',
  'GPIO already in use',
  'script parameter id not 0-9',
  'script has duplicate tag',
  'script has too many tags',
  'illegal script command',
  'script variable id not 0-149',
  'no more room for scripts',
  'can not allocate temporary memory',
  'socket read failed',
  'socket write failed',
  'too many script parameters (> 10)',
  'script initialising',
  'script has unresolved tag',
  'bad MICS delay (too large)',
  'bad MILS delay (too large)',
  'can not open I2C device',
  'can not open serial device',
  'can not open SPI device',
  'bad I2C bus',
  'bad I2C address',
  'bad SPI channel',
  'bad I2C open flags',
  'bad SPI open flags',
  'bad serial open flags',
  'bad SPI speed',
  'bad serial device name',
  'bad serial baud rate',
  'bad file parameter',
  'bad I2C parameter',
  'bad serial parameter',
  'i2c write failed',
  'i2c read failed',
  'bad SPI count',
  'ser write failed',
  'ser read failed',
  'ser read no data available',
  'unknown command',
  'spi xfer/read/write failed',
  'bad (NULL) pointer',
  'socket/pipe message too big',
  'bad memory allocation mode',
  'too many I2C transaction segments',
  'an I2C transaction segment failed',
  'SMBus command not supported by driver',
  'bad I2C write length',
  'bad I2C read length',
  'bad I2C command',
  'file open failed',
  'bad file mode',
  'bad file flag',
  'bad file read',
  'bad file write',
  'file not open for read',
  'file not open for write',
  'bad file seek',
  'no files match pattern',
  'no permission to access file',
  'file is a directory',
  'bad shell return status',
  'bad script name',
  'Python socket command interrupted',
  'bad event request',
  'bad GPIO number',
  'bad group size',
  'bad lineinfo IOCTL',
  'bad GPIO read',
  'bad GPIO write',
  'can not open gpiochip',
  'GPIO busy',
  'GPIO not allocated',
  'not a gpiochip',
  'not enough memory',
  'GPIO poll failed',
  'too many GPIO',
  'unexpected error',
  'bad PWM micros',
  'GPIO not the group leader',
  'SPI iOCTL failed',
  'bad gpiochip',
  'bad chipinfo IOCTL',
  'bad configuration file',
  'bad configuration value',
  'no permission to perform action',
  'bad user name',
  'bad secret for user',
  'TX queue full',
  'bad configuration id',
  'bad debounce microseconds',
  'bad watchdog microseconds',
  'bad servo frequency',
  'bad servo pulsewidth',
  'bad PWM frequency',
  'bad PWM dutycycle',
  'GPIO not set as an output',
  'can not set a group to alert'
])

// Translate rgpio error number to error message.
function errorMessage (errorNumber) {
  const msg = errorMessages[-errorNumber]
  return msg == null ? errorNumber : `${msg} (${errorNumber})`
}

const gpioModes = Object.freeze({
  none: 0x00000,
  inUse: 0x00001,
  output: 0x00002,
  activeLow: 0x00004,
  openDrain: 0x00008,
  openSource: 0x00010,
  pullUpSet: 0x00020,
  pullDownSet: 0x00040,
  pullsOffSet: 0x00080,
  lgInput: 0x00100,
  lgOutput: 0x00200,
  lgAlert: 0x00400,
  lgGroup: 0x00800,
  input: 0x10000,
  risingEdgeAlert: 0x20000,
  fallingEdgeAlert: 0x40000,
  realtimeClockAlert: 0x80000
})

const pudValues = Object.freeze({
  up: 32,
  down: 64,
  off: 128
})

/** Client to rgpio's (remote) socket interface.
  *
  * @extends GpioClient
  */
class RgpioClient extends GpioClient {
  /** Create a new RgpioClient instance.
    *
    * @param {object} params - Parameters.
    * @param {string} [params.host='localhost:8889'] - Hostname and port of
    * the rgpio server.<br>
    * Can also be specified through the environment variable LG_ADDR.
    * @param {string} [params.password=''] - Password for rgpio server.<br>
    * Can also be specified through the environment variable LG_PASS.
    * @param {int} [timeout=15] - Timeout in seconds for socket operations.
    * @param {string} [params.user='homebridge-rpi'] - User name for rgpio server.<br>
    * Can also be specified through the environment variable LG_USER.
    */
  constructor (params = {}) {
    super()
    this._params = {
      blockSize: 1024,
      hostname: process.env.LG_ADDR || 'localhost',
      password: process.env.LG_PASS || '',
      port: 8889,
      timeout: 15,
      user: process.env.LG_USER || 'homebridge-rpi'
    }
    const optionParser = new OptionParser(this._params)
    optionParser.hostKey()
    optionParser.stringKey('password')
    optionParser.intKey('timeout', 1, 60)
    optionParser.stringKey('user')
    optionParser.parse(params)
    this._params._hostname = /^\[.*\]$/.test(this._params.hostname)
      ? this._params.hostname.slice(1, -1)
      : this._params.hostname
  }

  get messageSize () { return 16 }

  get notificationSize () { return 16 }

  /** Commands accepted by rgpio.
    * @type {object}
    * @see http://abyz.me.uk/rpi/pigpio/sif.html // TODO
    */
  get commands () {
    return commands
  }

  /** Return the name for a rgpio command.
    * @param {int} cmd - The command.
    * @return {string} - The command name.
    */
  commandName (cmd) {
    const name = commandNames[cmd]
    return name == null ? cmd : `${name} (${cmd})`
  }

  /** Return the error message for a rgpio error number.
    * @param {int} errorNumber - The error number.
    * @return {string} - The error messsage.
    */
  errorMessage (errorNumber) {
    return errorMessage(errorNumber)
  }

  /** Values to PUD command.
    * @type {object}
    */
  get pudValues () {
    return pudValues
  }

  /** Make a command connection to the rgpio socket
    * for sending commands and receiving responses.
    * @throws `Error` - When connection fails.
    * @emits connect
    */
  async connect () {
    await super.connect()

    this._params.hostname = (await this.command(commands.SBC)).string
    const v = (await this.command(commands.LGV)).status
    const version = `${(v >> 24) & 0xFF}.${(v >> 16) & 0xFF}.${(v >> 8) & 0xFF}.${v & 0xFF}`
    this.emit('message', `connected to rgpio v${version}`)

    const salt = randomBytes(8).toString('hex').substring(0, 15)
    const response = await this.command(commands.USER, { string: `${salt}.${this._params.user}` })
    const hash = createHash('md5')
    hash.update(salt)
    hash.update(this._params.password)
    hash.update(response.string)
    await this.command(commands.PASSW, { string: hash.digest('hex') })
    this.emit('message', `user ${this._params.user} logged in`)

    this.gpioChipHandle = (await (this.command(commands.GO, { longs: [0] }))).status
    if (this.gpioChipHandle !== 0) {
      this.emit('warning', new Error(`got GPIO chip handle ${this.gpioChipHandle}`))
    }
    const result = await this.command(commands.GIC, { longs: [this.gpioChipHandle] })
    this.emit('message', `${result.name}: ${result.label}`)
  }

  /** Subscribe to notifications for changed GPIO values.
    *
    * Opens a second data connection to the rgpio socket to receive
    * notifications when GPIOs change state.
    * @emits listen
    * @throws `Error` - When connection fails.
    */
  async listen () {
    if (this.mask === 0) {
      return
    }
    if (this.dataHandle != null) {
      delete this.dataHandle
    }

    await super.listen()

    if (this.dataHandle !== 0) {
      this.emit('warning', new Error(`got data handle ${this.dataHandle}`))
    }

    const { tick, date } = await this.command(commands.TICK)
    this.emit('message', `tick: ${tick} (${date})`)

    // Send start notifications commands on command socket
    this.values = {}
    for (let gpio = 0; gpio < 32; gpio++) {
      const bit = 1 << gpio
      if ((this.mask & bit) === 0) {
        continue
      }
      const result = await this.command(commands.GR, { longs: [this.gpioChipHandle, gpio] })
      this.values[gpio] = result.status === 1
      this.emit('gpio' + gpio, { value: this.values[gpio], tick: 0 })
      await this.command(commands.GSAX, {
        longs: [this.gpioChipHandle, gpioModes.none, alertModes.bothEdges, gpio, this.dataHandle]
      })
    }
  }

  /** Disconnect from rgpio socket, cancelling any GPIO subscription,
    * and closing any data and any command connection.
    * @throws `Error` - When disconnect fails.
    * @emits disconnect
    */
  async disconnect () {
    if (this.dataHandle != null) {
      // try {
      //   await this.command(commands.NC, this.dataHandle)
      // } catch (error) {
      //   this.emit('warning', error)
      // }
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
    if (this.gpioChipHandle != null) {
      try {
        await this.command(commands.GC, { longs: [this.gpioChipHandle] })
      } catch (error) {
        this.emit('warning', error)
      }
      delete this.gpioChipHandle
    }
    super.disconnect()
  }

  /** Size of a buffer to hold command parameters.
    * @param {object} [params={}] - The command parameters.
    * @returns {int} - The buffer size.
  */
  bufferSize (params = {}) {
    const nDoubles = params.doubles?.length ?? 0
    const nLongs = params.longs?.length ?? 0
    const nShorts = params.shorts?.length ?? 0
    let length = (nDoubles * 8) + (nLongs * 4) + (nShorts * 2)
    if (params.string != null) {
      length += Buffer.byteLength(params.string) + 1
    } else {
      length += (params.buffer?.length ?? 0)
    }
    return this.messageSize + length
  }

  /** Encode an rgpio command into a Buffer.
    * @param {Buffer} buffer - The buffer.
    * @param {int} cmd - The command.
    * @param {object} [params={}] - The command parameters.
    * @param {?number[]} params.doubles - Double parameters.
    * @param {?int[]} params.longs - Long parameters.
    * @param {?int[]} params.shorts - Short parameters.
    * @param {?string} params.string - String parameter.
    * @param {?Buffer} params.buffer - Buffer parameter.
    * @param {int} [offset=0] - The offset into the buffer.
    */
  encode (buffer, cmd, params = {}, offset = 0) {
    const nDoubles = params.doubles?.length ?? 0
    const nLongs = params.longs?.length ?? 0
    const nShorts = params.shorts?.length ?? 0
    if (params.string != null) {
      params.buffer = Buffer.from(params.string + '\0')
    }
    const size = (nDoubles * 8) + (nLongs * 4) + (nShorts * 2) +
      (params.buffer?.length ?? 0)
    buffer.writeUInt32LE(LG_MAGIC, offset)
    offset += 4
    buffer.writeUInt32LE(size, offset)
    offset += 4
    buffer.writeUInt16LE(cmd & 0xFFFF, offset)
    offset += 2
    buffer.writeUInt16LE(nDoubles, offset)
    offset += 2
    buffer.writeUInt16LE(nLongs, offset)
    offset += 2
    buffer.writeUInt16LE(nShorts, offset)
    offset += 2
    for (let i = 0; i < nDoubles; i++) {
      buffer.writeDoubleLE(params.doubles[i], offset)
      offset += 8
    }
    for (let i = 0; i < nLongs; i++) {
      buffer.writeInt32LE(params.longs[i], offset)
      offset += 4
    }
    for (let i = 0; i < nShorts; i++) {
      buffer.writeInt16LE(params.shorts[i], offset)
      offset += 2
    }
    if (params.buffer != null) {
      params.buffer.copy(buffer, offset)
    }
    return buffer
  }

  /** Decode the contents of this._data.
    * @returns {boolean} - `true` when a complete message was decoded.
    * @emits command
    */
  decode (data) {
    const result = {
      status: data.readInt32LE(0)
    }
    const size = data.readUInt32LE(4)
    const cmd = data.readUInt16LE(8)
    // Apparently these are echoed from the request.
    // const nDoubles = data.readUInt16LE(10)
    // const nLongs = data.readUInt16LE(12)
    // const nShorts = data.readUInt16LE(14)

    const len = this.messageSize + size // + nDoubles * 8 + nLongs * 4 + nShorts * 2
    if (data.length < len) {
      return 0
    }

    if (size > 0) {
      const buffer = data.subarray(this.messageSize, len)
      switch (cmd) {
        case commands.FR:
          result.string = buffer.toString().replace(/\0.*$/g, '')
          result.more = buffer.length === this._params.blockSize
          break
        case commands.GIC:
          result.name = buffer.subarray(4, 36).toString().replace(/\0.*$/g, '')
          result.label = buffer.subarray(36).toString().replace(/\0.*$/g, '')
          break
        case commands.GIL:
          result.gpio = buffer.readInt16LE(0)
          result.flags = '0x' + toHexString(buffer.readInt32LE(2), 8)
          result.name = buffer.subarray(8, 40).toString().replace(/\0.*$/g, '')
          result.owner = buffer.subarray(40, 72).toString().replace(/\0.*$/g, '')
          break
        case commands.TICK:
          result.tick = buffer.readBigUInt64LE(0) // nanoseconds since epoch
          result.date = new Date(Number(result.tick / 1000000n)).toISOString()
          result.tick = result.tick.toString()
          break
        case commands.SBC:
        case commands.USER:
          result.string = buffer.toString().replace(/\0.*$/g, '')
          break
        default:
          // result.buffer = buffer
          // result.string = buffer.toString().replace(/\0.*$/g, '')
          break
      }
    }
    this.emit(cmd, result)
    return len
  }

  /** Handle `data` events from the command socket.
    * @param {Buffer} data - The data.
    * @emits data
    */
  ntfDecode (data) {
    /** Emitted when data from the pigpio socket has been received.
      * @event PigpioClient#data
      * @param {Buffer} data - The data.
      */
    const payload = {
      tick: Number(data.readBigUInt64LE(0) / 1000n), // nanoseconds since boot?
      chip: data.readUInt8(8),
      gpio: data.readUInt8(9),
      level: data.readUInt8(10),
      flags: data.readUInt8(11),
      handle: data.readUInt32LE(12)
    }
    this.emit('message', `notification: ${JSON.stringify(payload)}`)
    let watchDog = false
    if (payload.level === 2) {
      watchDog = true
    } else {
      this.values[payload.gpio] = payload.level === 1
    }
    this.emit('gpio' + payload.gpio, { value: this.values[payload.gpio], tick: payload.tick, watchDog })
    return this.notificationSize
  }

  setOutputCommand (gpio) {
    return {
      cmd: this.commands.GSOX,
      params: { longs: [this.gpioChipHandle, 0, gpio, 0] }
    }
  }

  writeCommand (gpio, value) {
    return {
      cmd: this.commands.GW,
      params: { longs: [this.gpioChipHandle, gpio, value ? 1 : 0] }
    }
  }

  async setInput (gpio, pud = this.pudValues.off, debounceTimeout = 0) {
    await this.command(this.commands.GSIX, { longs: [this.gpioChipHandle, pud, gpio] })
    if (debounceTimeout > 0) {
      await this.command(this.commands.GDEB, { longs: [this.gpioChipHandle, gpio, debounceTimeout] })
    }
    this.mask |= (1 << gpio)
  }

  async setWatchDog (gpio, doublePressTimeout, longPressTimeout) {
    const timeout = Math.max(doublePressTimeout, longPressTimeout) * 1000
    await this.command(this.commands.GWDOG, { longs: [this.gpioChipHandle, gpio, timeout] })
  }

  async setOutput (gpio, value = 0) {
    if (value == null) {
      value = (await this.command(this.commands.GR, { longs: [this.gpioChipHandle, gpio] })).status
    }
    await this.command(this.commands.GSOX, { longs: [this.gpioChipHandle, gpioModes.none, gpio, value] })
  }

  async dhtPoll (gpio) {
    await this.setOutput(gpio, 0)
    await timeout(18)
    await this.command(this.commands.GSAX, {
      longs: [this.gpioChipHandle, gpioModes.none, alertModes.risingEdge, gpio, this.dataHandle
      ]
    })
  }

  async write (gpio, value) {
    await this.command(this.commands.GW, { longs: [this.gpioChipHandle, gpio, value ? 1 : 0] })
    this.emit('gpio' + gpio, { value, tick: 0 })
  }

  /** Execute a remote shell script.
    * @param {string} script - The script to execute.
    * @returns {int} - The SHELL command return status.
    * @throws `Error` - When SHELL command fails.
    */
  async shell (script) {
    await super.shell(script)
    const status = (await this.command(
      commands.SHELL, { longs: [script.length + 1], string: script }
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
        await this.command(commands.FC, { longs: [this.fileHandle] })
      } catch (error) {
        this.emit('warning', error)
      }
      delete this.fileHandle
    }
    this.fileHandle = (await this.command(commands.FO, { longs: [1], string: filename })).status
    if (this.fileHandle !== 1) {
      this.emit('warning', new Error(`got file handle ${this.fileHandle}`))
    }
    let s = ''
    let result
    do {
      result = await this.command(commands.FR, { longs: [this.fileHandle, this._params.blockSize] })
      s += result.string
    } while (result.more)
    await this.command(commands.FC, { longs: [this.fileHandle] })
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
        await this.command(commands.FC, { longs: [this.fileHandle] })
      } catch (error) {
        this.emit('warning', error)
      }
      delete this.fileHandle
    }
    this.fileHandle = (await this.command(commands.FO, { longs: [2], string: filename })).status
    if (this.fileHandle !== 1) {
      this.emit('warning', new Error(`got file handle ${this.fileHandle}`))
    }
    await this.command(commands.FW, { longs: [this.fileHandle], string: text })
    await this.command(commands.FC, { longs: [this.fileHandle] })
    delete this.fileHandle
  }
}

GpioClient.Rgpio = RgpioClient
