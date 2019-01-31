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
  extractAccounts,
  buildQueries,
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
  data.lastRun = modifyDate(data.time.todayDate, -1, 'hour')
  data.accounts = extractAccounts(JSON.parse(fs.readFileSync(path.join(__dirname, '/data/users.json'))))
}

beforeAll(() => {
  loadData()
  mockApi = new MockApi()
  mockApi.init()
})

afterAll(() => {
  jest.resetModules()
})

describe('Twitter user data', () => {
  test('All users are labeled properly and have valid twitter info', () => {
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, '/../data/users-filtered.json')))
    const usersLength = users.length
    const filteredWithNames = users.filter(user => !!user.name).length
    const usersWithValidInfo = users.filter(user => user.accounts
      .every(account =>
        ['id', 'screen_name', 'account_type'].every(key => key in account)))
      .length
    expect(filteredWithNames).toEqual(usersLength)
    expect(usersWithValidInfo).toBe(usersLength)
  })
})


describe('Tweet class methods', () => {
  let tweetData

  beforeEach(() => {
    tweetData = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/mock-data.json'))).twitter.tweets
  })

  describe('getLink', () => {
    test('Returns correct link for normal tweet', () => {
      const fakeTweet = { user: { screen_name: 'NormalUser' }, id_str: '123' }
      expect(Tweet.getLink(fakeTweet)).toBe('https://www.twitter.com/NormalUser/statuses/123')
    })

    test('Returns correct link for retweet', () => {
      const fakeTweet = { retweeted_status: { user: { screen_name: 'RetweetUser' }, id_str: '123' } }
      expect(Tweet.getLink(fakeTweet, true)).toBe('https://www.twitter.com/RetweetUser/statuses/123')
    })
  })

  describe('replaceUrls', () => {
    test('Replaces non-media t.co link with expanded url', async () => {
      await expect(Tweet.replaceUrls(tweetData[1])).resolves.toBe('Tweet with link. https://www.google.com/')
    })

    test('Replaces non-media t.co link of another shortened url with actual url', async () => {
      await expect(Tweet.replaceUrls(tweetData[7])).resolves.toBe('Tweet with shortened link. http://www.testurl.com/actualpage')
    })

    test('Replaces image t.co link with media url', async () => {
      await expect(Tweet.replaceUrls(tweetData[5])).resolves.toBe('Tweet with photo http://pbs.twimg.com/media/DCOpX7SWAAE0pWc.png')
    })

    test('Replaces video t.co link with media and video still urls', async () => {
      await expect(Tweet.replaceUrls(tweetData[6])).resolves.toBe('Tweet with video http://pbs.twimg.com/amplify_video_thumb/874658940944035840/img/qAQK2rt7voeKdDo-.jpg https://video.twimg.com/amplify_video/874658940944035840/vid/320x180/g4qkKz4qtd4O0DY8.mp4')
    })
  })
  describe('parseText', () => {
    test('Parses text of normal tweet', async () => {
      await expect(Tweet.parseText(tweetData[1])).resolves.toBe('Tweet with link. https://www.google.com/')
    })
    test('Parses text of quote tweet', async () => {
      await expect(Tweet.parseText(tweetData[2], false, true)).resolves.toBe('Tweet with quoted tweet https://twitter.com/tweetuser/status/123 QT @TwitterUser @FooUser Tweet being quoted http://pbs.twimg.com/media/foo.jpg')
    })
    test('Parses text of retweet', async () => {
      await expect(Tweet.parseText(tweetData[3], true)).resolves.toBe('RT @TwitterUser Retweeted tweet')
    })
    test('Parses text of retweet with quote tweet', async () => {
      await expect(Tweet.parseText(tweetData[4], true, true)).resolves.toBe('RT @TwitterUser Retweet with quoted tweet https://twitter.com/FooUser/status/874720122476384259 QT @TwitterUser Quoted tweet https://twitter.com/twitterUser/status/874696002325929984')
    })
  })
  describe('create', () => {
    test('Normal tweet instantiates correctly', async () => {
      await expect(Tweet.create(tweetData[0])).resolves.toEqual({
        id: '0',
        screen_name: 'TwitterUser',
        user_id: '123',
        time: '2017-06-13T16:43:24-04:00',
        link: 'https://www.twitter.com/TwitterUser/statuses/0',
        text: 'Normal tweet. No link. No anything else.',
        source: 'Twitter Web Client',
      })
    })

    test('Tweet with link instantiates correctly', async () => {
      await expect(Tweet.create(tweetData[1])).resolves.toEqual({
        id: '1',
        screen_name: 'TwitterUser',
        user_id: '123',
        time: '2017-06-13T16:44:06-04:00',
        link: 'https://www.twitter.com/TwitterUser/statuses/1',
        text: 'Tweet with link. https://www.google.com/',
        source: 'TweetDeck',
      })
    })

    test('Tweet with shortened link instantiates correctly', async () => {
      await expect(Tweet.create(tweetData[7])).resolves.toEqual({
        id: '7',
        screen_name: 'TwitterUser',
        user_id: '123',
        time: '2017-06-13T16:44:06-04:00',
        link: 'https://www.twitter.com/TwitterUser/statuses/7',
        text: 'Tweet with shortened link. http://www.testurl.com/actualpage',
        source: 'TweetDeck',
      })
    })

    test('Quoted tweet instantiates correctly', async () => {
      await expect(Tweet.create(tweetData[2])).resolves.toEqual({
        id: '2',
        screen_name: 'TwitterUser',
        user_id: '123',
        time: '2017-06-13T16:42:43-04:00',
        link: 'https://www.twitter.com/TwitterUser/statuses/2',
        text: 'Tweet with quoted tweet https://twitter.com/tweetuser/status/123 QT @TwitterUser @FooUser Tweet being quoted http://pbs.twimg.com/media/foo.jpg',
        source: 'Twitter Web Client',
      })
    })

    test('Retweet instantiates correctly', async () => {
      await expect(Tweet.create(tweetData[3])).resolves.toEqual({
        id: '3',
        screen_name: 'TwitterUser',
        user_id: '123',
        time: '2017-06-13T16:38:57-04:00',
        link: 'https://www.twitter.com/TwitterUser/statuses/123',
        text: 'RT @TwitterUser Retweeted tweet',
        source: 'Twitter Web Client',
      })
    })

    test('Retweet with quoted tweet instantiates correctly', async () => {
      await expect(Tweet.create(tweetData[4])).resolves.toEqual({
        id: '4',
        screen_name: 'TwitterUser',
        user_id: '123',
        time: '2017-06-13T16:42:31-04:00',
        link: 'https://www.twitter.com/TwitterUser/statuses/874728532336934914',
        text: 'RT @TwitterUser Retweet with quoted tweet https://twitter.com/FooUser/status/874720122476384259 QT @TwitterUser Quoted tweet https://twitter.com/twitterUser/status/874696002325929984',
        source: 'Twitter Web Client',
      })
    })

    test('Tweet with photo instantiates correctly', async () => {
      await expect(Tweet.create(tweetData[5])).resolves.toEqual({
        id: '5',
        screen_name: 'TwitterUser',
        user_id: '123',
        time: '2017-06-13T16:43:37-04:00',
        link: 'https://www.twitter.com/TwitterUser/statuses/5',
        text: 'Tweet with photo http://pbs.twimg.com/media/DCOpX7SWAAE0pWc.png',
        source: 'Twitter Web Client',
      })
    })

    test('Tweet with video instantiates correctly', async () => {
      await expect(Tweet.create(tweetData[6])).resolves.toEqual({
        id: '6',
        screen_name: 'TwitterUser',
        user_id: '123',
        time: '2017-06-13T15:14:09-04:00',
        link: 'https://www.twitter.com/TwitterUser/statuses/6',
        text: 'Tweet with video http://pbs.twimg.com/amplify_video_thumb/874658940944035840/img/qAQK2rt7voeKdDo-.jpg https://video.twimg.com/amplify_video/874658940944035840/vid/320x180/g4qkKz4qtd4O0DY8.mp4',
        source: 'Media Studio',
      })
    })
  })
})


