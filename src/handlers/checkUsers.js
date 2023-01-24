import { configureMaintenance } from '../maintenance'
import { APP_CONFIG, IS_PROD } from '../config'

export const handler = async () => {
  try {
    const flags = { selfUpdate: true, isProd: IS_PROD }
    const maintain = configureMaintenance(APP_CONFIG, flags)
    await maintain.run()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('error with process', e)
  }

  return true
}