import _ from 'lodash'
import redis from 'redis-mock'
import bluebird from 'bluebird'
import MockApi from './helpers/api-mock'
import {
  testConfig,
} from './util/test-util'
import {
  unserializeObj,
  serializeObj,
  prettyPrint,
} from '../src/util'
import {
    appBuilder,
    App,
} from '../src/app'
import {
    configureMaintenance,
    Maintenance,
} from '../src/maintenance'
import { TwitterHelper } from '../src/twitter'
import GithubHelper from '../src/github'

bluebird.promisifyAll(redis)
jasmine.DEFAULT_TIMEOUT_INTERVAL = 6000

let redisClient
let mockApi

const resetMocks = () => {
  jest.resetModules()
  jest.resetAllMocks()
  MockApi.cleanMocks()
}

beforeAll(() => {
  resetMocks()
  mockApi = new MockApi('both')
  mockApi.init()
  redisClient = redis.createClient()
})

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
}))


const fs = require('fs')

jest.dontMock('../src/util')
const util = require('../src/util')

util.createTimeObj = jest.fn()

describe('App class', () => {
  const mockFns = {}
  beforeEach(async () => {
    // eslint-disable-next-line
    for (const key of Object.keys(mockFns)) {
      mockFns[key].mockRestore()
    }

    mockFns.maintRun = jest.spyOn(Maintenance.prototype, 'run')
    mockFns.initStore = jest.spyOn(Maintenance.prototype, 'initStore')
    mockFns.twitterRun = jest.spyOn(TwitterHelper.prototype, 'run')
    mockFns.twitterRequest = jest.spyOn(TwitterHelper.prototype, 'makeRequest')
    mockFns.getActiveUsers = jest.spyOn(TwitterHelper.prototype, 'getActiveUsers')
    mockFns.getStatuses = jest.spyOn(TwitterHelper.prototype, 'getStatuses')
    mockFns.getUserStatuses = jest.spyOn(TwitterHelper.prototype, 'getUserStatuses')
    mockFns.githubRun = jest.spyOn(GithubHelper.prototype, 'run')
    mockFns.createBlobs = jest.spyOn(GithubHelper.prototype, 'createBlobs')
    mockFns.createCommit = jest.spyOn(GithubHelper.prototype, 'createCommit')
    mockFns.appInit = jest.spyOn(App.prototype, 'init')
    mockFns.hgetallAsync = jest.spyOn(redisClient, 'hgetallAsync')
    mockFns.hmsetAsync = jest.spyOn(redisClient, 'hmsetAsync')
    mockFns.existsAsync = jest.spyOn(redisClient, 'existsAsync')
    mockFns.readFileSync = jest.spyOn(fs, 'readFileSync')
    await redisClient.flushdbAsync()
  })

  describe('Instantiation', () => {
    test('Instantiates correctly', () => {
      const app = new App(testConfig, redisClient)
      const app2 = appBuilder(testConfig, redisClient)
      expect(app).toHaveProperty('config', expect.any(Object))
      expect(app2).toHaveProperty('config', expect.any(Object))
    })
  })

  describe('Initalization', () => {
    test('Initializes correctly', async () => {
      const appData = (await new App(testConfig, redisClient).init())
      const redisData = unserializeObj(await redisClient.hgetallAsync('app'))

      expect(appData).toEqual(expect.objectContaining({
        accounts: expect.any(Array),
        deactivated: {},
        initDate: expect.any(String),
        lastRun: null,
        lastUpdate: null,
        sinceId: null,
        collectSince: null,
        tweets: expect.any(Array),
        users: expect.any(Array),
      }))
      expect(redisData).toEqual(expect.objectContaining({
        accounts: expect.any(Array),
        deactivated: {},
        initDate: expect.any(String),
        lastRun: null,
        lastUpdate: null,
        sinceId: null,
        collectSince: null,
        tweets: expect.any(Array),
        users: expect.any(Array),
      }))
      expect(mockFns.hmsetAsync).toBeCalled()
      expect(mockFns.readFileSync).toBeCalled()
      expect(mockFns.maintRun).toBeCalled()
      expect(mockFns.initStore).toBeCalled()
      expect(appData.users).toHaveLength(9)
      expect(redisData.users).toHaveLength(9)
      expect(appData.accounts).toHaveLength(8)
      expect(redisData.accounts).toHaveLength(8)
    })
  })


  describe('Run process', () => {
    let app

    beforeEach(() => {
      mockApi.options = { run: true }
      app = appBuilder(testConfig, redisClient)
    })

    describe('No redis store exists', () => {
      beforeEach(() => {
        util.createTimeObj.mockReturnValueOnce({
          now: '2017-02-02T14:00:00-04:00',
          todayDate: '2017-02-02',
        })
      })

      test('Initialize redis store if no redis store exists', async () => {
        await app.run()
        expect(mockFns.hmsetAsync).toHaveBeenCalledTimes(2)
        expect(mockFns.readFileSync).toBeCalled()
        expect(mockFns.maintRun).toBeCalled()
        expect(mockFns.initStore).toBeCalled()
      })

      test('Checks tweets and writes new data and time to store', async () => {
        await app.run()
        const redisData = unserializeObj(await redisClient.hgetallAsync('app'))
        expect(mockFns.hmsetAsync.mock.calls[1][1]).toHaveProperty('tweets')
        expect(mockFns.hmsetAsync.mock.calls[1][1]).toHaveProperty('sinceId')
        expect(mockFns.hmsetAsync.mock.calls[1][1]).toHaveProperty('lastRun')
        expect(mockFns.twitterRun).toBeCalled()
        expect(mockFns.twitterRequest).toHaveBeenCalledTimes(3)
        expect(redisData.tweets).toHaveLength(450)
        expect(redisData.lastRun).toEqual('2017-02-02T14:00:00-04:00')
        expect(redisData.sinceId).toEqual('0')
      })
    })

    describe('Normal run process', () => {
      beforeEach(async () => {
        util.createTimeObj.mockReturnValueOnce({
          now: '2017-02-02T14:00:00-04:00',
          todayDate: '2017-02-02',
        })
        const tweets = Array.from(Array(5)).map((x, i) => ({ id: i }))
        await app.init()
        await redisClient.hmsetAsync('app', serializeObj({ tweets, sinceId: '300' }))
      })

      test('Checks tweets', async () => {
        await app.run()
        expect(mockFns.twitterRun).toBeCalled()
        expect(mockFns.twitterRun.mock.calls[0][0]).toHaveProperty('sinceId', '300')
        expect(mockFns.twitterRequest).toHaveBeenCalledTimes(2)
      })

      test('Appends new tweets to existing tweets and writes new data and time to store', async () => {
        await app.run()
        const redisData = unserializeObj(await redisClient.hgetallAsync('app'))
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('tweets')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('sinceId')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('lastRun')
        expect(mockFns.twitterRun).toBeCalled()
        expect(mockFns.twitterRequest).toHaveBeenCalledTimes(2)
        expect(redisData.tweets).toHaveLength(305)
        expect(redisData.lastRun).toEqual('2017-02-02T14:00:00-04:00')
        expect(redisData.sinceId).toEqual('0')
      })

      test('Only writes time to store when no new tweets', async () => {
        mockApi.options.noTweets = true
        await app.run()
        const redisData = unserializeObj(await redisClient.hgetallAsync('app'))
        expect(mockFns.hmsetAsync.mock.calls[2][1]).not.toHaveProperty('tweets')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).not.toHaveProperty('sinceId')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('lastRun')
        expect(mockFns.twitterRun).toBeCalled()
        expect(mockFns.twitterRequest).toHaveBeenCalledTimes(1)
        expect(redisData.tweets).toHaveLength(5)
        expect(redisData.lastRun).toEqual('2017-02-02T14:00:00-04:00')
        expect(redisData.sinceId).toEqual('300')
      })
    })

    describe('Run process after midnight', () => {
      beforeEach(async () => {
        util.createTimeObj.mockReturnValueOnce({
          now: '2017-02-02T00:00:00-04:00',
          todayDate: '2017-02-02',
          yesterdayDate: '2017-02-01',
          yesterdayStart: '2017-02-01T00:00:00-04:00',
        })
        const tweets = Array.from(Array(5)).map((x, i) => ({ id: i }))
        await app.init()
        await redisClient.hmsetAsync('app',
          serializeObj({ tweets, sinceId: '300', lastRun: '2017-02-01T23:00:00-04:00' }))
      })

      test('Checks tweets', async () => {
        mockApi.options.lastDay = true
        await app.run()
        expect(mockFns.twitterRun).toBeCalled()
        expect(mockFns.twitterRun.mock.calls[0][0]).toHaveProperty('sinceId', '300')
        expect(mockFns.twitterRequest).toHaveBeenCalledTimes(2)
      })

      test('Commits yesterday\'s tweet data and writes today\'s tweets to store', async () => {
        mockApi.options.lastDay = true
        mockApi.options.app = true
        await app.run()
        const redisData = unserializeObj(await redisClient.hgetallAsync('app'))
        expect(mockFns.githubRun).toBeCalled()
        expect(mockFns.createBlobs).toBeCalled()
        expect(mockFns.createCommit).toBeCalled()
        expect(mockFns.createBlobs.mock.calls[0][0].tweets).toHaveLength(10)
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('tweets')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('sinceId')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('collectSince')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('lastRun')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('lastUpdate')
        expect(redisData.tweets).toHaveLength(5)
        expect(redisData.lastRun).toEqual('2017-02-02T00:00:00-04:00')
        expect(redisData.lastUpdate).toEqual('2017-02-02')
      })
    })

    describe('Run process after midnight with collectReplies flag', () => {
      beforeEach(async () => {
        mockApi.options.lastDay = true
        mockApi.options.app = true
        mockApi.options.collectReplies = true
        util.createTimeObj.mockReturnValueOnce({
          now: '2017-02-02T00:00:00-04:00',
          todayDate: '2017-02-02',
          yesterdayDate: '2017-02-01',
          yesterdayStart: '2017-02-01T00:00:00-04:00',
        })
        const tweets = Array.from(Array(5)).map((x, i) => ({ id: i }))
        app.options.collectReplies = true
        await app.init()
        await redisClient.hmsetAsync('app',
          serializeObj({ tweets, sinceId: '300', lastRun: '2017-02-01T23:00:00-04:00' }))
      })

      test('Checks tweets, active users and replies', async () => {
        mockApi.options.lastDay = true
        await app.run()
        expect(mockFns.twitterRun).toHaveBeenCalledTimes(2)
        expect(mockFns.getActiveUsers).toBeCalled()
        expect(mockFns.twitterRun.mock.calls[0][0]).toHaveProperty('sinceId', '300')
        expect(mockFns.twitterRun.mock.calls[1][0]).toHaveProperty('sinceId', '300')
        expect(mockFns.twitterRun.mock.calls[0][0]).toHaveProperty('ids.toCheck')
        expect(mockFns.twitterRun.mock.calls[0][0]).toHaveProperty('ids.all')
        expect(mockFns.twitterRun.mock.calls[0][0].ids.toCheck).toHaveLength(5)
        expect(mockFns.twitterRun.mock.calls[0][0].ids.all).toHaveLength(8)
        expect(mockFns.twitterRun.mock.calls[1][1]).toHaveProperty('collectReplies', true)
        expect(mockFns.twitterRequest).toHaveBeenCalledTimes(7)
        expect(mockFns.getUserStatuses).toHaveBeenCalledTimes(5)
        expect(mockFns.getStatuses).toHaveBeenCalledTimes(1)
      })

      test('Commits yesterday\'s tweet data and writes today\'s tweets to store', async () => {
        await app.run()
        const redisData = unserializeObj(await redisClient.hgetallAsync('app'))
        expect(mockFns.githubRun).toBeCalled()
        expect(mockFns.createBlobs).toBeCalled()
        expect(mockFns.createCommit).toBeCalled()
        expect(mockFns.createBlobs.mock.calls[0][0].tweets).toHaveLength(35)
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('tweets')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('sinceId')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('lastRun')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('collectSince')
        expect(mockFns.hmsetAsync.mock.calls[2][1]).toHaveProperty('lastUpdate')
        expect(redisData.tweets).toHaveLength(5)
        expect(redisData.lastRun).toEqual('2017-02-02T00:00:00-04:00')
        expect(redisData.lastUpdate).toEqual('2017-02-02')
      })
    })
  })
})
