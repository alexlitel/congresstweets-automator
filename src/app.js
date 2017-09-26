import _ from 'lodash'
import {
  TwitterHelper,
} from './twitter'
import GithubHelper from './github'
import {
  configureMaintenance,
} from './maintenance'
import {
  createTimeObj,
  getTime,
  serializeObj,
  unserializeObj,
} from './util'


export class App {
  async init() {
    return configureMaintenance(this.redisClient, this.config, { app: true }).run()
  }

  async run() {
    try {
      const isActive = !!await this.redisClient.existsAsync('app')
      const data = isActive ?
        unserializeObj(await this.redisClient.hgetallAsync('app'))
        : await this.init()

      data.time = _.chain(data)
        .pick(['initDate', 'lastRun', 'lastUpdate'])
        .mapValues(v => _.isNil(v) ? null : getTime(v))
        .thru(timeProps => createTimeObj(timeProps))
        .value()

      if (!data.lastRun) {
        data.lastRun = getTime().startOf('day').format()
      }

      const twitterClient = new TwitterHelper(this.config.TWITTER_CONFIG, this.config.LIST_ID)
      const twitterData = await twitterClient.run(data)

      const newData = {}

      if (twitterData.sinceId && twitterData.sinceId !== undefined && twitterData.sinceId !== 'undefined') {
        newData.sinceId = twitterData.sinceId
      }

      if (data.time.yesterdayDate || twitterData.tweets.length > 0) {
        newData.tweets = await _.uniqBy(data.time.yesterdayDate ?
          twitterData.tweets.today :
          data.tweets.concat(twitterData.tweets), 'id')
      }

      if (data.time.yesterdayDate) {
        newData.collectSince = newData.sinceId

        data.tweets = await _.uniqBy(data.tweets.concat(twitterData.tweets.yesterday), 'id')

        await new GithubHelper(this.config.GITHUB_TOKEN, this.config.GITHUB_CONFIG).run(data)
        newData.lastUpdate = data.time.todayDate
      }

      newData.lastRun = data.time.now
      await this.redisClient.hmsetAsync('app', serializeObj(newData))
      return true
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('error with running', e)
      return Promise.reject(e)
    }
  }

  constructor(config, redisClient, opts = {}) {
    this.config = config
    this.redisClient = redisClient
    this.options = opts
  }
}

export const appBuilder = (config, redisClient, opts) => new App(config, redisClient, opts)
