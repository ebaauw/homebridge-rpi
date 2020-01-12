'use strict'

const Blinkt = require('./lib/Blinkt')
const PigpioClient = require('./lib/PigpioClient')

// async function sleep (ms = 100) {
//   return new Promise((resolve, reject) => {
//     setTimeout(() => { resolve() }, ms)
//   })
// }

class Test {
  constructor () {
    this.pi = new PigpioClient({ host: 'pi5' })
    this.blinkt = new Blinkt(this.pi, {
      gpioClock: 14,
      gpioData: 15,
      nLeds: 1
    })
    process.on('SIGINT', async (signal) => {
      console.log('Got %s', signal)
      this.interrupted = true
    })
  }

  async colourLoop () {
    let d
    let r = 0
    let g = 1
    let b = 255
    while (true) {
      if (r < 255 && g === 0 && b === 255) {
        if (r === 0) {
          const now = new Date()
          if (d != null) {
            console.log('cycle took %d ms', now - d)
          }
          d = now
          console.log('red in')
        }
        r++
      } else if (r === 255 && g === 0 && b > 0) {
        if (b === 255) {
          console.log('blue out')
        }
        b--
      } else if (r === 255 && g < 255 && b === 0) {
        if (g === 0) {
          console.log('green in')
        }
        g++
      } else if (r > 0 && g === 255 && b === 0) {
        if (r === 255) {
          console.log('red out')
        }
        r--
      } else if (r === 0 && g === 255 && b < 255) {
        if (b === 0) {
          console.log('blue in')
        }
        b++
      } else if (r === 0 && g > 0 && b === 255) {
        if (g === 255) {
          console.log('green out')
        }
        g--
      }
      this.blinkt.setLed(0, 1, r, g, b)
      await this.blinkt.update()
      if (this.interrupted) {
        return
      }
    }
  }

  async main () {
    await this.blinkt.init()
    await this.colourLoop()
    console.log('Exiting...')
    await this.blinkt.destroy()
    await this.pi.disconnect()
  }
}

new Test().main()
