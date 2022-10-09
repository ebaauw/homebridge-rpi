'use strict'

const Blinkt = require('./lib/PigpioLedChain/Blinkt')
const P9813 = require('./lib/PigpioLedChain/P9813')
const PigpioClient = require('./lib/PigpioClient')

async function delay (ms = 100) {
  return new Promise((resolve, reject) => {
    setTimeout(() => { resolve() }, ms)
  })
}

// const host = 'pi10'
// const config = { // FanSHIM
//   gpioClock: 14,
//   gpioData: 15,
//   nLeds: 1
// }

// const host = 'pi10'
// const config = { // P9813
//   gpioClock: 10,
//   gpioData: 11,
//   nLeds: 2,
//   type: 'p9813'
// }

const host = 'pi5'
const config = { // Blinkt!
  gpioClock: 24,
  gpioData: 23,
  nLeds: 8
}

class Test {
  constructor () {
    this.pi = new PigpioClient({ host })
    // this.pi
    //   .on('request', (request) => { console.log('request: %j', request) })
    this.blinkt = config.type === 'p9818'
      ? new P9813(this.pi, config)
      : new Blinkt(this.pi, config)
    // this.blinkt
    //   .on('led', (id, led) => { console.log('led %d: %j', id, led) })
    process.on('SIGINT', async (signal) => {
      console.log('Got %s', signal)
      this.interrupted = true
    })
  }

  async colourLoop (bri = 0x08) {
    // let d
    let r = 0
    let g = 1
    let b = 255
    while (true) {
      if (r < 255 && g === 0 && b === 255) {
        // if (r === 0) {
        //   const now = new Date()
        //   if (d != null) {
        //     console.log('cycle took %d ms', now - d)
        //   }
        //   d = now
        //   console.log('red in')
        // }
        r++
      } else if (r === 255 && g === 0 && b > 0) {
        // if (b === 255) {
        //   console.log('blue out')
        // }
        b--
      } else if (r === 255 && g < 255 && b === 0) {
        // if (g === 0) {
        //   console.log('green in')
        // }
        g++
      } else if (r > 0 && g === 255 && b === 0) {
        // if (r === 255) {
        //   console.log('red out')
        // }
        r--
      } else if (r === 0 && g === 255 && b < 255) {
        // if (b === 0) {
        //   console.log('blue in')
        // }
        b++
      } else if (r === 0 && g > 0 && b === 255) {
        // if (g === 255) {
        //   console.log('green out')
        // }
        g--
      }
      this.blinkt.setAllLeds(bri, r, g, b)
      await this.blinkt.update()
      if (this.interrupted) {
        return
      }
    }
  }

  // Inspired by: https://github.com/pimoroni/blinkt/blob/master/examples/larson.py
  async cylon (bri = 0xFF) {
    const values = [0, 0, 0, 0, 0, 0, 0, 16, 64, 255, 64, 16, 0, 0, 0, 0, 0, 0, 0]
    const delays = [
      1 + Math.sin(0.5 * Math.PI),
      1 + Math.sin(0.4 * Math.PI),
      1 + Math.sin(0.3 * Math.PI),
      1 + Math.sin(0.2 * Math.PI),
      1 + Math.sin(0.1 * Math.PI),
      1 + Math.sin(0.0 * Math.PI),
      1 + Math.sin(0.1 * Math.PI),
      1 + Math.sin(0.2 * Math.PI),
      1 + Math.sin(0.3 * Math.PI),
      1 + Math.sin(0.4 * Math.PI),
      1 + Math.sin(0.5 * Math.PI)
    ]
    let offset = 11
    let up = true
    while (true) {
      for (let i = 0; i < config.nLeds; i++) {
        this.blinkt.setLed(i, bri, values[offset + i], 0, 0)
      }
      await this.blinkt.update()
      await delay(40 * delays[offset])
      offset += up ? -1 : 1
      if (offset === 11) {
        up = true
      } else if (offset === 0) {
        up = false
      }
      if (this.interrupted) {
        return
      }
    }
  }

  async main () {
    try {
      await this.blinkt.init(true)
      await this.colourLoop()
      this.interrupted = false
      await this.cylon()
      console.log('Exiting...')
      await this.blinkt.disconnect(true)
      await this.pi.disconnect()
    } catch (error) {
      console.log(error)
    } finally {
      await this.pi.disconnect()
    }
  }
}

new Test().main()
