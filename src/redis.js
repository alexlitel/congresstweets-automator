import bluebird from 'bluebird'
import redis from 'redis'
import {
  REDIS_URL,
} from './config'

bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

const redisClient = redis.createClient({
  url: REDIS_URL,
  retry_strategy: (options) => {
    if (options.attempt > 3) {
      return undefined
    }
    return Math.min(options.attempt * 100, 3000)
  },
})

redisClient.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.log(`Error ${err}`)
  redisClient.quit()
})


export default redisClient
