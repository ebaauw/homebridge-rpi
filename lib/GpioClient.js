// homebridge-rpi/lib/RgpioClient.js
// Copyright © 2019-2026 Erik Baauw.  All rights reserved.
//
// Homebridge plugin for Raspberry Pi.

import { EventEmitter, once } from 'node:events'
import { createConnection } from 'node:net'

/** Abstract superclass class for a client to a GPIO server.
  *
  * @extends EventEmitter
  * @hideconstructor
  */
class GpioClient extends EventEmitter {
  constructor () {
    super()
    this.mask = 0
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

  /** Return true iff connected to the GPIO server.
    * @type {boolean}
    * @readonly
    */
  get connected () { return !!this._connected }

  /** Return the name for a command.
    * @param {int} cmd - The command.
    * @return {string} - The command name.
    */
  commandName (cmd) {
    return 'command ' + cmd
  }

  /** Return the error message for an error number.
    * @param {int} errorNumber - The error number.
    * @return {string} - The error messsage.
    */
  errorMessage (errorNumber) {
    return 'error ' + errorNumber
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

  get messageSize () { return 16 }

  get notificationSize () { return 12 }

  /** Open a socket to the GPIO server for sending commands.
    * @throws `Error` - When connection fails.
    * @emits GpioClient#connect
    */
  async connect () {
    this._cmdSocket = createConnection(this._params.port, this._params._hostname)
    this._cmdSocket
      .on('data', (data) => { this.#onCmdData(data) })
      .on('error', () => { this.disconnect() })
      .on('close', () => { this.disconnect() })
    await once(this._cmdSocket, 'ready')
    this._connected = true
    this._cmdData = Buffer.alloc(0)

    /** Emitted when client has connected to the rgpio socket.
      * @event GpioClient#connect
      * @param {string} hostname - The hostname of the rgpio socket.
      * @param {int} port - The port of the rgpio socket.
      */
    this.emit('connect', this._params.hostname, this._params.port)
  }

  /** Handle `data` events from the command socket.
  * @param {Buffer} data - The data.
  * @emits GpioClient#data
  */
  #onCmdData (data) {
    /** Emitted when data from the pigpio socket has been received.
      * @event GpioClient#data
      * @param {Buffer} data - The data.
      */
    this.emit('data', data)
    this._cmdData = Buffer.concat([this._cmdData, data])
    while (this._cmdData.length >= this.messageSize) {
      const len = this.decode(this._cmdData)
      if (len === 0) {
        break
      }
      this._cmdData = this._cmdData.subarray(len)
    }
  }

  /** Subscribe to notifications for changed GPIO values.
    *
    * @emits GpioClient#listen
    * @throws `Error` - When connection fails.
    */
  async listen () {
    this._ntfSocket = createConnection(this._params.port, this._params._hostname)
    this._ntfSocket
      .once('data', (data) => { this.#onCmdData(data) })
      .on('error', () => { this.disconnect() })
      .on('close', () => { this.disconnect() })
    await once(this._ntfSocket, 'ready')
    this._ntfData = Buffer.alloc(0)

    this._ntfCommand = true
    this.dataHandle = (await this.command(this.commands.NOIB)).status

    this._ntfSocket
      .on('data', (data) => { this.#onNtfData(data) })

    /** Emitted when client has subscribed to GPIO notifications.
      * @event GpioClient#listen
      * @param {int} mask - A bitmap of the subscribed GPIOs.
      */
    this.emit('listen', this.mask)
  }

  /** Handle `data` events from the notification socket.
    * @param {Buffer} data - The data.
    * @emits data
    */
  #onNtfData (data) {
    /** Emitted when data from the pigpio socket has been received.
      * @event GpioClient#data
      * @param {Buffer} data - The data.
      */
    this.emit('data', data)
    this._ntfData = Buffer.concat([this._ntfData, data])
    while (this._ntfData.length >= this.notificationSize) {
      this._ntfData = this._ntfData.subarray(this.ntfDecode(this._ntfData))
    }
  }

  /** Disconnect from the GPIO server, cancelling any GPIO subscriptions,
    * and closing any data and any command connections.
    * @throws `Error` - When disconnect fails.
    * @emits disconnect
    */
  async disconnect () {
    if (this._ntfSocket != null) {
      this._ntfSocket.destroy()
      this._ntfSocket.removeAllListeners()
      delete this._ntfSocket
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

  /** Send data to the GPIO server.
    *
    * @param {Buffer} data - The buffer to send.
    * @emits send
    */
  async send (data) {
    const socket = this._ntfCommand ? this._ntfSocket : this._cmdSocket
    this._ntfCommand = false
    return new Promise((resolve, reject) => {
      if (socket == null) {
        reject(new Error('not connected'))
      }
      /** Emitted when writing a request to the rgpio socket.
        * @event GpioClient#send
        * @param {Buffer} data - The request.
        */
      this.emit('send', data)
      socket.write(data, () => { resolve() })
    })
  }

  /** Return the buffer size needed to hold command parameters.
    * @param {object} [params={}] - The command parameters.
    * @returns {int} - The buffer size.
    * @abstract
  */
  bufferSize (params = {}) {
    return this.messageSize
  }

  /** Encode a command into a Buffer.
    * @param {Buffer} buffer - The buffer.
    * @param {int} cmd - The command.
    * @param {object} [params={}] - The command parameters.
    * @param {int} [offset=0] - The offset into the buffer.
    * @abstract
    */
  encode (buffer, cmd, params = {}, offset = 0) {}

  /** Decode a command response from the GPIO server.
    * @params {Buffer} data - The data received.
    * @returns int - The number of bytes consumed from data.
    * @emits GpioClient#command
    * @abstract
    */
  decode (data) {
    return this.messageSize
  }

  /** Decode a notification from the GPIO server.
    * @params {Buffer} data - The data received.
    * @returns int - The number of bytes consumed from data.
    * @emits gpio
    * @abstract
    */
  ntfDecode (data) {
    return this.notificationSize
  }

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
    /** Emitted when sending a command.
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
    await this.send(request)
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
}

export { GpioClient }
