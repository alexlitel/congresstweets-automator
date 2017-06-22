import _ from 'lodash'
import path from 'path'
import fs from 'fs'
import './load-env'
import {
    APP_CONFIG,
} from './config'
import {
    TwitterHelper,
} from './twitter'
import redisClient from './redis'
import {
    createTimeObj,
    getTime,
    isProd,
} from './util'


class Maintenance {
  static checkForChanges(redisUsers, usersFromFile) {
    return _.chain([redisUsers, usersFromFile])
            .map(arr =>
                _.flatMapDeep(arr, item =>
                    _(item.accounts)
                      .chain()
                      .values()
                      .flatten()
                      .value(),
                ),
            )
            .map((list, i, arr) =>
                _.differenceBy(list,
                    i === 0 ? arr[1] : arr[0], 'id_str'),
            )
            .thru(arr =>
                _.keyBy(arr,
                    // eslint-disable-next-line no-confusing-arrow
                    i => _.indexOf(arr, i) === 0 ? 'old' : 'new'),
            )
            .value()
  }

  static async serverProcess(userData) {
    try {
      const data = await redisClient
                .hgetallAsync('app')
                .then(obj =>
                  // eslint-disable-next-line no-confusing-arrow
                    _.mapValues(obj, v =>
                        v !== undefined && v !== 'undefined' ? JSON.parse(v) : null))

      const changes = await this.checkForChanges(data.users, userData)

      data.time = _.chain(data)
            .pick(['initDate', 'lastRun', 'lastUpdate'])
            // eslint-disable-next-line no-confusing-arrow
            .mapValues(v => _.isNil(v) ? null : getTime(v))
            .thru(timeProps => createTimeObj(timeProps))
            .value()

      const isChanged = _.some(_.values(changes, val => !!val.length))

      if (isChanged) {
        const newData = {}
        newData.users = JSON.stringify(userData)
        const twitterClient = new TwitterHelper(APP_CONFIG.TWITTER_CONFIG, APP_CONFIG.LIST_ID)
        if (changes.new.length > 0) {
          data.ids = changes.new.map(x => x.id_str)
          await twitterClient.updateList('create', changes.new.map(account => account.id_str))
          const twitterData = await twitterClient.run(data, {
            maintenance: true,
          })

          newData.tweets = JSON.stringify([...data.tweets, ...twitterData.tweets])
        }
        if (changes.old.length > 0) {
          await twitterClient.updateList('destroy', changes.old.map(account => account.id_str))
        }
        await redisClient.hmsetAsync('app', _.chain(newData)
                    .omitBy(v => _.isNil(v))
                    .value())
      }
      return true
    } catch (e) {
      return Promise.reject(e)
    }
  }

  static async localProcess(userData) {
    const allUsers = _.sortBy(userData, ['chamber', 'type', 'state', 'name', 'party'])
    const filteredUsers = _.filter(_.cloneDeep(allUsers), item => _.keys(item.accounts).length > 0)
    await fs.writeFileSync(path.join(__dirname, '/../data/users.json'), JSON.stringify(allUsers), () => true)
    await fs.writeFileSync(path.join(__dirname, '/../data/users-filtered.json'), JSON.stringify(filteredUsers), () => true)
    return true
  }

  static async run() {
    try {
      const usersFromFile = await JSON.parse(fs.readFileSync(path.join(__dirname,
                                    `/../data/users${isProd ? '-filtered' : ''}.json`)))

      if (isProd) await this.serverProcess(usersFromFile)
      else await this.localProcess(usersFromFile)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('Maintenance error', e)
    }
    await redisClient.quit()
    return true
  }
}

Maintenance.run()
