import { configureMaintenance } from '../maintenance'
import { APP_CONFIG, IS_PROD } from '../config'

export const handler = async () => {
  try {
    const flags = { postBuild: true, isProd: IS_PROD }
    const maintain = configureMaintenance(APP_CONFIG, flags)
    await maintain.run()

    return {
      statusCode: 200,
      body: 'Success'
    }
  } catch (e) {
    // eslint-disable-next-line no-console

    return {
      statusCode: 400,
      body: 'Error'
    }
  }
}
