// homebridge-rpi/lib/RgpioClient.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { createHash, randomBytes } from 'node:crypto'

import { OptionParser } from 'homebridge-lib/OptionParser'

import { GpioClient } from '../GpioClient.js'

const LG_MAGIC = 0x6C67646D // 'lgdm'
const MESSAGE_SIZE = 16

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

// Translate command code to command name.
function commandName (command) {
  const name = commandNames[command]
  return name == null ? command : `${name} (${command})`
}

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

  get MESSAGE_SIZE () { return MESSAGE_SIZE }

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
    return commandName(cmd)
  }

  /** Return the error message for a rgpio error number.
    * @param {int} errorNumber - The error number.
    * @return {string} - The error messsage.
    */
  errorMessage (errorNumber) {
    return errorMessage(errorNumber)
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
    hash.update(response.string.substring(0, 15))
    await this.command(commands.PASSW, { string: hash.digest('hex') })
    this.emit('message', `user ${this._params.user} logged in`)

    this._gpioChipHandle = (await (this.command(commands.GO, { longs: [0] }))).status
    if (this._gpioChipHandle !== 0) {
      this.emit('warning', new Error(`got GPIO chip handle ${this._gpioChipHandle}`))
    }
    const buffer = (await this.command(commands.GIC, { longs: [this._gpioChipHandle] })).buffer
    this.emit(
      'message',
      `${buffer.subarray(4, 20).toString()}: ${buffer.subarray(21).toString()}`
    )
  }

  /** Disconnect from rgpio socket, cancelling any GPIO subscription,
    * and closing any data and any command connection.
    * @throws `Error` - When disconnect fails.
    * @emits disconnect
    */
  async disconnect () {
    if (this._gpioChipHandle != null) {
      try {
        await this.command(commands.GC, { longs: [this._gpioChipHandle] })
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._gpioChipHandle
    }
    if (this._fileHandle != null) {
      try {
        await this.command(commands.FC, this._fileHandle)
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._fileHandle
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
    return MESSAGE_SIZE + length
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
  decode () {
    const result = {
      status: this._data.readInt32LE(0)
    }
    const size = this._data.readUInt32LE(4)
    const cmd = this._data.readUInt16LE(8)
    // Apparently these are echoed from the request.
    // const nDoubles = this._data.readUInt16LE(10)
    // const nLongs = this._data.readUInt16LE(12)
    // const nShorts = this._data.readUInt16LE(14)

    const len = MESSAGE_SIZE + size // + nDoubles * 8 + nLongs * 4 + nShorts * 2
    if (this._data.length < len) {
      return false
    }

    if (size > 0) {
      result.buffer = this._data.subarray(MESSAGE_SIZE, len)
      result.string = result.buffer.toString()
    }
    this.emit(cmd, result)
    this._data = this._data.subarray(len)
    return true
  }

  gpioOutput (gpio) {
    return {
      cmd: this.commands.GSOX,
      params: { longs: [this._gpioChipHandle, 0, gpio, 0] }
    }
  }

  gpioWrite (gpio, value) {
    return {
      cmd: this.commands.GW,
      params: { longs: [this._gpioChipHandle, gpio, value ? 1 : 0] }
    }
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
    await super.readFile(filename)
    if (this._fileHandle != null) {
      this.emit('warning', new Error(`file handle ${this._fileHandle} still open`))
      try {
        await this.command(commands.FC, { longs: [this._fileHandle] })
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._fileHandle
    }
    this._fileHandle = (await this.command(commands.FO, { longs: [1], string: filename })).status
    if (this._fileHandle !== 1) {
      this.emit('warning', new Error(`got file handle ${this._fileHandle}`))
    }
    let s = ''
    let result
    do {
      result = await this.command(commands.FR, { longs: [this._fileHandle, this._params.blockSize] })
      s += result.string
    } while (result.buffer.length === this._params.blockSize)
    await this.command(commands.FC, { longs: [this._fileHandle] })
    delete this._fileHandle
    return s
  }

  /** Write to a remote text file.
    * @param {!string} filename - The name of the file to write to.
    * @param {!string} text - The text to write.
    * @throws `Error` - When file cannot be written.
    */
  async writeFile (filename, text) {
    await super.writeFile(filename, text)
    if (this._fileHandle != null) {
      this.emit('warning', new Error(`file handle ${this._fileHandle} still open`))
      try {
        await this.command(commands.FC, { longs: [this._fileHandle] })
      } catch (error) {
        this.emit('warning', error)
      }
      delete this._fileHandle
    }
    this._fileHandle = (await this.command(commands.FO, { longs: [2], string: filename })).status
    if (this._fileHandle !== 1) {
      this.emit('warning', new Error(`got file handle ${this._fileHandle}`))
    }
    await this.command(commands.FW, { longs: [this._fileHandle], string: text })
    await this.command(commands.FC, { longs: [this._fileHandle] })
    delete this._fileHandle
  }

  // /** Subscribe to notifications for changed GPIO values.
  //   *
  //   * Opens a second data connection to the rgpio socket to receive
  //   * notifications when GPIOs change state.
  //   * @param {int} [mask=0xFFFFFFFC] - Bitmask of the GPIOs to monitor
  //   * (default: 2-31).
  //   * @emits listen
  //   * @throws `Error` - When connection fails.
  //   */
  // async listen (mask = 0xFFFFFFFC) {
  //   if (this._dataHandle != null) {
  //     try {
  //       await this.command(commands.NC, this._dataHandle)
  //     } catch (error) {
  //       this.emit('warning', error)
  //     }
  //     delete this._dataHandle
  //   }

  //   // Open data socket.
  //   this._dataSocket = createConnection(this._params.port, this._params._hostname)
  //   this._dataSocket
  //     .on('data', this._onDataData.bind(this))
  //     .on('error', () => { super.disconnect() })
  //     .on('close', () => {
  //       // delete this._dataSocket
  //       super.disconnect()
  //     })
  //   await once(this._dataSocket, 'ready')

  //   // Get notification handle on data socket.
  //   this.emit('command', commands.NOIB, 0, 0, 0)
  //   const request = Buffer.alloc(16)
  //   request.writeUInt32LE(commands.NOIB, 0)
  //   request.writeUInt32LE(0, 4)
  //   request.writeUInt32LE(0, 8)
  //   request.writeUInt32LE(0, 12)
  //   this.emit('request', request)
  //   this._dataSocket.write(request)
  //   const p = await once(this, commands.NOIB)
  //   const status = p[0]
  //   this.emit('response', commands.NOIB, status)
  //   if (status < 0) {
  //     throw new Error(`${commandName(commands.NOIB)}: ${errorMessage(status)}`)
  //   }
  //   this._dataHandle = status
  //   if (this._dataHandle !== 0) {
  //     this.emit('warning', new Error(`got data handle ${this._dataHandle}`))
  //   }

  //   // Send start notifications commands on command socket
  //   this._mask = mask
  //   await this.command(commands.NB, this._dataHandle, mask)
  //   /** Emitted when client has subscribed to GPIO notifications.
  //     * @event RgpioClient#listen
  //     * @param {int} mask - A bitmap of the subscribed GPIOs.
  //     */
  //   this.emit('listen', mask)

  //   // Get initial map.
  //   const map = await this.command(commands.BR1)
  //   const tick = await this.command(commands.TICK)
  //   this._checkNotification({ flags: 0x0000, tick, map })
  // }

  // /** Handle `data` events from the data socket.
  //   * @param {Buffer} data - Data.
  //   * @emits data
  //   */
  // _onDataData (data) {
  //   this.emit('data', data)
  //   while (data.length >= 12) {
  //     if (
  //       data.length >= 16 && data.readUInt32LE(0) === commands.NOIB &&
  //       data.readUInt32LE(4) === 0 && data.readUInt32LE(8) === 0
  //     ) {
  //       // Response to NOIB command.
  //       const res = data.readInt32LE(12)
  //       this.emit(commands.NOIB, res)
  //       data = data.slice(16)
  //       continue
  //     }
  //     this._checkNotification({
  //       seqno: data.readUInt16LE(0),
  //       flags: data.readUInt16LE(2),
  //       tick: data.readUInt32LE(4),
  //       map: data.readUInt32LE(8)
  //     })
  //     data = data.slice(12)
  //   }
  // }

  // /** Handle `rgpio` notification from the data socket.
  //   * @param {Object} payload - The `rgpio` notification payload.
  //   * @param {?int} payload.seqno - The sequence number.
  //   @ @param {int} payload.flags - A bitmap of notification flags.
  //   * @param {int} payload.tick - Timestamp in µs (wraps at 2^32).
  //   * @param {int} payload.map - A bitmap of the GPIO values.
  //   * @emits notification
  //   */
  // _checkNotification (payload) {
  //   payload.map &= this._mask
  //   /** Emitted when a GPIO notification is received from rgpio.
  //     * @event RgpioClient#notification
  //     * @param {Object} payload - The `rgpio` notification payload.
  //     * @param {?int} payload.seqno - The sequence number.
  //     @ @param {int} payload.flags - A bitmap of notification flags.
  //     * @param {?int} payload.tick - Timestamp in µs (wraps at 2^32).
  //     * @param {int} payload.map - A bitmap of the GPIO values.
  //     * the GPIO values.
  //     */
  //   this.emit('notification', payload)

  //   if (payload.flags === 0) {
  //     for (let gpio = 0; gpio < 32; gpio++) {
  //       this._checkGpio(payload, gpio)
  //     }
  //   } else if (payload.flags & notifyFlags.WATCHDOG) {
  //     this._checkGpio(payload, payload.flags & notifyFlags.GPIO, true)
  //   }
  //   this._map = payload.map
  // }

  // /** Handle `data` events from the data socket.
  //   * @param {Buffer} data - Data.
  //   * @param {Object} payload - The `rgpio` notification payload.
  //   * @param {?int} payload.seqno - The sequence number.
  //   @ @param {int} payload.flags - A bitmap of notification flags.
  //   * @param {?int} payload.tick - Timestamp in µs (wraps at 2^32).
  //   * @param {int} payload.map - A bitmap of the GPIO values.
  //   * @param {int} gpio - The number of the GPIO to check.
  //   * @param {boolean} [watchDog = false] - True iff notification was issued
  //   * because of a watchdog timer or initial setup.
  //   * @emits gpioN
  //   */
  // _checkGpio (payload, gpio, watchDog = (this._map == null)) {
  //   const mask = 1 << gpio
  //   if (this._mask & mask) {
  //     const value = (payload.map & mask) !== 0
  //     const oldValue = (this._map & mask) !== 0
  //     if (watchDog || value !== oldValue) {
  //       /** Emitted when a GPIO pin has changed value or received a watchdog
  //         * timeout
  //         * @event RgpioClient#gpioN
  //         * @param {Object} payload- The `rgpio` notification payload.
  //         * @param {boolean} payload.value - The value of the GPIO pin.
  //         // * @param {boolean} payload.oldValue - The old value of the GPIO pin.
  //         * @param {int} payload.tick - Timestamp in µs (wraps at 2^32).
  //         * @param {boolean} payload.watchDog - Event triggered by watchdog timer.
  //         */
  //       this.emit('gpio' + gpio, { value, tick: payload.tick, watchDog })
  //     }
  //   }
  // }
}

GpioClient.Rgpio = RgpioClient
