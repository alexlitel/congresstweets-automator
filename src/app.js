import path from 'path'
import fs from 'fs'
import _ from 'lodash'
import {
    TwitterHelper,
} from './twitter'
import GithubHelper from './github'
import {
    createTimeObj,
    getTime,
} from './util'


export class App {
  async init() {
    const users = await JSON.parse(fs.readFileSync(path.join(__dirname, '/../data/users-filtered.json')))
    const obj = {
      initDate: getTime().format('YYYY-MM-DD'),
      lastRun: null,
      lastUpdate: null,
      sinceId: null,
      tweets: [],
      users,
    }
    await this.redisClient.hmsetAsync('app', _.mapValues(obj, v => JSON.stringify(v)))
    return obj
  }

  async run() {
    try {
      const isActive = !!await this.redisClient.existsAsync('app')

      const data = await (isActive ?
                this.redisClient
                .hgetallAsync('app')
                .then(obj =>
                  // eslint-disable-next-line no-confusing-arrow
                    _.mapValues(obj, v =>
                        v !== undefined && v !== 'undefined' ? JSON.parse(v) : null)) : this.init()
            )

      data.time = _.chain(data)
                .pick(['initDate', 'lastRun', 'lastUpdate'])
                // eslint-disable-next-line no-confusing-arrow
                .mapValues(v => _.isNil(v) ? null : getTime(v))
                .thru(timeProps => createTimeObj(timeProps))
                .value()

      const twitterClient = new TwitterHelper(this.config.TWITTER_CONFIG, this.config.LIST_ID)
      const twitterData = await twitterClient.run(data)

      const newData = {}
      if (twitterData.sinceId !== undefined && twitterData.sinceId !== 'undefined') {
        newData.sinceId = twitterData.sinceId
      }

      if (data.tweets.length !== twitterData.tweets.length) {
        newData.tweets = _.uniqBy(data.time.yesterdayDate
                                    ? twitterData.tweets[2]
                                    : [...data.tweets, ...twitterData.tweets], 'id')
      }

      if (data.time.yesterdayDate) {
        data.tweets = _.chain(twitterData.tweets)
                        .slice(0, -1)
                        .flatten()
                        .uniqBy('id')
                        .value()

        await new GithubHelper(this.config.GITHUB_TOKEN, this.config.GITHUB_CONFIG).run(data)
        newData.lastUpdate = data.time.todayDate
      }

      newData.lastRun = data.time.now
      await this.redisClient.hmsetAsync('app', _.chain(newData)
                                                .omitBy(v => _.isNil(v))
                                                .mapValues(v => JSON.stringify(v))
                                                .value())
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('error with running', e)
      return e
    }
    await this.redisClient.quit()
    return true
  }

  constructor(config, redisClient) {
    this.config = config
    this.redisClient = redisClient
  }
}

export const appBuilder = (config, redisClient) => new App(config, redisClient)
