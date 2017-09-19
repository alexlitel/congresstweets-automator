import fs from 'fs'
import path from 'path'
import _ from 'lodash'
import MockApi from './helpers/api-mock'
import {
    Tweet,
    TwitterHelper,
} from '../src/twitter'
import {
    nativeClone,
} from '../src/util'
import {
    modifyDate,
    testConfig,
} from './util/test-util'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 6000

const data = {}
let mockApi

const loadData = () => {
  data.time = {
    todayDate: '2017-02-02',
  }
}

beforeAll(() => {
  loadData()
  mockApi = new MockApi('twitter')
  mockApi.init('twitter')
})

afterAll(() => {
  jest.resetModules()
})

describe('Tweet data', () => {
  test('All users are labeled properly and have valid twitter info', async () => {
    const users = await JSON.parse(fs.readFileSync(path.join(__dirname, '/../data/users-filtered.json')))
    const usersLength = users.length
    const filteredWithNames = users.filter(user => !!user.name).length
    const usersWithValidInfo = users.filter(user => user.accounts
                .every(account =>
                    ['id', 'screen_name', 'account_type'].every(key => key in account),
                ),
            )
            .length
    expect(filteredWithNames).toEqual(usersLength)
    expect(usersWithValidInfo).toBe(usersLength)
  })
})

describe('Tweet class', () => {
  let tweetData

  beforeAll(() => {
    tweetData = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/mock-data.json'))).twitter.tweets
  })

  test('Normal tweet instantiates correctly', () => {
    expect(new Tweet(tweetData[0])).toEqual({
      id: '0',
      screen_name: 'TwitterUser',
      user_id: '123',
      time: '2017-06-13T16:43:24-04:00',
      link: 'https://www.twitter.com/TwitterUser/statuses/0',
      text: 'Normal tweet. No link. No anything else.',
      source: 'Twitter Web Client',
    })
  })

  test('Tweet with link instantiates correctly', () => {
    expect(new Tweet(tweetData[1])).toEqual({
      id: '1',
      screen_name: 'TwitterUser',
      user_id: '123',
      time: '2017-06-13T16:44:06-04:00',
      link: 'https://www.twitter.com/TwitterUser/statuses/1',
      text: 'Tweet with link.\nhttps://www.google.com/',
      source: 'TweetDeck',
    })
  })

  test('Quoted tweet instantiates correctly', () => {
    expect(new Tweet(tweetData[2])).toEqual({
      id: '2',
      screen_name: 'TwitterUser',
      user_id: '123',
      time: '2017-06-13T16:42:43-04:00',
      link: 'https://www.twitter.com/TwitterUser/statuses/2',
      text: 'Tweet with quoted tweet https://twitter.com/tweetuser/status/123 QT @TwitterUser @FooUser Tweet being quoted http://pbs.twimg.com/media/foo.jpg',
      source: 'Twitter Web Client',
    })
  })

  test('Retweet instantiates correctly', () => {
    expect(new Tweet(tweetData[3])).toEqual({
      id: '3',
      screen_name: 'TwitterUser',
      user_id: '123',
      time: '2017-06-13T16:38:57-04:00',
      link: 'https://www.twitter.com/TwitterUser/statuses/123',
      text: 'RT @TwitterUser Retweeted tweet http://hubs.ly/H07NNZ70',
      source: 'Twitter Web Client',
    })
  })

  test('Retweet with quoted tweet instantiates correctly', () => {
    expect(new Tweet(tweetData[4])).toEqual({
      id: '4',
      screen_name: 'TwitterUser',
      user_id: '123',
      time: '2017-06-13T16:42:31-04:00',
      link: 'https://www.twitter.com/TwitterUser/statuses/874728532336934914',
      text: 'RT @TwitterUser Retweet with quoted tweet https://twitter.com/FooUser/status/874720122476384259 QT @TwitterUser Quoted tweet https://twitter.com/twitterUser/status/874696002325929984',
      source: 'Twitter Web Client',
    })
  })

  test('Tweet with photo instantiates correctly', () => {
    expect(new Tweet(tweetData[5])).toEqual({
      id: '5',
      screen_name: 'TwitterUser',
      user_id: '123',
      time: '2017-06-13T16:43:37-04:00',
      link: 'https://www.twitter.com/TwitterUser/statuses/5',
      text: 'Tweet with photo http://pbs.twimg.com/media/DCOpX7SWAAE0pWc.png',
      source: 'Twitter Web Client',
    })
  })

  test('Tweet with video instantiates correctly', () => {
    expect(new Tweet(tweetData[6])).toEqual({
      id: '6',
      screen_name: 'TwitterUser',
      user_id: '123',
      time: '2017-06-13T15:14:09-04:00',
      link: 'https://www.twitter.com/TwitterUser/statuses/6',
      text: 'Tweet with video http://pbs.twimg.com/amplify_video_thumb/874658940944035840/img/qAQK2rt7voeKdDo-.jpg https://video.twimg.com/amplify_video/874658940944035840/vid/640x360/mKKd-Mw7Oc7_Ueby.mp4',
      source: 'Media Studio',
    })
  })
})

