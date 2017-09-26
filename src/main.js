import './load-env'
import {
  appBuilder,
} from './app'
import {
  APP_CONFIG,
} from './config'
import redisClient from './redis'


const runProcess = async () => {
  try {
    const main = appBuilder(APP_CONFIG, redisClient)
    await main.run()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('error with process', e)
  }
  if (redisClient.connected) await redisClient.quit()
  return true
}

runProcess()
