import './load-env'
import { appBuilder } from './app'
import {
    APP_CONFIG,
} from './config'
import redisClient from './redis'

const main = appBuilder(APP_CONFIG, redisClient)

main.run()
redisClient.quit()
