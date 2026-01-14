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
  async write (buffer, socket = this._cmdSocket) {
    return new Promise((resolve, reject) => {
      if (socket == null) {
        reject(new Error('not connected'))
      }
      /** Emitted when writing a request to the rgpio socket.
        * @event GpioClient#send
        * @param {Buffer} request - The request.
        */
      this.emit('send', buffer)
      socket.write(buffer, () => {
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

  /** Subscribe to notifications for changed GPIO values.
    *
    * @param {int} [mask=0xFFFFFFFC] - Bitmask of the GPIOs to monitor
    * (default: 2-31).
    * @emits listen
    * @throws `Error` - When connection fails.
    * @abstract
    */
  async listen (mask = 0xFFFFFFFC) {
  }
}

export { GpioClient }
