import _ from 'lodash'
import bluebird from 'bluebird'
import path from 'path'
import rp from 'request-promise'
import fs from 'fs'
import {
  TwitterHelper,
} from './twitter'
import {
  ChangeMessage,
} from './helpers'
import GithubHelper from './github'
import {
  createTimeObj,
  getTime,
  nativeClone,
  extractAccounts,
  serializeObj,
  unserializeObj,
} from './util'

export class Maintenance {
  static sortAndFilter(data) {
    const obj = {}
    obj.sorted = _.sortBy(data, ['chamber', 'type', 'state', 'name', 'party'])
    obj.filtered = obj.sorted.filter(item => !!item.accounts && !!item.accounts.length)
    return obj
  }

  async checkForChanges({ users: serializedData, accounts: extractedAccounts }, redisData) {
    try {
      const changes = {}
      const ids = {}
      const listData = (await this.twitterClient.getListMembers(true))
        .map((account) => {
          // eslint-disable-next-line camelcase
          const { id_str: id, name, screen_name } = account
          return { id, name, screen_name }
        })
      ids.list = listData.map(x => x.id)
      changes.list = {}
      if (this.options.postBuild) {
        const diffLength = redisData.users.length !== serializedData.length
        const diffs = _.differenceWith(redisData.users, serializedData, _.isEqual)
        changes.storeUpdate = diffLength || diffs.length

        const activeAccounts = {}
        activeAccounts.new = extractedAccounts
          .filter(account => !redisData.deactivated[account.id])

        activeAccounts.old = redisData.accounts
          .filter(account => !redisData.deactivated[account.id])

        ids.new = activeAccounts.new.map(x => x.id)
        ids.old = activeAccounts.old.map(x => x.id)

        activeAccounts.add = activeAccounts.new.filter(x => !ids.old.includes(x.id))

        // Call lookupUsers if new accounts to catch only valid ids to prevent errors
        ids.valid = activeAccounts.add.length ?
          (await this.twitterClient.lookupUsers(activeAccounts.add.map(x => x.id)))
            .map(account => account.id_str)
          : []
        changes.list.add = activeAccounts.add.map(x => ids.valid.includes(x.id))
        // Check for ids not in new data and currently in list
        // so deleted accounts don't throw errors
        changes.list.remove = activeAccounts.old.filter(x => !ids.new.includes(x.id)
          && ids.list.includes(x.id))
      } else {
        const mocData = serializedData
          .map((x, i) =>
            (x.type === 'member' && Object.assign({}, x, { index: i }))
            || null)
          .filter(item => item)
        ids.moc = mocData.map(x => x.id.bioguide)
        ids.allExtracted = extractedAccounts.map(x => x.id)
        ids.mocExtracted = extractedAccounts
          .filter(account => !!account.bioguide)
          .map(account => account.id)
        ids.oldNames = extractedAccounts.map(x => x.screen_name.toLowerCase())

        const outsideData = {}
        outsideData.members = (await rp({
          gzip: true,
          url: 'https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json',
          json: true,
        })).map((item) => {
          const currTerm = item.terms.pop()
          const obj = {}
          obj.id = _.pick(item.id, ['bioguide', 'govtrack'])
          obj.name = [
            item.id.wikipedia,
            item.id.ballotpedia,
            `${item.name.nickname || item.name.first} ${item.name.last}`,
            item.name.official_full,
          ]
            .filter(name => !!name)
            .map((str) => {
              let name = str
              if (name.includes('(')) {
                name = name.slice(0, name.lastIndexOf('(')).trim()
              }
              return _.deburr(name)
            })
            .sort((a, b) => a.length < b.length).pop()
          obj.type = 'member'
          obj.state = currTerm.state
          obj.chamber = currTerm.type === 'sen' ? 'senate' : 'house'
          obj.party = currTerm.party.split(' ').map(word => word.slice(0, 1)).join(' ')
          obj.accounts = []
          return obj
        })

        ids.extMembers = outsideData.members.map(x => x.id.bioguide)
        changes.members = {}
        changes.members.add = outsideData.members.filter(x => !ids.moc.includes(x.id.bioguide))
        changes.members.remove = mocData.filter(x => !ids.extMembers.includes(x.id.bioguide))
        ids.membersAdd = changes.members.add.map(x => x.id.bioguide)

        outsideData.social = (await rp({
          gzip: true,
          url: 'https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-social-media.json',
          json: true,
        })).filter(member =>
          ids.extMembers.includes(member.id.bioguide)
          && (member.social
            && !!member.social.twitter))
          .map((item) => {
            const obj = {}
            obj.bioguide = item.id.bioguide
            obj.isNew = ids.membersAdd.includes(obj.bioguide)
            obj.index = obj.isNew
              ? ids.membersAdd.indexOf(obj.bioguide)
              : mocData[ids.moc.indexOf(obj.bioguide)].index
            obj.screen_name = item.social.twitter
            obj.id = item.social.twitter_id
            obj.name = outsideData.members[ids.extMembers.indexOf(obj.bioguide)].name
            obj.account_type = 'office'
            return obj
          })


        if (redisData && redisData.users) {
          changes.list = extractedAccounts.reduce((p, c) => {
            if (redisData.deactivated[c.id]) {
              if (ids.list.includes(c.id)) p.reactivated.push(c)
            } else if (!ids.list.includes(c.id)) p.deactivated.push(c)
            return p
          }, { deactivated: [], reactivated: [] })

          // Accounts that have been inactive for 30+ days, when Twitter deletes account
          // Or deactivated accounts that will be removed because
          // members were removed in external data
          changes.list.deleted = await Object.keys(redisData.deactivated)
            .map(x =>
              Object.assign(
                {},
                extractedAccounts[ids.allExtracted.indexOf(x)],
                { id: x },
              ))
            .filter(x =>
              (redisData.deactivated[x.id] === redisData.time.todayDate
                && !ids.list.includes(x.id))
              || (x.bioguide
                && !ids.extMembers.includes(x.bioguide)))
        }
        changes.list.renamed = listData.filter(x =>
          !ids.oldNames.includes(x.screen_name.toLowerCase())
          && ids.allExtracted.includes(x.id))
          .map((account) => {
            const ind = ids.allExtracted.indexOf(account.id)
            const oldRecord = extractedAccounts[ind]
            return Object.assign(
              {},
              oldRecord,
              {
                screen_name: account.screen_name,
                old_name: oldRecord.screen_name,
              },
            )
          })

        changes.members.update = outsideData.members.reduce((p, c) => {
          const ind = ids.moc.indexOf(c.id.bioguide)
          if (ind !== -1) {
            const oldRec = mocData[ind]
            const isChanged = ['party', 'chamber'].filter(key => oldRec[key] !== c[key])
            c.index = oldRec.index
            if (isChanged.length) p.push(c)
          }
          return p
        }, [])

        changes.social = {}
        changes.social.add = outsideData.social.filter(x => x.id
          && !ids.mocExtracted.includes(x.id))
      }
      changes.count = Object.keys(changes)
        .filter(x => typeof changes[x] === 'object')
        .reduce(
          (p, c) =>
            p + _.values(changes[c])
              .reduce((p2, c2) =>
                p2 + c2.length, 0)
          , 0,
        )

      if (!this.options.postBuild) {
        changes.historical = [
          changes.members.add,
          changes.members.update,
          changes.social.add,
          changes.list.deleted,
          changes.list.renamed,
        ].some(x => x && x.length)

        changes.file = changes.count - ((changes.list.deactivated
          && (changes.list.deactivated.length
            + changes.list.reactivated.length)) || 0) !== 0
      }
      return changes
    } catch (e) {
      return Promise.reject(e)
    }
  }


