// homebridge-rpi/lib/RgpioClient.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { EventEmitter, once } from 'node:events'
import { createConnection } from 'node:net'

const pudValues = Object.freeze({
  off: 0,
  down: 1,
  up: 2
})

/** Abstract superclass class for a client to a GPIO server.
  *
  * @extends EventEmitter
  * @hideconstructor
  */
class GpioClient extends EventEmitter {
  /** Return the name for a command.
    * @param {int} cmd - The command.
    * @return {string} - The command name.
    */
  static commandName (cmd) {
    return 'command ' + cmd
  }

  /** Return the error message for an error number.
    * @param {int} errorNumber - The error number.
    * @return {string} - The error messsage.
    */
  static errorMessage (errorNumber) {
    return 'error ' + errorNumber
  }

  /** Values to PUD command.
    * @type {object}
    * @see http://abyz.me.uk/rpi/pigpio/cif.html#pud
    */
  static get pudValues () {
    return pudValues
  }

  /** Return a visual representation of a GPIO bitmap.
    * @param {int} map - The GPIO bitmap.
    * @return {string} - The visual represenation of the bitmap of
    * the GPIO bitmap.
    */
  vmap (map) {
    let s = ''
    for (let i = 32; i--; i >= 0) {
      s += (map & (1 << i)) !== 0 ? 'x' : '.'
      if (i % 4 === 0 && i > 0) {
        s += ' '
      }
    }
    return s
  }

  constructor (params = {}) {
    super()
  }

  /** Hostname for the GPIO server.
    * @type {string}
    * @readonly
    */
  get hostname () { return this._params.hostname }

  /** Port for the GPIO server.
    * @type {int}
    * @readonly
    */
  get port () { return this._params.port }

  get connected () { return !!this._connected }

  /** Make a command connection to the GPIO server
    * for sending commands and receiving responses.
    * @throws `Error` - When connection fails.
    * @emits connect
    */
  async connect () {
    this._cmdSocket = createConnection(this._params.port, this._params._hostname)
    this._cmdSocket
      .on('data', (data) => { this.onData(data) })
      .on('error', () => { this.disconnect() })
      .on('close', () => { this.disconnect() })
    await once(this._cmdSocket, 'ready')
    /** Emitted when client has connected to the rgpio socket.
      * @event GpioClient#connect
      * @param {string} hostname - The hostname of the rgpio socket.
      * @param {int} port - The port of the rgpio socket.
      */
    this.emit('connect', this._params.hostname, this._params.port)
    this._connected = true
    this._data = Buffer.alloc(0)
  }

  /** Disconnect from the GPIO server, cancelling any GPIO subscriptions,
    * and closing any data and any command connections.
    * @throws `Error` - When disconnect fails.
    * @emits disconnect
    */
  async disconnect () {
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
      /** Emitted when client has disconnected from the rgpio socket.
        * @event GpioClient#disconnect
        * @param {string} hostname - The hostname of the rgpio socket.
        * @param {int} port - The port of the rgpio socket.
        */
      this.emit('disconnect', this._params.hostname, this._params.port)
      this._connected = false
    }
  }

  /** Send a buffer to the GPIO server.
    *
    * @param {Buffer} buffer - The buffer to send.
    */
  async write (buffer) {
    return new Promise((resolve, reject) => {
      if (this._cmdSocket == null) {
        reject(new Error('not connected'))
      }
      /** Emitted when writing a request to the rgpio socket.
        * @event GpioClient#send
        * @param {Buffer} request - The request.
        */
      this.emit('send', buffer)
      this._cmdSocket.write(buffer, () => {
        resolve()
      })
    })
  }

  /** Create a buffer to hold command parameters.
    * @param {object} [params={}] - The command parameters.
    * @returns {Buffer} - The buffer.
    * @abstract
  */
  bufferSize (params = {}) {
    return this.MESSAGE_SIZE
  }

  /** Encode a command into a Buffer.
    * @param {Buffer} buffer - The buffer.
    * @param {int} cmd - The command.
    * @param {object} [params={}] - The command parameters.
    * @param {int} [offset=0] - The offset into the buffer.
    * @abstract
    */
  encode (buffer, cmd, params = {}, offset = 0) {}

  /** Decode the contents of this._data.
    * @emits command
    * @abstract
    */
  decode () {}

  /** Send a command to the GPIO server.
    * @param {int} cmd - The command.
    * @param {Object} [params={}] - The command parameters.
    * @returns {Object} The command response.
    * @emits command
    * @emits send
    * @emits response
    * @emits error
    */
  async command (cmd, params = {}) {
    if (this._cmdSocket == null) {
      await this.connect()
    }
    /** Emitted when sending a command to the rgpio socket.
      * @event GpioClient#command
      * @param {int} cmd - The command.
      * @param {object} params - The command parameters.
      */
    this.emit('command', cmd, params)
    const request = Buffer.allocUnsafe(this.bufferSize(params))
    this.encode(request, cmd, params)
    const timeout = setTimeout(() => {
      this.emit('error', new Error(`${this.commandName(cmd)}: timeout`))
    }, this._params.timeout * 1000)
    await this.write(request)
    let p
    try {
      p = await once(this, cmd)
    } catch (error) {
      this.disconnect()
      return {}
    }
    clearTimeout(timeout)
    const response = p[0]
    if (response.status < 0) {
      throw new Error(
        `${this.commandName(cmd)}: ${this.errorMessage(response.status)}`
      )
    }
    /** Emitted when receving a command response from the rgpio socket.
      * @event GpioClient#response
      * @param {int} cmd - The command.
      * @param {Object} response - The command response.
      * @param {int} response.status - The command execution status.
      */
    this.emit('response', cmd, response)
    return response
  }

  /** Handle `data` events from the command socket.
    * @param {Buffer} data - The data.
    * @emits data
    */
  onData (buffer) {
    /** Emitted when data from the pigpio socket has been received.
      * @event PigpioClient#data
      * @param {Buffer} data - The data.
      */
    this.emit('data', buffer)
    this._data = Buffer.concat([this._data, buffer])
    while (this._data.length >= this.MESSAGE_SIZE && this.decode()) {
      // continue decoding
    }
  }

  /** Execute a remote shell script.
    * @param {string} script - The script to execute.
    * @returns {int} - The SHELL command return status.
    * @throws `Error` - When SHELL command fails.
    */
  async shell (script) {
    if (this._cmdSocket == null) {
      await this.connect()
    }
    /** Emitted when client has disconnected from the rgpio socket.
      * @event GpioClient#messsage
      * @param {string} message - The message.
      */
    this.emit('message', `exec ${script}`)
  }

  /** Read a remote text file.
    * @param {!string} filename - The name of the file to read.
    * @returns {string} The file contents as string.
    * @throws `Error` - When file cannot be read.
    */
  async readFile (filename) {
    if (this._cmdSocket == null) {
      await this.connect()
    }
    this.emit('message', `read file ${filename}`)
    return ''
  }

  /** Write to a remote text file.
    * @param {!string} filename - The name of the file to write to.
    * @param {!string} text - The text to write.
    * @throws `Error` - When file cannot be written.
    */
  async writeFile (filename, text) {
    if (this._cmdSocket == null) {
      await this.connect()
    }
    this.emit('message', `write file ${filename}`)
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

export { GpioClient }