describe('TwitterHelper class methods', () => {
  let twitterClient
  let accounts
  const mockFns = {}


  beforeEach(() => {
    jest.resetAllMocks()
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
    // eslint-disable-next-line
    for (const key of Object.keys(mockFns)) {
      mockFns[key].mockRestore()
    }
    mockFns.get = jest.spyOn(twitterClient.client, 'get')
    mockFns.post = jest.spyOn(twitterClient.client, 'post')
  })

  describe('Constructor method', () => {
    test('Throws error without required config props', () => {
      expect(() => new TwitterHelper(null)).toThrow('Missing required props for Twit client')
    })
  })

  describe('Twit client authentication type switcher - switchAuthType', () => {
    test('Switches authentication from user to application', () => {
      twitterClient.switchAuthType()
      expect(twitterClient.client.config).toEqual({
        consumer_key: 'test',
        consumer_secret: 'test',
        app_only_auth: true,
      })
    })
    test('Switches authentication from application to user', () => {
      twitterClient.client.config = {
        consumer_key: 'test',
        consumer_secret: 'test',
        app_only_auth: true,
      }
      twitterClient.switchAuthType()
      expect(twitterClient.client.config).toEqual({
        consumer_key: 'test',
        consumer_secret: 'test',
        access_token: 'test',
        access_token_secret: 'test',
      })
    })
  })

  describe('List methods', () => {
    let errClient
    const idErr = new Error('List id is missing')

    beforeAll(() => {
      errClient = new TwitterHelper(testConfig.TWITTER_CONFIG)
    })

    describe('getList', () => {
      test('Retrieves list data', async () => {
        await expect(twitterClient.getList()).resolves.toEqual(expect.objectContaining({
          following: true,
        }))
        expect(mockFns.get).toBeCalledWith('lists/show', { list_id: '123456789' })
      })

      test('Throws err without list id', async () => {
        await expect(errClient.getList()).rejects.toThrow(idErr)
      })
    })

    describe('getListMembers', () => {
      test('Retrieves users from list', async () => {
        await expect(twitterClient.getListMembers()).resolves.toHaveLength(100)
        expect(mockFns.get).toBeCalledWith('lists/members', { list_id: '123456789', count: 5000 })
      })

      test('Retrieves users from list w/o statuses when noStatuses argument is true', async () => {
        const listData = await twitterClient.getListMembers(true)
        expect(listData).toHaveLength(100)
        expect(listData[0]).not.toHaveProperty('statuses')
        expect(mockFns.get).toBeCalledWith('lists/members', { list_id: '123456789', count: 5000, skip_status: true })
      })

      test('Throws err without list id', async () => {
        await expect(errClient.getList()).rejects.toThrow(idErr)
      })
    })

    describe('createList', () => {
      test('Creates new list without arguments', async () => {
        await expect(twitterClient.createList()).resolves.toEqual(expect.objectContaining({
          name: 'congress',
        }))
        expect(mockFns.post).toBeCalledWith('lists/create', { name: 'congress', mode: 'private' })
      })

      test('Creates new list with argument', async () => {
        await expect(twitterClient.createList('foo')).resolves.toEqual(expect.objectContaining({
          name: 'foo',
        }))
        expect(mockFns.post).toBeCalledWith('lists/create', { name: 'foo', mode: 'private' })
      })
    })

    describe('updateList', () => {
      afterAll(() => mockApi.resetOptions())

      test('Adds users to list', async () => {
        const listBeforeAdd = (await twitterClient.getList()).member_count
        await twitterClient.updateList('create', accounts.map(account => account.id_str))
        const listAfterAdd = (await twitterClient.getList()).member_count
        expect(listAfterAdd - listBeforeAdd).toEqual(accounts.length)
        expect(mockFns.post).toBeCalledWith('lists/members/create_all', { list_id: '123456789', user_id: ['123123', '456456', '789789'] })
      })


      test('Removes users from list', async () => {
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
        await expect(errClient.updateList()).rejects.toThrow(idErr)
      })

      test('Throws err without action', async () => {
        await expect(twitterClient.updateList(null)).rejects.toThrow(new Error('Valid list action is required'))
      })

      test('Throws err without ids', async () => {
        await expect(twitterClient.updateList('create', null)).rejects.toThrow(new Error('Need user ids to perform list action'))
      })
    })
  })

  describe('User methods', () => {
    let idErr

    beforeAll(() => {
      idErr = new Error('User id is missing')
    })

    describe('getUser', () => {
      test('Retrieves user data', async () => {
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
        await expect(twitterClient.getUser()).rejects.toThrow(idErr)
      })
    })

    describe('isAccountValid', () => {
      test('Returns true for valid id integer', async () => {
        await expect(twitterClient.isAccountValid('1')).resolves.toBe(true)
        expect(mockFns.get).toBeCalledWith('users/show', { user_id: '1' })
      })

      test('Returns true for valid username', async () => {
        await expect(twitterClient.isAccountValid('foo')).resolves.toBe(true)
        expect(mockFns.get).toBeCalledWith('users/show', { screen_name: 'foo' })
      })

      test('Returns false for invalid id integer', async () => {
        await expect(twitterClient.isAccountValid('100')).resolves.toBe(false)
      })

      test('Returns false for invalid username', async () => {
        await expect(twitterClient.isAccountValid('reject')).resolves.toBe(false)
      })

      test('Throws err without list id', async () => {
        await expect(twitterClient.isAccountValid()).rejects.toThrow(idErr)
      })
    })

    describe('lookupUsers', () => {
      test('Throws error without ids', async () => {
        await expect(twitterClient.lookupUsers()).rejects.toThrow()
      })

      test('Looks up user ids', async () => {
        const mockIds = Array.from(Array(100)).map((x, i) => `foo${i}`)
        await expect(twitterClient.lookupUsers(mockIds)).resolves.toHaveLength(100)
        expect(mockFns.post).toHaveBeenCalledWith('users/lookup',
          expect.objectContaining({'user_id': expect.any(Array) }))
      })
      
      test('Looks up screen names', async () => {
        const mockIds = Array.from(Array(100)).map((x, i) => `foo${i}`)
        await expect(twitterClient.lookupUsers(mockIds, true)).resolves.toHaveLength(100)
        expect(mockFns.post).toHaveBeenCalledWith('users/lookup', 
          expect.objectContaining({'screen_name': expect.any(Array) }))
      })

      test('Makes multiple function calls to look up more than 100 ids', async () => {
        const mockIds = Array.from(Array(200)).map((x, i) => `foo${i}`)
        await expect(twitterClient.lookupUsers(mockIds)).resolves.toHaveLength(200)
        expect(mockFns.post).toHaveBeenCalledTimes(2)
        expect(mockFns.post.mock.calls.every(x => 
          x[1].user_id.length === 100
        )).toBeTruthy()
      })
    })
  })

  describe('Search methods', () => {
    describe('searchStatuses', () => {
      let query

      beforeAll(() => {
        query = buildQueries(accounts).pop()
      })

      test('Searches user statuses', async () => {
        const results = await twitterClient.searchStatuses(query)
        expect(results).toHaveProperty('statuses')
        expect(results).toHaveProperty('search_metadata')
        expect(results.statuses).toHaveLength(50)
        expect(mockFns.get).toBeCalledWith('search/tweets', {
          q: query, result_type: 'recent', count: 100, tweet_mode: 'extended',
        })
      })

      test('Searches user statuses with max id', async () => {
        const results = await twitterClient.searchStatuses(query, null, '25')
        expect(results).toHaveProperty('statuses')
        expect(results).toHaveProperty('search_metadata')
        expect(results.statuses).toHaveLength(50)
        expect(mockFns.get).toBeCalledWith('search/tweets', {
          q: query, result_type: 'recent', max_id: '25', count: 100, tweet_mode: 'extended',
        })
      })

      test('Searches user statuses with since id', async () => {
        const results = await twitterClient.searchStatuses(query, '500')
        expect(results).toHaveProperty('statuses')
        expect(results).toHaveProperty('search_metadata')
        expect(results.statuses).toHaveLength(50)
        expect(mockFns.get).toBeCalledWith('search/tweets', {
          q: query, result_type: 'recent', since_id: '500', count: 100, tweet_mode: 'extended',
        })
      })

      test('Searches user statuses since and max id', async () => {
        const results = await twitterClient.searchStatuses(query, '75', '25')
        expect(results).toHaveProperty('statuses')
        expect(results).toHaveProperty('search_metadata')
        expect(results.statuses).toHaveLength(50)
        expect(mockFns.get).toBeCalledWith('search/tweets', {
          q: query, result_type: 'recent', max_id: '25', since_id: '75', count: 100, tweet_mode: 'extended',
        })
      })

      test('Throws err without query', async () => {
        await expect(twitterClient.searchStatuses()).rejects.toThrow('Query required for search')
      })
    })

    describe('searchIterate', () => {
      let query

      beforeEach(() => {
        query = buildQueries(accounts).pop()
        mockApi.resetOptions()
        mockFns.searchStatuses = jest.spyOn(twitterClient, 'searchStatuses')
      })

      test('Iterates through query', async () => {
        mockApi.options = {
          run: true,
          multiGet: true,
        }
        const result = await twitterClient.searchIterate(query, '225', null, data.time)
        expect(result).toHaveLength(225)
        expect(result.every(async item => item instanceof Tweet)).toBeTruthy()
        expect(mockFns.searchStatuses).toHaveBeenCalledTimes(3)
        expect(mockFns.get).toHaveBeenCalledTimes(3)
      })

      test('Iterates through query without sinceId', async () => {
        mockApi.options = {
          run: true,
          multiGet: true,
        }
        const result = await twitterClient.searchIterate(query, null, null, data.time)
        expect(result).toHaveLength(300)
        expect(mockFns.searchStatuses).toHaveBeenCalledTimes(3)
        expect(mockFns.get).toHaveBeenCalledTimes(3)
      })

      test('Iterates through query returning fewer than 100 tweets', async () => {
        mockApi.options = {
          run: true,
        }
        const result = await twitterClient.searchIterate(query, '225', '201', data.time)
        expect(result).toHaveLength(24)
        expect(mockFns.searchStatuses).toHaveBeenCalledTimes(1)
        expect(mockFns.get).toHaveBeenCalledTimes(1)
      })

      test('Iterates through query returning no tweets', async () => {
        mockApi.options = {
          run: true,
          noTweets: true,
        }
        const result = await twitterClient.searchIterate(query, '225', '201', data.time)
        expect(result).toHaveLength(0)
        expect(mockFns.searchStatuses).toHaveBeenCalledTimes(1)
        expect(mockFns.get).toHaveBeenCalledTimes(1)
      })
    })

    describe('searchUsers', () => {
      beforeEach(() => {
        mockApi.resetOptions()
        mockFns.searchUsers = jest.spyOn(twitterClient, 'searchUsers')
      })

      test('Throws error without query', async () => {
        await expect(twitterClient.searchUsers()).rejects.toThrow()
      })

      test('Searches user query', async () => {
        await expect(twitterClient.searchUsers('foo')).resolves.toHaveLength(20)
        expect(mockFns.get).toHaveBeenCalledWith('users/search', 
        { "count": 20, "page": 0, "q": "foo" })
        expect(mockFns.get).toHaveBeenCalledTimes(1)
      })

    })
  })

  describe('Run method', () => {
    beforeEach(() => {
      mockApi.resetOptions()
      mockFns.searchStatuses = jest.spyOn(twitterClient, 'searchStatuses')
      mockFns.searchIterate = jest.spyOn(twitterClient, 'searchIterate')
    })

    test('Regular run process', async () => {
      mockApi.options = {
        run: true,
        multiGet: true,
      }
      const locData = nativeClone(data)
      locData.sinceId = '225'
      const runProcess = await twitterClient.run(locData)

      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')
      expect(mockFns.get).toHaveBeenCalledTimes(3)
      expect(mockFns.searchStatuses).toHaveBeenCalledTimes(3)
      expect(mockFns.searchIterate).toHaveBeenCalledTimes(1)
      expect(mockFns.searchStatuses.mock.calls.every(x =>
        x[0].includes('list'))).toBeTruthy()
      expect(runProcess.tweets).toHaveLength(225)
      expect(runProcess.sinceId).toEqual(expect.stringMatching('000'))
      expect(runProcess.success).toEqual(true)
    })

    test('Run process without sinceId', async () => {
      mockApi.options = {
        run: true,
        multiGet: true,
      }
      const locData = nativeClone(data)
      const runProcess = await twitterClient.run(locData)

      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')
      expect(mockFns.get).toHaveBeenCalledTimes(3)
      expect(mockFns.searchStatuses).toHaveBeenCalledTimes(3)
      expect(mockFns.searchIterate).toHaveBeenCalledTimes(1)
      expect(mockFns.searchStatuses.mock.calls.every(x =>
        x[0].includes('list'))).toBeTruthy()
      expect(runProcess.tweets).toHaveLength(275)
      expect(runProcess.sinceId).toEqual(expect.stringMatching('000'))
      expect(runProcess.success).toEqual(true)
    })

    test('Run process with no new tweets', async () => {
      mockApi.options = {
        run: true,
        noTweets: true,
      }

      const locData = nativeClone(data)

      const runProcess = await twitterClient.run(locData)
      expect(runProcess.tweets).toHaveLength(0)
      expect(runProcess.success).toEqual(true)
      expect(runProcess.sinceId).toBeFalsy()
      expect(mockFns.get).toHaveBeenCalledTimes(1)
      expect(mockFns.searchStatuses).toHaveBeenCalledTimes(1)
      expect(mockFns.searchIterate).toHaveBeenCalledTimes(1)
    })

    test('Regular run process after midnight', async () => {
      mockApi.options = {
        run: true,
        lastDay: true,
        multiGet: true,
      }

      const locData = nativeClone(data)
      locData.time.yesterdayStart = modifyDate(locData.time.todayDate, -1, 'd').startOf('day').format()
      locData.time.yesterdayDate = '2017-02-01'
      locData.lastRun = modifyDate(locData.time.todayDate, -1, 'h')
      locData.sinceId = '650'

      const runProcess = await twitterClient.run(locData)
      runProcess.tweets = await _.mapValues(runProcess.tweets, v => _.uniqBy(v, 'id'))

      expect(runProcess.tweets.today).toHaveLength(275)
      expect(runProcess.tweets.yesterday).toHaveLength(375)
      expect(runProcess.sinceId).toEqual('000')
      expect(runProcess.success).toEqual(true)
      expect(mockFns.get).toHaveBeenCalledTimes(7)
      expect(mockFns.searchStatuses).toHaveBeenCalledTimes(7)
      expect(mockFns.searchIterate).toHaveBeenCalledTimes(1)
    })

    test('New user run process', async () => {
      mockApi.options = {
        run: true,
        maintenance: true,
      }

      const locData = nativeClone(data)
      locData.collectSince = '650'
      locData.accounts = Array.from(Array(20).keys()).map(x => ({ screen_name: `TwitterUserNum${x}` }))
      const runProcess = await twitterClient.run(locData, {
        maintenance: true,
      })
      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')

      expect(runProcess.tweets).toHaveLength(9)
      expect(runProcess.sinceId).toBeFalsy()
      expect(runProcess.success).toBe(true)

      expect(mockFns.get).toHaveBeenCalledTimes(2)
      expect(mockFns.searchStatuses).toHaveBeenCalledTimes(2)
      expect(mockFns.searchIterate).toHaveBeenCalledTimes(2)
    })

    test('New user run process with more than 100 tweets per query', async () => {
      mockApi.options = {
        run: true,
        maintenance: true,
        multiGet: true,
      }

      const locData = nativeClone(data)
      locData.collectSince = '300'
      locData.accounts = Array.from(Array(20).keys()).map(x => ({ screen_name: `TwitterUserNum${x}` }))
      const runProcess = await twitterClient.run(locData, {
        maintenance: true,
      })

      runProcess.tweets = _.uniqBy(runProcess.tweets, 'id')
      expect(mockFns.get).toHaveBeenCalledTimes(6)
      expect(mockFns.searchStatuses).toHaveBeenCalledTimes(6)
      expect(mockFns.searchIterate).toHaveBeenCalledTimes(2)
      expect(runProcess.tweets).toHaveLength(549)
    })
  })
})
