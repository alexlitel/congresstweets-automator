import { configureMaintenance } from '../maintenance'
import { APP_CONFIG, IS_PROD } from '../config'
import { parsedFlags } from '../util'

const runProcess = async () => {
  try {
    const flags = { ...parsedFlags, isProd: IS_PROD, selfUpdate: true }
    const maintain = configureMaintenance(APP_CONFIG, flags)
    await maintain.run()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('error with process', e)
  }

  return true
}

runProcess()