  async parseChanges(changes, fileData, redisData) {
    try {
      const newData = {}
      const toStore = {}
      const toWrite = {}

      if (this.options.postBuild) {
        if (changes.storeUpdate) {
          toStore.users = fileData.users
          toStore.accounts = fileData.accounts
        }

        if (changes.count) {
          if (changes.list.remove.length) await this.twitterClient.updateList('destroy', changes.list.remove.map(x => x.id))
          if (changes.list.add.length) {
            await this.twitterClient.updateList('create', changes.list.add.map(x => x.id))
            if (redisData.isActive && redisData.tweets.length) {
              redisData.accounts = changes.list.add
              const twitterData = await this.twitterClient.run(redisData, { maintenance: true })
              toStore.tweets = redisData.tweets.concat(twitterData.tweets)
            }
          }
        }
      } else if (changes.count) {
        const historical = {}
        let tempData = {}

        if (changes.file) tempData.users = nativeClone(fileData.users)

        if (!this.options.noCommit && changes.historical) {
          historical.changed = false
          historical.data = await JSON.parse(fs.readFileSync(path.join(
            __dirname,
            '/../data/historical-users.json',
          )))
          historical.accounts = await extractAccounts(historical.data)
          historical.ids = {}
          historical.ids.moc = historical.data.map(x => (x.id && x.id.bioguide) || null)
          historical.ids.social = historical.accounts.map(x => x.id)
          tempData.historical_users = nativeClone(historical.data)
        }

        if (redisData.users) {
          const accountsChanged = ['deleted', 'deactivated', 'reactivated'].some(x =>
            changes.list[x].length)
          const serializableChanges = this.options.hasBot ?
            _.omitBy(changes.list, (v, k) => k === 'deleted' || !v.length)
            : null

          if (accountsChanged) {
            const idsToRemove = changes.list.reactivated
              .concat(changes.list.deleted)
              .map(x => x.id)
            toStore.deactivated = _.chain(redisData.deactivated)
              .omit(idsToRemove)
              .merge(changes.list.deactivated.reduce((p, c) => {
                p[c.id] = redisData.time.todayDate
                return p
              }, {}))
              .value()
          }
          if (serializableChanges && Object.keys(serializableChanges).length) {
            toStore.changes = serializableChanges
          }

          if (changes.list.deleted.length) {
            await bluebird.each(changes.list.deleted, (item) => {
              const record = tempData.users[item.user_index]
              record.accounts = record.accounts.filter(account => account.id !== item.id)
              if (historical.data) {
                if (!historical.changed) historical.changed = true
                const histId = historical.ids.social.indexOf(item.id)
                const histAccount = historical.accounts[histId]
                const histRecord = tempData.historical_users[histAccount.user_index]
                histRecord.accounts[histAccount.account_index].deleted = true
              }
            })
          }
        }

        if (changes.list.renamed.length) {
          await bluebird.each(changes.list.renamed, (item) => {
            tempData.users[item.user_index]
              .accounts[item.account_index]
              .screen_name = item.screen_name
            if (historical.data) {
              if (!historical.changed) historical.changed = true
              const histId = historical.ids.social.indexOf(item.id)
              const histAccount = historical.accounts[histId]
              const histRecord = tempData.historical_users[histAccount.user_index]
                .accounts[histAccount.account_index]
              if (!histRecord.prev_names) histRecord.prev_names = []
              histRecord.prev_names.push(histAccount.screen_name)
              histRecord.screen_name = item.screen_name
            }
          })
        }


        if (changes.social.add.length) {
          await bluebird.each(changes.social.add, (item) => {
            const newItem = _.omit(item, ['bioguide', 'name', 'index', 'isNew'])
            const record = item.isNew ?
              changes.members.add[item.index]
              : tempData.users[item.index]
            if (!record.accounts) record.accounts = []
            record.accounts.push(newItem)
            if (historical.data && historical.ids.moc.includes(item.bioguide)) {
              if (!historical.ids.social.includes(item.id)) {
                if (!historical.changed) historical.changed = true
                const histId = historical.ids.moc.indexOf(item.bioguide)
                tempData.historical_users[histId].accounts.push(newItem)
              }
            }
          })
        }

        if (changes.members.update.length) {
          await bluebird.each(changes.members.update, (item) => {
            Object.assign(tempData.users[item.index], _.pick(item, ['chamber', 'party']))
            if (historical.data) {
              if (!historical.changed) historical.changed = true
              const histId = historical.ids.moc.indexOf(item.id.bioguide)
              const histRecord = tempData.historical_users[histId]
              const diffs = ['chamber', 'state', 'party']
                .filter(prop => histRecord[prop] !== item[prop])
                .reduce((obj, prop) => {
                  obj.old[prop] = histRecord[prop]
                  obj.new[prop] = item[prop]
                  return obj
                }, { old: {}, new: {} })
              if (!histRecord.prev_props) histRecord.prev_props = []
              histRecord.prev_props.push(Object.assign(
                {},
                diffs.old,
                { until: redisData.time.yesterdayDate },
              ))
              Object.assign(histRecord, diffs.new)
            }
          })
        }

        if (changes.members.remove.length) {
          const idsToRemove = changes.members.remove.map(x => x.id.bioguide)
          tempData.users = await tempData.users.filter((item) => {
            if (item.id && item.id.bioguide) {
              return !idsToRemove.includes(item.id.bioguide)
            } return true
          })
        }

        if (changes.members.add.length) {
          tempData.users.push(...changes.members.add)
          if (historical.data) {
            await bluebird.each(changes.members.add, (item) => {
              const histId = historical.ids.moc.indexOf(item.id.bioguide)
              if (histId !== -1) {
                const histRecord = tempData.historical_users[histId]
                const diffs = ['chamber', 'state', 'party']
                  .filter(prop => histRecord[prop] !== item[prop])
                  .reduce((obj, prop) => {
                    obj.old[prop] = histRecord[prop]
                    obj.new[prop] = item[prop]
                    return obj
                  }, { old: {}, new: {} })
                if (Object.keys(diffs.old).length) {
                  if (!historical.changed) historical.changed = true
                  if (!histRecord.prev_props) histRecord.prev_props = []
                  histRecord.prev_props.push(Object.assign(
                    {},
                    diffs.old,
                    { until: redisData.time.yesterdayDate },
                  ))
                  Object.assign(histRecord, diffs.new)
                }
              } else {
                if (!historical.changed) historical.changed = true
                tempData.historical_users.push(item)
              }
            })
          }
        }

        if (changes.historical || changes.file) {
          if (changes.historical) {
            tempData = historical.changed ?
              _.mapKeys(tempData, (v, k) => k.replace(/_/g, '-'))
              : _.omit(tempData, ['historical_users'])
          }
          await bluebird.each(Object.keys(tempData), (key) => {
            const data = this.constructor.sortAndFilter(tempData[key])
            tempData[key] = data.sorted
            tempData[`${key}-filtered`] = data.filtered
          })

          Object.assign(toWrite, tempData)
        }
      }

      if (Object.keys(toWrite).length) newData.toWrite = toWrite
      if (Object.keys(toStore).length) newData.toStore = toStore
      return newData
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async initStore({ users, accounts }) {
    try {
      const obj = {
        initDate: this.config.INIT_DATE || (this.options.app ?
          getTime().startOf('hour') : getTime().startOf('hour').add(1, 'h')).format('YYYY-MM-DD'),
        lastRun: null,
        lastUpdate: null,
        sinceId: null,
        collectSince: null,
        tweets: [],
        users,
        accounts,
        deactivated: {},
      }
      await this.redisClient.hmsetAsync('app', _.mapValues(obj, v => JSON.stringify(v)))
      return obj
    } catch (e) {
      return Promise.reject(e)
    }
  }


  async initList(accounts) {
    try {
      if (this.options.isProd) throw new Error('List must be created locally')
      const listName = typeof this.options.initList === 'string' ? this.options.initList : null
      const createdList = await this.twitterClient.createList(listName)
      await fs.appendFileSync(path.join(__dirname, '../.env'), `\nLIST_ID=${createdList.id_str}`, 'utf8')
      this.twitterClient.listId = createdList.id_str
      await this.twitterClient.updateList('create', accounts.map(x => x.id))
      return true
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async formatFiles() {
    if (this.options.isProd) throw new Error('Can only format files locally')
    const files = ['users', 'historical-users']
    const folder = path.join(__dirname, '../data/')
    await bluebird.each(files, (file) => {
      const filePath = path.join(folder, `${file}.json`)
      const filteredPath = path.join(folder, `${file}-filtered.json`)
      const data = this.constructor.sortAndFilter(JSON.parse(fs.readFileSync(filePath)))
      fs.writeFileSync(filePath, JSON.stringify(data.sorted))
      fs.writeFileSync(filteredPath, JSON.stringify(data.filtered))
    })
    return true
  }

  async run() {
    try {
      if (this.options.formatOnly) return await this.formatFiles()
      const fileData = {}

      fileData.users = await JSON.parse(fs.readFileSync(path.join(
        __dirname,
        '/../data/users.json',
      )))

      fileData.accounts = await extractAccounts(fileData.users)

      let isActive
      let redisData

      if (this.twitterClient && (!this.twitterClient.listId || this.options.initList)) {
        await this.initList(fileData.accounts)
      }

      if (this.redisClient) {
        isActive = (await this.redisClient.existsAsync('app')) && !this.options.app
        redisData = isActive ?
          unserializeObj(await this.redisClient.hgetallAsync('app'))
          : await this.initStore(fileData)

        if (this.options.app) return redisData
        redisData.time = _.chain(redisData)
          .pick(['initDate', 'lastRun', 'lastUpdate'])
          .mapValues(v => _.isNil(v) ? null : getTime(v))
          .thru(timeProps => createTimeObj(timeProps))
          .value()
        if (!this.options.postBuild && !redisData.time.yesterdayDate) {
          redisData.time.yesterdayDate = getTime(redisData.time.todayDate)
            .subtract(1, 'days')
            .format('YYYY-MM-DD')
        }
        redisData.isActive = isActive
      } else {
        redisData = {}
        redisData.time = createTimeObj({})
      }

      // handle backwards compatibility
      if (redisData && isActive) {
        if (!_.isArray(redisData.users[0].accounts)) {
          redisData.users = await _.flatMap(redisData.users, (user) => {
            user.accounts = Object.keys(user.accounts).reduce((p, c) => {
              const accounts = user.accounts[c].map((x) => {
                x.account_type = c
                x.id = x.id_str
                delete x.id_str
                return x
              })
              p.push(...accounts)
              return p
            }, [])
            return user
          })
        }
        if (!redisData.deactivated) redisData.deactivated = {}
        if (!redisData.accounts) redisData.accounts = await extractAccounts(redisData.users)
      }

      const args = await [fileData, redisData].map(x => x ? nativeClone(x) : null)
      const changes = await this.checkForChanges(...args)
      const newData = await this.parseChanges(changes, fileData, redisData)

      // eslint-disable-next-line no-console
      console.log(await ChangeMessage.create(changes, this.options))

      if (Object.keys(newData).length) {
        if (newData.toStore && Object.keys(newData.toStore).length) {
          await this.redisClient.hmsetAsync('app', serializeObj(newData.toStore))
        }
        if (newData.toWrite && Object.keys(newData.toWrite).length) {
          if (this.options.selfUpdate && !this.options.noCommit) {
            const commitMessage = await ChangeMessage.create(
              changes,
              { ...this.options, isCommit: true },
            )
            const runOptions = { recursive: true, message: commitMessage }
            await this.githubClient.run(newData, runOptions)
          } else {
            await bluebird.each(Object.keys(newData.toWrite), (key) => {
              const filePath = path.join(__dirname, '../data/', `${key}.json`)
              fs.writeFileSync(filePath, JSON.stringify(newData.toWrite[key]))
            })
            if (this.options.selfUpdate && this.options.noCommit) {
              this.options.noCommit = false
              this.options.postBuild = true
              await this.run()
            }
          }
        }
      }

      return true
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('Maintenance error', e)
      return Promise.reject(e)
    }
  }

  constructor(redisStore, config, opts = {}) {
    if ((opts.postBuild || opts.localStore) && !redisStore) {
      throw new Error('Must have valid redis client for post-build maintenance or local maintenance with localStore flag')
    }
    if (opts.selfUpdate && !opts.noCommit) {
      if (!(config && config.GITHUB_TOKEN && config.GITHUB_CONFIG && config.SELF_REPO)) {
        throw new Error('Missing required props for Github client for self-updating maintenance')
      } else {
        this.githubClient = new GithubHelper(
          config.GITHUB_TOKEN,
          { owner: config.GITHUB_CONFIG.owner, repo: config.SELF_REPO },
        )
      }
    }

    this.redisClient = redisStore
    this.config = config
    this.twitterClient = config && _.has(config, 'TWITTER_CONFIG.consumer_key') ?
      new TwitterHelper(config.TWITTER_CONFIG, config.LIST_ID) : null
    this.options = opts
  }
}

// eslint-disable-next-line max-len
export const configureMaintenance = (redisStore, config, flags) => new Maintenance(redisStore, config, flags)
