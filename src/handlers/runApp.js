import { appBuilder } from '../app'
import { APP_CONFIG } from '../config'

export const handler = async () => {
  try {
    const main = appBuilder(APP_CONFIG)
    await main.run()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('error with process', e)
  }

  return true
}

