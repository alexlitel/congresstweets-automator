import _ from 'lodash'
import redis from 'redis-mock'
import path from 'path'
import bluebird from 'bluebird'
import MockApi from './helpers/api-mock'
import {
    testConfig,
    mockChanges,
} from './util/test-util'
import GithubHelper from '../src/github'
import {
    configureMaintenance,
    Maintenance,
} from '../src/maintenance'
import {
  nativeClone,
  extractAccounts,
  serializeObj,
  unserializeObj,
} from '../src/util'

bluebird.promisifyAll(redis)

let redisClient
let mockApi
const data = {}

jest.mock('fs', () => ({
  readFileSync: (filePath) => {
    if (!/(node_modules|test|mock)/gi.test(filePath)) {
      const nativeClone = require('../src/util').nativeClone
      const path = require('path')
      const dummyDataPath = path.join('./test/', '/data/users.json')
      const readData = require.requireActual('fs').readFileSync(dummyDataPath)
      const data = JSON.parse(readData)
      const first = data.shift()
      data.push(first)
      return JSON.stringify(data)
    }
    return require.requireActual('fs').readFileSync(filePath)
  },
  appendFileSync: jest.fn(() => {}),
  writeFileSync: jest.fn(() => {}),
}))

const fs = require('fs')

const loadData = () => {
  data.users = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/users.json')))
  data.time = {
    todayDate: '2017-02-02',
  }
  data.tweets = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/tweets-parsed.json')))
}

const resetMocks = () => {
  jest.resetModules()
  jest.resetAllMocks()
  MockApi.cleanMocks()
}

beforeAll(() => {
  resetMocks()
  loadData()
  mockApi = new MockApi('both')
  mockApi.init()
  redisClient = redis.createClient()
})

afterAll(() => {
  resetMocks()
})

/* eslint-disable quote-props */

describe('Maintenance factory-type function instantiates correctly', () => {
  test('Instantiates as normal', () => {
    const instance = configureMaintenance(redisClient, testConfig, { isProd: true })
    expect(instance).toHaveProperty('redisClient')
    expect(instance).toHaveProperty('config')
    expect(instance.config).toHaveProperty('TWITTER_CONFIG')
    expect(instance).toHaveProperty('twitterClient')
    expect(instance.twitterClient).toBeTruthy()
    expect(instance).toHaveProperty('options.isProd', true)
  })

  test('Omits redis and twitter clients when properties not passed', () => {
    const instance = configureMaintenance(null, null, { isProd: true })
    expect(instance).toHaveProperty('redisClient')
    expect(instance.redisClient).toBeNull()
    expect(instance).toHaveProperty('config')
    expect(instance.config).toBeNull()
    expect(instance).toHaveProperty('twitterClient')
    expect(instance.twitterClient).toBeNull()
    expect(instance).toHaveProperty('options.isProd', true)
  })

  test('Instanties with Github client when selfUpdate flag passed', () => {
    const instance = configureMaintenance(redisClient, testConfig, { selfUpdate: true })
    expect(instance).toHaveProperty('githubClient')
  })

  test('Throws error when postBuild or localStore flags passed without redis store', () => {
    const err = 'Must have valid redis client for post-build maintenance or local maintenance with localStore flag'
    expect(() => configureMaintenance(null, testConfig, { postBuild: true })).toThrow(err)
    expect(() => configureMaintenance(null, testConfig, { localStore: true })).toThrow(err)
  })

  test('Throws error when selfUpdate flag passed without required Github props and noCommit flag', () => {
    const err = 'Missing required props for Github client for self-updating maintenance'
    const opts = { selfUpdate: true }
    expect(() => configureMaintenance(redisClient, null, opts)).toThrow(err)
    expect(() => configureMaintenance(redisClient,
                                      _.omit(testConfig, ['GITHUB_CONFIG']),
                                      opts)).toThrow(err)
    expect(() => configureMaintenance(redisClient,
                                      _.omit(testConfig, ['GITHUB_TOKEN']),
                                      opts)).toThrow(err)
    expect(() => configureMaintenance(redisClient,
                                      _.omit(testConfig, ['SELF_REPO']),
                                      opts)).toThrow(err)
  })
})

