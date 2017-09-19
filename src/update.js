import './load-env'
import {
    configureMaintenance,
} from './maintenance'
import {
    APP_CONFIG,
} from './config'
import {
  parsedFlags,
  isProd,
} from './util'
import redisClient from './redis'

const runProcess = async () => {
  try {
    const client = (isProd || parsedFlags.localStore) ? redisClient : null
    const flags = { ...parsedFlags, isProd }
    const maintain = configureMaintenance(client, APP_CONFIG, flags)
    await maintain.run()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('error with process', e)
  }
  if (redisClient.connected) await redisClient.quit()
  return true
}

runProcess()
