import './load-env'
import {
    appBuilder,
} from './app'
import {
    APP_CONFIG,
} from './config'
import redisClient from './redis'


const process = async () => {
  try {
    const main = appBuilder(APP_CONFIG, redisClient)
    return await main.run()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('error with process', e)
    return false
  }
}

process()