describe('TwitterHelper class methods', () => {
  let twitterClient
  let accounts
  const mockFns = {}
  beforeAll(() => {
    twitterClient = new TwitterHelper(testConfig.TWITTER_CONFIG, testConfig.LIST_ID)
    accounts = [{
      id: 123123,
      id_str: '123123',
      screen_name: 'FakeAccount1',
    }, {
      id: 456456,
      id_str: '456456',
      screen_name: 'FakeAccount2',
    }, {
      id: 789789,
      id_str: '789789',
      screen_name: 'FakeAccount3',
    }]
    data.ids = accounts.map(account => account.id_str)
  })

  beforeEach(() => {
    jest.resetAllMocks()

    // eslint-disable-next-line
    for (const key of Object.keys(mockFns)) {
      mockFns[key].mockRestore()
    }
    mockFns.get = jest.spyOn(twitterClient.client, 'get')
    mockFns.post = jest.spyOn(twitterClient.client, 'post')
  })

  afterAll(() => {
    MockApi.cleanMocks()
  })

  describe('Constructor method', () => {
    test('Throws error without required config props', () => {
      expect(() => new TwitterHelper(null)).toThrow('Missing required props for Twit client')
    })
  })


  describe('List methods', () => {
    let errClient
    const idErr = new Error('List id is missing')

    beforeAll(() => {
      errClient = new TwitterHelper(testConfig.TWITTER_CONFIG)
    })

    describe('getList', () => {
      test('Retrieving list data', async () => {
        await expect(twitterClient.getList()).resolves.toEqual(expect.objectContaining({
          following: true,
        }))
        expect(mockFns.get).toBeCalledWith('lists/show', { list_id: '123456789' })
      })

      test('Throws err without list id', async () => {
        await expect(errClient.getList()).rejects.toEqual(idErr)
      })
    })

    describe('getStatuses', () => {
      test('Retrieve list statuses', async () => {
        const statuses = await twitterClient.getStatuses()
        expect(mockFns.get).toBeCalledWith('lists/statuses', { list_id: '123456789', count: 200, tweet_mode: 'extended' })
        expect(statuses).toHaveLength(200)
        expect(statuses[0].id_str).toEqual('0')
      })

      test('Retrieve list statuses with max id', async () => {
        const statuses = await twitterClient.getStatuses(null, 200)
        expect(mockFns.get).toBeCalledWith('lists/statuses', { list_id: '123456789', count: 200, tweet_mode: 'extended', max_id: 200 })
        expect(statuses).toHaveLength(200)
      })

      test('Retrieve list statuses with since id', async () => {
        await expect(twitterClient.getStatuses(500)).resolves.toHaveLength(200)
        expect(mockFns.get).toBeCalledWith('lists/statuses', { list_id: '123456789', count: 200, tweet_mode: 'extended', since_id: 500 })
      })

      test('Retrieve list statuses with max and since ids', async () => {
        const statuses = await twitterClient.getStatuses(0, 202)
        expect(statuses).toHaveLength(200)
        expect(mockFns.get).toBeCalledWith('lists/statuses', { list_id: '123456789', count: 200, tweet_mode: 'extended', since_id: 0, max_id: 202 })
      })

      test('Throws err without list id', async () => {
        await expect(errClient.getStatuses()).rejects.toEqual(idErr)
      })
    })

    describe('getListMembers', () => {
      test('Retrieving users from list', async () => {
        await expect(twitterClient.getListMembers()).resolves.toHaveLength(100)
        expect(mockFns.get).toBeCalledWith('lists/members', { list_id: '123456789', count: 5000 })
      })

      test('Retrieving users from list w/o statuses when noStatuses argument is true', async () => {
        const listData = await twitterClient.getListMembers(true)
        expect(listData).toHaveLength(100)
        expect(listData[0]).not.toHaveProperty('statuses')
        expect(mockFns.get).toBeCalledWith('lists/members', { list_id: '123456789', count: 5000, skip_status: true })
      })

      test('Throws err without list id', async () => {
        await expect(errClient.getList()).rejects.toEqual(idErr)
      })
    })

    describe('getActiveUsers', () => {
      test('Retrieving active users from list', async () => {
        const time = Object.assign({}, data.time)
        time.yesterdayDate = '2017-02-01'
        time.yesterdayStart = modifyDate(data.time.todayDate, -1, 'd').startOf('day').format()
        mockApi.options.lastDay = true
        await expect(twitterClient.getActiveUsers(time)).resolves.toHaveLength(50)
        expect(mockFns.get).toBeCalledWith('lists/members', { list_id: '123456789', count: 5000 })
      })

      test('Throws err without list id', async () => {
        await expect(errClient.getActiveUsers({
          yesterdayDate: true,
          yesterdayStart: true,
        })).rejects.toEqual(idErr)
      })

      test('Throws err without valid time', async () => {
        await expect(twitterClient.getActiveUsers()).rejects.toEqual(new Error('Invalid time object'))
      })
    })


    describe('createList', () => {
      test('Creating new list without arguments', async () => {
        await expect(twitterClient.createList()).resolves.toEqual(expect.objectContaining({
          name: 'congress',
        }))
        expect(mockFns.post).toBeCalledWith('lists/create', { name: 'congress', mode: 'private' })
      })

      test('Creating new list with argument', async () => {
        await expect(twitterClient.createList('foo')).resolves.toEqual(expect.objectContaining({
          name: 'foo',
        }))
        expect(mockFns.post).toBeCalledWith('lists/create', { name: 'foo', mode: 'private' })
      })
    })

    describe('updateList', () => {
      afterAll(() => mockApi.resetOptions())

      test('Adding users to list', async () => {
        const listBeforeAdd = (await twitterClient.getList()).member_count
        await twitterClient.updateList('create', accounts.map(account => account.id_str))
        const listAfterAdd = (await twitterClient.getList()).member_count
        expect(listAfterAdd - listBeforeAdd).toEqual(accounts.length)
        expect(mockFns.post).toBeCalledWith('lists/members/create_all', { list_id: '123456789', user_id: ['123123', '456456', '789789'] })
      })


      test('Removing users from list', async () => {
        const listBeforeRemove = (await twitterClient.getList()).member_count
        await twitterClient.updateList('destroy', accounts.map(account => account.id_str))
        const listAfterRemove = (await twitterClient.getList()).member_count
        expect(listBeforeRemove - listAfterRemove).toEqual(accounts.length)
        expect(mockFns.post).toBeCalledWith('lists/members/destroy_all', { list_id: '123456789', user_id: ['123123', '456456', '789789'] })
      })

      test('Updates when 100+ ids passed as argument', async () => {
        const listBeforeAdd = (await twitterClient.getList()).member_count
        await twitterClient.updateList('create', Array.from(Array(102).keys()))
        const listAfterAdd = (await twitterClient.getList()).member_count
        expect(mockFns.post).toHaveBeenCalledTimes(2)
        expect(listAfterAdd - listBeforeAdd).toEqual(102)
      })

      test('Throws err without list id', async () => {
        await expect(errClient.updateList()).rejects.toEqual(idErr)
      })

      test('Throws err without action', async () => {
        await expect(twitterClient.updateList(null)).rejects.toEqual(new Error('Valid list action is required'))
      })

      test('Throws err without ids', async () => {
        await expect(twitterClient.updateList('create', null)).rejects.toEqual(new Error('Need user ids to perform list action'))
      })
    })
  })

  describe('User methods', () => {
    let idErr

    beforeAll(() => {
      idErr = new Error('User id is missing')
    })

    describe('getUser', () => {
      test('Retrieving user data', async () => {
        await expect(twitterClient.getUser('12345')).resolves.toEqual(expect.objectContaining({
          id_str: '12345',
        }))
        expect(mockFns.get).toBeCalledWith('users/show', { user_id: '12345' })
      })

      test('Coerces user_id to screen_name when screen name is argument', async () => {
        await expect(twitterClient.getUser('foo')).resolves.toEqual(expect.objectContaining({
          screen_name: 'foo',
        }))
        expect(mockFns.get).toBeCalledWith('users/show', { screen_name: 'foo' })
      })

      test('Throws err without list id', async () => {
        await expect(twitterClient.getUser()).rejects.toEqual(idErr)
      })
    })

    describe('isAccountValid', () => {
      test('Returns true for id', async () => {
        await expect(twitterClient.isAccountValid('1')).resolves.toEqual(true)
        await expect(twitterClient.isAccountValid('foo')).resolves.toEqual(true)
        expect(mockFns.get.mock.calls[0]).toEqual(['users/show', { user_id: '1' }])
        expect(mockFns.get.mock.calls[1]).toEqual(['users/show', { screen_name: 'foo' }])
      })

      test('Returns false for invalid id', async () => {
        await expect(twitterClient.isAccountValid('100')).resolves.toEqual(false)
        await expect(twitterClient.isAccountValid('reject')).resolves.toEqual(false)
      })

      test('Throws err without list id', async () => {
        await expect(twitterClient.isAccountValid()).rejects.toEqual(idErr)
      })
    })

    describe('getUserStatuses', () => {
      test('Retrieving user statuses', async () => {
        await expect(twitterClient.getUserStatuses('foo')).resolves.toHaveLength(50)
        expect(mockFns.get).toBeCalledWith('statuses/user_timeline', { user_id: 'foo', count: 200, tweet_mode: 'extended' })
      })

      test('Throws err without list id', async () => {
        await expect(twitterClient.getUserStatuses()).rejects.toEqual(idErr)
      })
    })
  })


  describe('Run method', () => {
    beforeEach(() => {
      mockApi.resetOptions()
    })

    test('Regular run process', async () => {
      mockApi.options.run = true
      const runProcess = await twitterClient.run(data)
      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')

      expect(runProcess.tweets).toHaveLength(450)
      expect(runProcess.sinceId).toEqual('0')
      expect(runProcess.success).toEqual(true)
      expect(mockFns.get).toHaveBeenCalledTimes(3)
      expect(mockFns.get.mock.calls[0]).toEqual(['lists/statuses', { list_id: '123456789', count: 200, tweet_mode: 'extended' }])
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('max_id')
      expect(mockFns.get.mock.calls[2][1]).toHaveProperty('max_id')
    })

    test('Regular run process with no tweets retruned', async () => {
      mockApi.options = {
        run: true,
        lastDay: true,
        noTweets: true
      }

      const locData = nativeClone(data)

      const runProcess = await twitterClient.run(locData)
      expect(runProcess.tweets).toHaveLength(0)
      expect(runProcess.sinceId).toEqual(undefined)
      expect(runProcess.success).toEqual(true)
      expect(mockFns.get).toHaveBeenCalledTimes(1)
    })

    test('Regular run process after midnight', async () => {
      mockApi.options = {
        run: true,
        lastDay: true,
      }

      const locData = nativeClone(data)
      locData.time.yesterdayStart = modifyDate(locData.time.todayDate, -1, 'd').startOf('day').format()
      locData.time.yesterdayDate = '2017-02-01'
      locData.lastRun = modifyDate(locData.time.todayDate, -1, 'h')
      locData.sinceId = 650

      const runProcess = await twitterClient.run(locData)
      runProcess.tweets = await _.mapValues(runProcess.tweets, v => _.uniqBy(v, 'id'))

      expect(runProcess.tweets.today).toHaveLength(450)
      expect(runProcess.tweets.yesterday).toHaveLength(200)
      expect(runProcess.sinceId).toEqual('0')
      expect(runProcess.success).toEqual(true)
      expect(mockFns.get).toHaveBeenCalledTimes(4)
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('max_id')
      expect(mockFns.get.mock.calls[2][1]).toHaveProperty('max_id')
    })

    test('Regular run process after midnight with collectReplies enabled', async () => {
      mockApi.options = {
        run: true,
        collectReplies: true,
      }

      const locData = nativeClone(data)

      locData.time.yesterdayStart = modifyDate(locData.time.todayDate, -1, 'd').startOf('day').format()

      locData.time.yesterdayDate = '2017-02-01'
      locData.lastRun = modifyDate(locData.time.todayDate, -1, 'h')
      locData.collectSince = '650'

      locData.ids = {}
      locData.ids.all = accounts.map(x => x.id_str)
      locData.ids.toCheck = [...data.ids]
      const runProcess = await twitterClient.run(locData, {
        collectReplies: true,
      })
      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')

      expect(runProcess.tweets).toHaveLength(12)
      expect(runProcess.sinceId).toBeTruthy()
      expect(mockFns.get).toHaveBeenCalledTimes(3)

      expect(mockFns.get.mock.calls[0][1]).toHaveProperty('since_id')
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('since_id')
      expect(mockFns.get.mock.calls[2][1]).toHaveProperty('since_id')
    })

    test('Regular run process after midnight with collectReplies enabled and more than 1 timeline request per user', async () => {
      mockApi.options = {
        run: true,
        collectReplies: true,
        multiGet: true,
      }

      const locData = nativeClone(data)

      locData.time.yesterdayStart = modifyDate(locData.time.todayDate, -1, 'd').startOf('day').format()

      locData.time.yesterdayDate = '2017-02-01'
      locData.lastRun = modifyDate(locData.time.todayDate, -1, 'h')
      locData.collectSince = '650'

      locData.ids = {}
      locData.ids.all = accounts.map(x => x.id_str)
      locData.ids.toCheck = [...data.ids]
      const runProcess = await twitterClient.run(locData, {
        collectReplies: true,
      })
      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')

      expect(runProcess.tweets).toHaveLength(219)
      expect(runProcess.sinceId).toBeTruthy()
      expect(mockFns.get).toHaveBeenCalledTimes(6)
      expect(mockFns.get.mock.calls[0][1]).toHaveProperty('since_id')
      expect(mockFns.get.mock.calls[0][1]).toHaveProperty('include_rts', false)
      expect(mockFns.get.mock.calls[0][1]).not.toHaveProperty('max_id')
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('max_id')
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('include_rts', false)
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('since_id')
      expect(mockFns.get.mock.calls[2][1]).toHaveProperty('since_id')
      expect(mockFns.get.mock.calls[2][1]).toHaveProperty('include_rts', false)
    })

    test('New user run process', async () => {
      mockApi.options = {
        run: true,
        maintenance: true,
      }

      const locData = nativeClone(data)
      locData.lastRun = modifyDate(locData.time.todayDate, +3, 'h')
      locData.collectSince = '650'
      locData.ids = {}
      locData.ids.all = accounts.map(x => x.id_str)
      locData.ids.toCheck = [...data.ids]

      const runProcess = await twitterClient.run(locData, {
        maintenance: true,
      })
      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')

      expect(runProcess.tweets).toHaveLength(12)
      expect(mockFns.get).toHaveBeenCalledTimes(3)
      expect(mockFns.get.mock.calls[0][1]).toHaveProperty('user_id')
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('user_id')
      expect(mockFns.get.mock.calls[2][1]).toHaveProperty('user_id')
    })

    test('New user run process with more than 1 timeline request per user', async () => {
      mockApi.options = {
        run: true,
        maintenance: true,
        multiGet: true,
      }

      const locData = nativeClone(data)
      locData.lastRun = modifyDate(locData.time.todayDate, +3, 'h')
      locData.collectSince = '650'
      locData.ids = {}
      locData.ids.all = accounts.map(x => x.id_str)
      locData.ids.toCheck = [...data.ids]

      const runProcess = await twitterClient.run(locData, {
        maintenance: true,
      })
      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')

      expect(runProcess.tweets).toHaveLength(219)
      expect(mockFns.get).toHaveBeenCalledTimes(6)
      expect(mockFns.get.mock.calls[0][1]).toHaveProperty('user_id')
      expect(mockFns.get.mock.calls[0][1]).not.toHaveProperty('max_id')
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('user_id')
      expect(mockFns.get.mock.calls[1][1]).toHaveProperty('max_id')
      expect(mockFns.get.mock.calls[2][1]).toHaveProperty('user_id')
    })
  })
})
