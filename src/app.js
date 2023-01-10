import _ from 'lodash'
import { collectTweets } from './twitter/api'
import { updateRepo } from './github'
import { configureMaintenance } from './maintenance'
import { createTimeObj, getTime } from './util'
import {
  checkIfBucketDataExists,
  loadBucketData,
  writeBucketData,
} from './awsData'
import { GITHUB_CONFIG } from './config'

export class App {
  async init() {
    return configureMaintenance(this.config, {
      app: true,
    }).run()
  }

  async run() {
    try {
      const isActive = await checkIfBucketDataExists()
      const data = isActive ? await loadBucketData() : await this.init()

      data.time = _.chain(data)
        .pick(['lastRun', 'lastUpdate'])
        .mapValues((v) => (_.isNil(v) ? null : getTime(v)))
        .thru((timeProps) => createTimeObj(timeProps))
        .value()

      if (!data.lastRun) {
        data.lastRun = getTime().startOf('day').format()
      }

      const twitterData = await collectTweets(data)

      const newData = {}

      if (
        twitterData.sinceId &&
        twitterData.sinceId !== undefined &&
        twitterData.sinceId !== 'undefined'
      ) {
        newData.sinceId = twitterData.sinceId
      }

      if (data.time.yesterdayDate || twitterData.tweets.length > 0) {
        newData.tweets = await _.uniqBy(
          data.time.yesterdayDate
            ? twitterData.tweets.today
            : data.tweets.concat(twitterData.tweets),
          'id'
        )
      }

      if (data.time.yesterdayDate) {
        newData.collectSince = newData.sinceId

        data.tweets = await _.uniqBy(
          data.tweets.concat(twitterData.tweets.yesterday),
          'id'
        )

        await updateRepo(data, { ...GITHUB_CONFIG })
        // eslint-disable-next-line no-console
        console.log(
          `Updated Github repo with new dataset of ${data.tweets.length} for ${data.time.yesterdayDate}`
        )
        newData.lastUpdate = data.time.todayDate
      }

      newData.lastRun = data.time.now
      // eslint-disable-next-line no-console
      console.log(
        `Successful run process, collected ${
          (twitterData.tweets.yesterday || twitterData.tweets).length
        } new tweets`
      )

      await writeBucketData(newData)
      return true
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('error with running', e)
      return Promise.reject(e)
    }
  }

  constructor(config, opts = {}) {
    this.config = config
    this.options = opts
  }
}

export const appBuilder = (config, opts) => new App(config, opts)