describe('Maintenance class methods', () => {
  let maintain
  const mockFns = {}

  beforeEach(async () => {
    jest.resetAllMocks()
    maintain = await configureMaintenance(redisClient, nativeClone(testConfig), {})

    // eslint-disable-next-line
    for (const key of Object.keys(mockFns)) {
      mockFns[key].mockRestore()
    }
    mockFns.get = jest.spyOn(maintain.twitterClient.client, 'get')
    mockFns.post = jest.spyOn(maintain.twitterClient.client, 'post')
    mockFns.createList = jest.spyOn(maintain.twitterClient, 'createList')
    mockFns.searchStatuses = jest.spyOn(maintain.twitterClient, 'searchStatuses')
    mockFns.updateList = jest.spyOn(maintain.twitterClient, 'updateList')
    mockFns.run = jest.spyOn(maintain.twitterClient, 'run')
    mockFns.sortAndFilter = jest.spyOn(Maintenance, 'sortAndFilter')
    mockFns.formatFiles = jest.spyOn(maintain, 'formatFiles')
    mockFns.checkForChanges = jest.spyOn(maintain, 'checkForChanges')
    mockFns.initStore = jest.spyOn(maintain, 'initStore')
    mockFns.initList = jest.spyOn(maintain, 'initList')
    mockFns.hmsetAsync = jest.spyOn(redisClient, 'hmsetAsync')
    mockFns.hgetallAsync = jest.spyOn(redisClient, 'hgetallAsync')
    mockFns.maintainRun = jest.spyOn(maintain, 'run')
    mockFns.readFileSync = jest.spyOn(fs, 'readFileSync')

    await redisClient.flushdbAsync()
  })

  describe('initStore', () => {
    test('Successfully initializes store', async () => {
      const fileData = { users: data.users, accounts: extractAccounts(data.users) }
      const initialized = await maintain.initStore(fileData)
      const reqProps = ['initDate', 'lastRun', 'lastUpdate', 'sinceId',
        'collectSince', 'tweets', 'users', 'accounts', 'deactivated']
      const storePostInit = unserializeObj(await redisClient.hgetallAsync('app'))
      expect(Object.keys(initialized)).toEqual(reqProps)
      expect(Object.keys(storePostInit)).toEqual(reqProps)
      expect(initialized).toEqual(storePostInit)
      expect(initialized.users).toHaveLength(9)
      expect(initialized.accounts).toHaveLength(8)
      expect(initialized.users[0].name).toEqual('House Caucus')
      expect(initialized.accounts[0].name).toEqual('House Caucus')
      expect(true).toBe(true)
    })
  })

  describe('initList', () => {
    beforeEach(() => {
      maintain.twitterClient.listId = null
    })

    test('Creates list named "congress" when initList is set to boolean', async () => {
      maintain.options.initList = true
      const accounts = await extractAccounts(data.users)
      await maintain.initList(accounts)
      expect(mockFns.createList).toBeCalled()
      expect(mockFns.updateList).toBeCalled()
      expect(mockFns.updateList.mock.calls[0][0]).toEqual('create')
      expect(mockFns.post.mock.calls[0][1]).toHaveProperty('name', 'congress')
      expect(fs.appendFileSync.mock.calls[0][0]).toEqual(expect.stringContaining('.env'))
      expect(fs.appendFileSync.mock.calls[0][1]).toEqual('\nLIST_ID=11111')
      expect(maintain.twitterClient.listId).toEqual('11111')
    })

    test('Creates list with custom name when class has initList option set to string', async () => {
      maintain.options.initList = 'customName'
      const accounts = await extractAccounts(data.users)
      await maintain.initList(accounts)
      expect(mockFns.createList).toBeCalled()
      expect(mockFns.updateList).toBeCalled()
      expect(mockFns.updateList.mock.calls[0][0]).toEqual('create')
      expect(mockFns.post.mock.calls[0][1]).toHaveProperty('name', 'customName')
      expect(fs.appendFileSync.mock.calls[0][0]).toMatch('.env')
      expect(fs.appendFileSync.mock.calls[0][1]).toEqual('\nLIST_ID=11111')
      expect(maintain.twitterClient.listId).toEqual('11111')
    })

    test('Throws error when run in production environment', async () => {
      maintain.options.isProd = true
      const accounts = await extractAccounts(data.users)
      await expect(maintain.initList(accounts)).rejects.toEqual(new Error('List must be created locally'))
    })
  })

  describe('formatFiles', () => {
    test('Formats files', async () => {
      await maintain.formatFiles()
      expect(mockFns.readFileSync).toHaveBeenCalledTimes(2)
      expect(fs.writeFileSync).toHaveBeenCalledTimes(4)
      expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(2)
      expect(mockFns.readFileSync.mock.calls[0][0]).toMatch('users')
      expect(mockFns.readFileSync.mock.calls[1][0]).toMatch('historical-users')
      expect(mockFns.sortAndFilter.mock.calls[0][0][0].type).toEqual('committee')
      expect(fs.writeFileSync.mock.calls[0][0]).toMatch('users')
      expect(fs.writeFileSync.mock.calls
                                  .map(call => JSON.parse(call[1]).length)).toEqual([9, 5, 9, 5])
      expect(JSON.parse(fs.writeFileSync.mock.calls[0][1])[0].type).toMatch('caucus')
      expect(fs.writeFileSync.mock.calls[1][0]).toMatch('users-filtered')
      expect(fs.writeFileSync.mock.calls[2][0]).toMatch('historical-users')
      expect(fs.writeFileSync.mock.calls[3][0]).toMatch('historical-users-filtered')
    })

    test('Throws error when run in production environment', async () => {
      maintain.options.isProd = true
      await expect(maintain.formatFiles()).rejects.toEqual(new Error('Can only format files locally'))
    })
  })

  describe('checkForChanges', () => {
    let redisData
    let fileData

    beforeEach(() => {
      fileData = {}
      redisData = {}
      redisData.time = nativeClone(data.time)
      mockApi.options = {}
      fileData.users = nativeClone(data.users)
    })

    describe('With post-build flag', () => {
      beforeEach(() => {
        maintain.options.postBuild = true
      })

      describe('Existing and new data are the same', () => {
        test('Returns no changes', async () => {
          fileData.accounts = extractAccounts(fileData.users)
          redisData.users = fileData.users
          redisData.accounts = fileData.accounts
          redisData.deactivated = {}
          const changes = await maintain.checkForChanges(fileData, redisData)
          expect(changes.storeUpdate).toBeFalsy()
          expect(changes.count).toEqual(0)
          expect(changes.list.add).toHaveLength(0)
          expect(changes.list.remove).toHaveLength(0)
        })
      })

      describe('Existing and new data are different', () => {
        test('Returns changes when users added in new data', async () => {
          fileData.users.push({
            name: 'Senator Senate',
            id: { bioguide: 'FOO100', govtrack: '100000' },
            accounts: [{ id: '123', screen_name: 'SenatorSenate', account_type: 'office' }],
          })
          fileData.accounts = extractAccounts(fileData.users)
          redisData.users = nativeClone(data.users)
          redisData.accounts = extractAccounts(redisData.users)
          redisData.deactivated = { '3': 'whatever' }
          const changes = await maintain.checkForChanges(fileData, redisData)
          expect(changes.storeUpdate).toEqual(true)
          expect(changes.list.add).toHaveLength(1)
          expect(changes.count).toEqual(1)
          expect([..._.values(changes.list).map(x => x.id)]).not.toContain('3')
        })

        test('Returns changes when users removed in new data', async () => {
          fileData.users = fileData.users.slice(0, -2)
          fileData.accounts = extractAccounts(fileData.users)
          redisData.users = nativeClone(data.users)
          redisData.accounts = extractAccounts(redisData.users)
          redisData.deactivated = { '3': 'whatever' }
          const changes = await maintain.checkForChanges(fileData, redisData)

          expect(changes.storeUpdate).toEqual(true)
          expect(changes.list.remove).toHaveLength(2)
          expect(changes.count).toEqual(2)
          expect(changes.list.remove[0].id).toEqual('7')
          expect([..._.values(changes.list).map(x => x.id)]).not.toContain('3')
        })
      })
    })

    describe('Without post-build flag', () => {
      beforeEach(() => {
        mockApi.options.maintain = {}
      })

      test('Returns no changes when existing and new data are same', async () => {
        fileData.accounts = extractAccounts(fileData.users)
        redisData.users = fileData.users
        redisData.accounts = fileData.accounts
        redisData.deactivated = {}
        const changes = await maintain.checkForChanges(fileData, redisData)
        expect(changes.list.deactivated).toHaveLength(0)
        expect(changes.list.reactivated).toHaveLength(0)
        expect(changes.list.deleted).toHaveLength(0)
        expect(changes.list.renamed).toHaveLength(0)
        expect(changes.members.add).toHaveLength(0)
        expect(changes.members.remove).toHaveLength(0)
        expect(changes.social.add).toHaveLength(0)
        expect(changes.count).toEqual(0)
        expect(changes.historical).toBeFalsy()
        expect(changes.file).toBeFalsy()
      })

      test('Returns changes when existing and new data are different', async () => {
        fileData.accounts = extractAccounts(fileData.users)
        redisData.users = fileData.users
        redisData.accounts = fileData.accounts
        redisData.deactivated = { '18': '2017-02-02' }
        const changes = await maintain.checkForChanges(fileData, redisData)
        expect(changes.list.deactivated).toHaveLength(0)
        expect(changes.list.reactivated).toHaveLength(0)
        expect(changes.list.deleted).toHaveLength(1)
        expect(changes.list.renamed).toHaveLength(0)
        expect(changes.members.add).toHaveLength(0)
        expect(changes.members.remove).toHaveLength(0)
        expect(changes.social.add).toHaveLength(0)
        expect(changes.count).toEqual(1)
        expect(changes.historical).toBeTruthy()
        expect(changes.file).toBeTruthy()
      })

      test('Doesn\'t check for deactivated, deleted or reactivated accounts without redis store', async () => {
        fileData.accounts = extractAccounts(fileData.users)
        const changes = await maintain.checkForChanges(fileData, null)
        expect(changes.list).not.toHaveProperty('deactivated')
        expect(changes.list).not.toHaveProperty('reactivated')
        expect(changes.list).not.toHaveProperty('deleted')
      })

      describe('List changes', () => {
        test('Returns deleted account', async () => {
          fileData.users.push({ name: 'House Caucus2',
            chamber: 'house',
            type: 'caucus',
            party: 'D',
            accounts: [
              {
                id: '18',
                screen_name: 'HouseCaucus2',
                account_type: 'office',
              },
            ],
          })
          redisData.deactivated = { '18': '2017-02-02' }
          fileData.accounts = extractAccounts(fileData.users)
          redisData.users = fileData.users
          const changes = await maintain.checkForChanges(fileData, redisData)
          expect(changes.list.deleted).toHaveLength(1)
          expect(changes.list.deleted[0].id).toEqual('18')
          expect(changes.count).toEqual(1)
          expect(changes.historical).toBeTruthy()
          expect(changes.file).toBeTruthy()
        })

        test('Returns reactivated account', async () => {
          redisData.deactivated = { '7': '2017-02-20' }
          fileData.accounts = extractAccounts(fileData.users)
          redisData.users = fileData.users
          const changes = await maintain.checkForChanges(fileData, redisData)
          expect(changes.list.reactivated).toHaveLength(1)
          expect(changes.list.reactivated[0].id).toEqual('7')
          expect(changes.count).toEqual(1)
          expect(changes.historical).toBeFalsy()
          expect(changes.file).toBeFalsy()
        })

        test('Returns account reactivated right before deletion', async () => {
          redisData.deactivated = { '7': '2017-02-02' }
          fileData.accounts = extractAccounts(fileData.users)
          redisData.users = fileData.users
          const changes = await maintain.checkForChanges(fileData, redisData)
          expect(changes.list.reactivated).toHaveLength(1)
          expect(changes.list.reactivated[0].id).toEqual('7')
          expect(changes.count).toEqual(1)
          expect(changes.historical).toBeFalsy()
          expect(changes.file).toBeFalsy()
        })

        test('Returns deactivated accounts', async () => {
          mockApi.options.maintain.type = 'deactivated'
          redisData.deactivated = {}
          fileData.accounts = extractAccounts(fileData.users)
          redisData.users = fileData.users
          const changes = await maintain.checkForChanges(fileData, redisData)
          expect(changes.list.deactivated).toHaveLength(1)
          expect(changes.list.deactivated[0].id).toEqual('1')
          expect(changes.count).toEqual(1)
          expect(changes.historical).toBeFalsy()
          expect(changes.file).toBeFalsy()
        })

        test('Returns renamed accounts', async () => {
          mockApi.options.maintain.type = 'renamed'
          fileData.accounts = extractAccounts(fileData.users)
          const changes = await maintain.checkForChanges(fileData)
          expect(changes.list.renamed).toHaveLength(1)
          expect(changes.list.renamed[0].screen_name).toEqual('changedName')
          expect(changes.list.renamed[0].old_name).toEqual('HouseCaucus')
          expect(changes.count).toEqual(1)
          expect(changes.historical).toBeTruthy()
          expect(changes.file).toBeTruthy()
        })
      })

      describe('External legislator dataset changes', () => {
        test('Returns MOCs from current-legislators dataset not in local data', async () => {
          mockApi.options.maintain.type = 'addCurr'
          fileData.users = fileData.users.slice(0, -1)
          fileData.accounts = extractAccounts(fileData.users)
          const changes = await maintain.checkForChanges(fileData)
          expect(changes.members.add).toHaveLength(1)
          expect(changes.members.add[0].id.bioguide).toEqual('4')
          expect(changes.count).toEqual(1)
          expect(changes.historical).toBeTruthy()
          expect(changes.file).toBeTruthy()
        })

        test('Returns MOCs from current-legislators dataset with changed props not in local data', async () => {
          fileData.users[fileData.users.length - 1].party = 'A'
          fileData.accounts = extractAccounts(fileData.users)
          const changes = await maintain.checkForChanges(fileData)
          expect(changes.members.update).toHaveLength(1)
          expect(changes.members.update[0]).toHaveProperty('index')
          expect(changes.count).toEqual(1)
          expect(changes.historical).toBeTruthy()
          expect(changes.file).toBeTruthy()
        })


        test('Returns MOCs in local data from not in current-legislators dataset', async () => {
          mockApi.options.maintain.type = 'deleteCurr'
          fileData.accounts = extractAccounts(fileData.users)
          const changes = await maintain.checkForChanges(fileData)
          expect(changes.members.remove).toHaveLength(1)
          expect(changes.count).toEqual(1)
          expect(changes.historical).toBeFalsy()
          expect(changes.file).toBeTruthy()
        })

        test('Returns Twitter accounts from legislators-social-media dataset not in local data', async () => {
          mockApi.options.maintain.type = 'addSoc'
          fileData.users = fileData.users.map((x, i) => {
            if (i > fileData.users.length - 3) x.accounts = []
            return x
          })
          fileData.accounts = extractAccounts(fileData.users)
          const changes = await maintain.checkForChanges(fileData)
          expect(changes.social.add).toHaveLength(2)
          expect(changes.social.add[0]).toHaveProperty('isNew')
          expect(changes.social.add[0]).toHaveProperty('index')
          expect(changes.social.add[0].bioguide).toEqual('3')
          expect(changes.count).toEqual(2)
          expect(changes.historical).toBeTruthy()
          expect(changes.file).toBeTruthy()
        })
      })
    })
  })

  describe('parseChanges', () => {
    let users
    let fileData
    let redisData

    beforeEach(() => {
      users = nativeClone(data.users)
      fileData = {}
      redisData = {}
      redisData.time = nativeClone(data.time)
    })

    describe('With post-build flag', () => {
      let changes

      beforeEach(() => {
        maintain.options.postBuild = true
        changes = mockChanges(true, true)
      })

      describe('No changes', () => {
        test('Doesn\'t return updated data or call Twitter API when new and old data are the same', async () => {
          const accounts = extractAccounts(users)
          Object.assign(fileData, { users, accounts })
          Object.assign(redisData, { ...fileData, isActive: true })
          changes.count = 0
          const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
          expect(parsedChanges).toEqual({})
          expect(mockFns.updateList).not.toBeCalled()
        })
      })

      describe('New users', () => {
        test('Returns updated data and calls Twitter API to add users to list', async () => {
          changes.storeUpdate = true
          changes.list.add = extractAccounts(users.slice(-4))
          changes.count = changes.list.add.length

          const accounts = extractAccounts(users)
          Object.assign(fileData, { users, accounts })
          Object.assign(redisData, { ...fileData, isActive: true, tweets: [{ id: '1' }] })
          const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)

          expect(parsedChanges).not.toHaveProperty('toWrite')
          expect(parsedChanges).toHaveProperty('toStore.users')
          expect(parsedChanges).toHaveProperty('toStore.accounts')
          expect(parsedChanges).toHaveProperty('toStore.tweets')
          expect(parsedChanges.toStore.tweets.length).toBeGreaterThan(0)
          expect(mockFns.updateList).toBeCalled()
          expect(mockFns.run).toBeCalled()
          expect(mockFns.searchStatuses).toBeCalled()
          expect(mockFns.run.mock.calls[0][1]).toHaveProperty('maintenance')
          expect(mockFns.updateList.mock.calls[0][0]).toEqual('create')
          expect(mockFns.updateList.mock.calls[0][1]).toHaveLength(4)
        })
      })

      describe('Users removed', () => {
        test('Returns updated data and calls Twitter API to remove users from list', async () => {
          changes.storeUpdate = true
          changes.list.remove = [{ id: '11' }]
          const accounts = extractAccounts(users)
          Object.assign(fileData, { users, accounts })
          Object.assign(redisData, { ...fileData, isActive: true, tweets: [{ id: '1' }] })

          const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
          expect(parsedChanges).not.toHaveProperty('toWrite')
          expect(mockFns.updateList).toBeCalled()
          expect(mockFns.updateList.mock.calls[0][0]).toEqual('destroy')
          expect(mockFns.updateList.mock.calls[0][1]).toHaveLength(1)
          expect(parsedChanges.toStore).toHaveProperty('users')
          expect(parsedChanges.toStore).toHaveProperty('accounts')
          expect(parsedChanges.toStore).not.toHaveProperty('tweets')
        })
      })
    })

    describe('Without post-build flag', () => {
      let changes
      beforeEach(() => {
        changes = mockChanges(false, true)
      })

      describe('No changes', () => {
        test('Returns nothing', async () => {
          const accounts = extractAccounts(users)
          Object.assign(fileData, { users, accounts })
          Object.assign(redisData, { users, accounts })
          changes.count = 0
          const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
          expect(mockFns.sortAndFilter).not.toBeCalled()
          expect(parsedChanges).toEqual({})
        })
      })

      describe('List changes', () => {
        describe('Deactivated accounts', () => {
          test('Adds accounts to store deactivated object and returns serializable changes', async () => {
            changes.file = false
            changes.historical = false
            maintain.options.hasBot = true
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            Object.assign(redisData, { users, accounts })
            redisData.deactivated = {}
            changes.list.deactivated = [{ id: '123' }]
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toStore.deactivated', { '123': '2017-02-02' })
            expect(mockFns.sortAndFilter).not.toBeCalled()
            expect(parsedChanges).toHaveProperty('toStore.changes')
          })
        })

        describe('Reactivated accounts', () => {
          test('Removes accounts from store deactivated object and returns serializable changes', async () => {
            changes.file = false
            changes.historical = false
            maintain.options.hasBot = true
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            Object.assign(redisData, { users, accounts })
            redisData.deactivated = { '123': '2017-03-03' }
            changes.list.reactivated = [{ id: '123' }]
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toStore.deactivated', {})
            expect(mockFns.sortAndFilter).not.toBeCalled()
            expect(parsedChanges).toHaveProperty('toStore.changes')
          })
        })


        describe('Deleted accounts', () => {
          test('Removes accounts from store deactivated object and returns updated data', async () => {
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            Object.assign(redisData, { users, accounts })
            redisData.deactivated = { '2': '2017-03-03' }
            changes.list.deleted = [{ id: '2', user_index: 2, name: 'Deleted Account' }]
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toStore.deactivated', {})
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(parsedChanges).toHaveProperty('toWrite.users-filtered')
            expect(parsedChanges).toHaveProperty('toWrite.historical-users')
            expect(parsedChanges).toHaveProperty('toWrite.historical-users-filtered')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(4)
            expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(2)
            expect(parsedChanges.toWrite.users[1].accounts.map(x => x.id)).not.toContain('2')
            expect(parsedChanges.toWrite['historical-users'][1].accounts[0]).toHaveProperty('deleted')
            expect(parsedChanges.toWrite['historical-users-filtered'][1].accounts[0]).toHaveProperty('deleted')
          })
        })

        describe('Renamed accounts', () => {
          test('Updates current and historical data with new account names and returns serializable changes', async () => {
            maintain.options.hasBot = true
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            Object.assign(redisData, { users, accounts })
            changes.list.renamed = [{ id: '2', screen_name: 'renamed', user_index: 2, account_index: 0 }]
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(4)
            expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(2)
            expect(Object.keys(parsedChanges.toWrite).every(key =>
              extractAccounts(parsedChanges.toWrite[key])
                            .map(x => x.screen_name)
                            .includes('renamed'),
            )).toBeTruthy()
            expect(parsedChanges.toWrite['historical-users'][1].accounts[0]).toHaveProperty('prev_names', ['HouseTwitterComm'])
            expect(parsedChanges).toHaveProperty('toStore.changes')
          })
        })
      })

      describe('External data changes', () => {
        describe('New accounts in legislators-social-media dataset', () => {
          test('Adds new MOC\'s account to current and historical data', async () => {
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            changes.members.add.push({
              id: {
                bioguide: '100000',
                govtrack: 100000,
              },
              name: 'House Member2',
              chamber: 'house',
              type: 'member',
              party: 'D',
              accounts: [],
            })
            changes.social.add.push({
              id: '18',
              bioguide: '100000',
              screen_name: 'HouseMember2',
              account_type: 'office',
              isNew: true,
              index: 0,
            })
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(4)
            expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(2)
            expect(Object.keys(parsedChanges.toWrite).every((key) => {
              const locData = parsedChanges.toWrite[key]
              const bios = locData.map(x => (x.id && x.id.bioguide) || null)
              const social = extractAccounts(locData).map(x => x.id)
              return bios.includes('100000') && social.includes('18')
            })).toBeTruthy()
          })

          test('Adds new MOC\'s account to user in current data only when historical dataset contains user + account', async () => {
            users = users.slice(0, -2)
            changes.members.add.push({
              id: {
                bioguide: '3',
                govtrack: 3,
              },
              name: 'Senate Member',
              type: 'member',
              chamber: 'senate',
              state: 'AK',
              party: 'R',
              accounts: [],
            })
            changes.social.add.push({
              id: '7',
              screen_name: 'SenMember',
              account_type: 'office',
              bioguide: '3',
              isNew: true,
              index: 0,
            })
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(2)
            expect(parsedChanges.toWrite['users-filtered'].some(user =>
              user.accounts.length
              && user.accounts.map(x => x.screen_name).includes('SenMember')
              && user.name === 'Senate Member'))
            expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(1)
          })

          test('Adds new account to existing user in current and historical leg datasets', async () => {
            changes.social.add.push({
              id: '17',
              screen_name: 'SenMember2',
              account_type: 'office',
              bioguide: '3',
              index: 7,
              isNew: false,
            })
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(4)
            expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(2)
            expect(Object.keys(parsedChanges.toWrite).every((key) => {
              const record = parsedChanges.toWrite[key].find(x =>
                x.id && x.id.bioguide === '3')
              return record && record.accounts.map(x => x.id).includes('17')
            })).toBeTruthy()
          })
        })

        describe('MOCs removed in legislators-current dataset', () => {
          test('Removes user from local current leg dataset', async () => {
            changes.members.remove.push({
              id: {
                bioguide: '4',
                govtrack: 4,
              },
              name: 'Senate No Twitter Member',
              type: 'member',
              chamber: 'senate',
              state: 'AK',
              party: 'R',
              accounts: [],
            })

            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)

            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(2)
            expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(1)
            expect(parsedChanges.toWrite.users.map(x => (x.id && x.id.bioguide) || null)).not.toContain('4')
          })
        })


        describe('New MOCs in legislators-current dataset', () => {
          test('Adds new MOC to historical and current datasets', async () => {
            changes.members.add.push({
              id: {
                bioguide: '100000',
                govtrack: 100000,
              },
              name: 'House Member2',
              chamber: 'house',
              type: 'member',
              party: 'D',
              accounts: [],
            })
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(4)
            expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(2)
            expect(['users', 'historical-users'].every(key =>
              parsedChanges.toWrite[key]
                .map(x => (x.id && x.id.bioguide) || null)
                .includes('100000'),
            )).toBeTruthy()
          })

          test('Adds new MOC to current dataset and updates record in historical dataset with new MOC props', async () => {
            users = users.slice(0, -1)
            changes.members.add.push({
              id: {
                bioguide: '4',
                govtrack: 4,
              },
              name: 'Senate No Twitter Member',
              type: 'member',
              chamber: 'house',
              state: 'AK',
              party: 'ABC',
              accounts: [],
            })
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            redisData.time.yesterdayDate = '2017-02-02'
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(4)
            expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(2)
            expect(parsedChanges.toWrite['historical-users'][5]).toHaveProperty('prev_props', [{
              until: '2017-02-02',
              party: 'R',
              chamber: 'senate',
            }])
          })

          test('Adds new MOC to current dataset only when MOC in historical dataset w/ props unchanged', async () => {
            users = users.slice(0, -1)
            changes.members.add.push({
              id: {
                bioguide: '4',
                govtrack: 4,
              },
              name: 'Senate No Twitter Member',
              type: 'member',
              chamber: 'senate',
              state: 'AK',
              party: 'R',
              accounts: [],
            })
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(2)
          })
        })

        describe('MOC prop (state/party/chamber) changes in legislators-current dataset', () => {
          test('Updates MOC in historical and current datasets with new props', async () => {
            changes.members.update.push({
              id: {
                bioguide: '4',
                govtrack: 4,
              },
              name: 'Senate No Twitter Member',
              type: 'member',
              chamber: 'senate',
              state: 'CA',
              party: 'ABC',
              accounts: [],
              index: 8,
            })
            const accounts = extractAccounts(users)
            Object.assign(fileData, { users, accounts })
            const parsedChanges = await maintain.parseChanges(changes, fileData, redisData)
            expect(parsedChanges).toHaveProperty('toWrite.users')
            expect(Object.keys(parsedChanges.toWrite)).toHaveLength(4)
            expect(parsedChanges.toWrite.users.some(x => x.party === 'ABC')).toBeTruthy()
            expect(parsedChanges.toWrite['historical-users'].some(x => x.party === 'ABC')).toBeTruthy()
          })
        })
      })
    })
  })

  describe('Run process', () => {
    let users
    beforeEach(() => {
      users = nativeClone(data.users)

      maintain.checkForChanges = jest.fn(() => ({ }))
      maintain.parseChanges = jest.fn(() => ({ }))
    })

    describe('Without existing redis store', () => {
      test('Initializes new redis store', async () => {
        await maintain.run()
        const redisData = unserializeObj(await redisClient.hgetallAsync('app'))
        expect(mockFns.initStore).toBeCalled()
        expect(redisData).toHaveProperty('initDate')
        expect(redisData).toHaveProperty('users')
      })
    })

    describe('With app flag', () => {
      test('Returns initialized redis data', async () => {
        maintain.options.app = true
        const runProcess = await maintain.run()
        const redisData = unserializeObj(await redisClient.hgetallAsync('app'))
        expect(mockFns.initStore).toBeCalled()
        expect(runProcess).toHaveProperty('initDate')
        expect(runProcess).toHaveProperty('users')
        expect(redisData).toHaveProperty('initDate')
        expect(redisData).toHaveProperty('users')
      })
    })

    describe('With formatOnly flag', () => {
      test('Formats files', async () => {
        maintain.options.formatOnly = true
        await maintain.run()
        expect(mockFns.formatFiles).toBeCalled()
        expect(mockFns.checkForChanges).not.toBeCalled()
        expect(mockFns.readFileSync).toHaveBeenCalledTimes(2)
        expect(fs.writeFileSync).toHaveBeenCalledTimes(4)
        expect(mockFns.sortAndFilter).toHaveBeenCalledTimes(2)
      })
    })

    describe('With initList flag', () => {
      test('Calls initList method to create new list', async () => {
        maintain.options.initList = true
        await maintain.run()
        expect(mockFns.initList).toBeCalled()
        expect(fs.appendFileSync).toBeCalled()
      })
    })

    describe('Without twitter list id', () => {
      test('Calls initList method to create new list', async () => {
        maintain.twitterClient.listId = null
        await maintain.run()
        expect(mockFns.initList).toBeCalled()
        expect(fs.appendFileSync).toBeCalled()
      })
    })

    describe('With redis store containing old user accounts format', () => {
      test('Handles backwards compatibility', async () => {
        users = await users.map((user) => {
          if (user.accounts.length) {
            user.accounts = user.accounts.reduce((p, c) => {
              const { account_type: acctType } = c
              const converted = Object.assign(_.omit(c, ['account_type']), { id_str: +c.id })
              if (!p[acctType]) {
                p[acctType] = []
              }
              p[acctType].push(converted)
              return p
            }, {})
          }
          return user
        })

        await redisClient.hmsetAsync('app', serializeObj({ users }))
        await maintain.run()
        expect(maintain.checkForChanges.mock.calls[0][1]).toHaveProperty('users')
        expect(maintain.checkForChanges.mock.calls[0][1].users[0]).toHaveProperty('accounts',
          [{ account_type: 'office', id: 1, screen_name: 'HouseCaucus' }])
        expect(maintain.checkForChanges.mock.calls[0][1]).toHaveProperty('accounts')
        expect(maintain.checkForChanges.mock.calls[0][1]).toHaveProperty('deactivated', {})
      })
    })

    describe('With selfUpdate flag', () => {
      beforeEach(() => {
        maintain.options.selfUpdate = true
      })

      describe('Without noCommit flag', () => {
        beforeEach(() => {
          mockApi.options.recursive = true
          maintain.githubClient = new GithubHelper(testConfig.GITHUB_TOKEN,
          { owner: testConfig.GITHUB_CONFIG.owner, repo: testConfig.SELF_REPO })
          mockFns.createBlob = jest.spyOn(maintain.githubClient.client.gitdata, 'createBlob')
          mockFns.createCommit = jest.spyOn(maintain.githubClient.client.gitdata, 'createCommit')
          mockFns.createTree = jest.spyOn(maintain.githubClient.client.gitdata, 'createTree')
          mockFns.updateReference = jest.spyOn(maintain.githubClient.client.gitdata, 'updateReference')
          mockFns.getTree = jest.spyOn(maintain.githubClient.client.gitdata, 'getTree')
          mockFns.getShaOfCommitRef = jest.spyOn(maintain.githubClient.client.repos, 'getShaOfCommitRef')
          mockFns.githubRun = jest.spyOn(maintain.githubClient, 'run')
        })

        test('checkForChanges called with two arguments and parseChanges called', async () => {
          const accounts = extractAccounts(users)
          await redisClient.hmsetAsync('app', serializeObj({ users, accounts }))
          await maintain.run()
          expect(maintain.checkForChanges.mock.calls[0]).toHaveLength(2)
          expect(maintain.checkForChanges).toBeCalled()
          expect(maintain.parseChanges).toBeCalled()
          expect(mockFns.githubRun).not.toBeCalled()
        })

        test('Commits new data to Github and updates store', async () => {
          const accounts = extractAccounts(users)
          await redisClient.hmsetAsync('app', serializeObj({ users, accounts }))
          users.push({
            id: {
              bioguide: '15',
              govtrack: 15,
            },
            name: 'Senate No Twitter Member 2',
            type: 'member',
            chamber: 'senate',
            state: 'CA',
            party: 'ABC',
            accounts: [],
          })
          maintain.options.isProd = true
          maintain.checkForChanges.mockImplementationOnce(() => {
            const changes = mockChanges(false, false)
            changes.members.add = [{
              id: {
                bioguide: '15',
                govtrack: 15,
              },
              name: 'Senate No Twitter Member 2',
              type: 'member',
              chamber: 'senate',
              state: 'CA',
              party: 'ABC',
              accounts: [],
            }]
            return changes
          })
          maintain.parseChanges
                  .mockImplementationOnce(() => {
                    const parsedChanges = {}
                    parsedChanges.toWrite = {}
                    parsedChanges.toWrite.users = users
                    parsedChanges.toWrite['users-filtered'] = users.filter(x => x.accounts.length)
                    parsedChanges.toWrite['historical-users'] = users
                    parsedChanges.toWrite['historical-users-filtered'] = users.filter(x => x.accounts.length)
                    parsedChanges.toStore = { deactivated: { '1': '2017-02-02' } }
                    return parsedChanges
                  })
          await maintain.run()
          expect(mockFns.githubRun).toBeCalled()
          expect(mockFns.githubRun.mock.calls[0][1]).toEqual({
            recursive: true,
            message: 'Add Senate No Twitter Member 2\n\nMembers added:\nSenate No Twitter Member 2',
          })
          expect(mockFns.createBlob).toHaveBeenCalledTimes(4)
          expect(mockFns.createCommit).toBeCalled()
          expect(mockFns.createCommit.mock.calls[0][0]).toHaveProperty('repo', 'test-self-repo')
          expect(mockFns.createCommit.mock.calls[0][0]).toHaveProperty('message', 'Add Senate No Twitter Member 2\n\nMembers added:\nSenate No Twitter Member 2')
          expect(mockFns.createTree.mock.calls[0][0].tree
                .filter(file => file.path.includes('user'))).toHaveLength(4)
          expect(mockFns.updateReference).toBeCalled()
          expect(mockFns.getTree).toBeCalled()
          expect(mockFns.getShaOfCommitRef).toBeCalled()
        })
      })

      describe('With noCommit flag', () => {
        beforeEach(() => {
          maintain.options.noCommit = true
        })

        test('Writes new data to files and then recursively updates store with new data', async () => {
          const accounts = extractAccounts(users)
          await redisClient.hmsetAsync('app', serializeObj({ users, accounts }))
          users.push({
            id: {
              bioguide: '15',
              govtrack: 15,
            },
            name: 'Senate No Twitter Member 2',
            type: 'member',
            chamber: 'senate',
            state: 'CA',
            party: 'ABC',
            accounts: [],
          })
          maintain.parseChanges
                  .mockImplementationOnce(() => {
                    const parsedChanges = {}
                    parsedChanges.toWrite = {}
                    parsedChanges.toWrite.users = users
                    parsedChanges.toWrite['users-filtered'] = users.filter(x => x.accounts.length)
                    return parsedChanges
                  })
                  .mockImplementationOnce(() => {
                    const parsedChanges = {}
                    parsedChanges.toStore = {}
                    parsedChanges.toStore.users = users
                    parsedChanges.toStore.accounts = extractAccounts(users)
                    return parsedChanges
                  })
          await maintain.run()
          expect(fs.writeFileSync).toHaveBeenCalledTimes(2)
          expect(fs.writeFileSync.mock.calls
                  .every(x => x[0].endsWith('users.json') || x[0].endsWith('users-filtered.json')))
                  .toBeTruthy()
          expect(mockFns.maintainRun).toHaveBeenCalledTimes(2)
          expect(maintain.checkForChanges).toHaveBeenCalledTimes(2)
          expect(maintain.checkForChanges.mock.calls[0]).toHaveLength(2)
          expect(maintain.checkForChanges.mock.calls[1]).toHaveLength(2)
          expect(mockFns.hmsetAsync).toHaveBeenCalledTimes(2)
          expect(mockFns.hmsetAsync.mock.calls[1][1]).toHaveProperty('users')
          expect(mockFns.hmsetAsync.mock.calls[1][1]).toHaveProperty('accounts')
        })
      })
    })
  })
})

/* eslint-enable quote-props */
