import { configureMaintenance } from './maintenance'
import { APP_CONFIG } from './config'
import { parsedFlags, isProd } from './util'

const runProcess = async () => {
  try {
    const flags = { ...parsedFlags, isProd }
    const maintain = configureMaintenance(APP_CONFIG, flags)
    await maintain.run()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('error with process', e)
  }

  return true
}

runProcess()
