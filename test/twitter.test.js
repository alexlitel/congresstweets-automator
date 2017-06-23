import fs from 'fs'
import path from 'path'
import _ from 'lodash'
import '../src/load-env'
import {
    Tweet,
    TwitterHelper,
} from '../src/twitter'
import {
    TWITTER_CONFIG,
    LIST_ID,
} from '../src/config'
import {
    generateTimeProps,
} from './util/test-util'
import {
    getTime,
} from '../src/util'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000

const data = {}

const loadData = () => {
    data.users = JSON.parse(fs.readFileSync(path.join(__dirname, '/../data/users-filtered.json')))
    data.tweets = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/tweets.json')))
    data.time = generateTimeProps(getTime(getTime(), 'YYYY-MM-DD'), undefined, undefined)
}
beforeAll(() => {
    loadData()
})


test('All users are labeled properly and have valid twitter info', () => {
    const usersLength = data.users.length
    const filteredWithNames = data.users.filter(user => !!user.name).length
    const usersWithValidInfo = data.users.filter(user => ['campaign', 'office']
            .filter(accountType =>
                accountType in user.accounts)
            .every(accountType =>
                user.accounts[accountType]
                .every(account => ['id', 'id_str', 'screen_name']
                    .every(key => key in account),
                )))
        .length
    expect(filteredWithNames).toEqual(usersLength)
    expect(usersWithValidInfo).toBe(usersLength)
})

test('Tweet class instantiates correctly', () => {
    const testData = {
        quoteTweet: _.find(data.tweets, tweet => _.has(tweet, 'quoted_status')),
        retweet: _.find(data.tweets, tweet => _.has(tweet, 'retweeted_status')),
        normal: _.find(data.tweets, tweet => !_.has(tweet, 'retweeted_status') && !_.has(tweet, 'quoted_status')),
    }


    expect(new Tweet(testData.quoteTweet)).toEqual({
        id: '874728761534578688',
        screen_name: 'RepLukeMesser',
        time: '2017-06-13T16:42:43-04:00',
        link: 'https://www.twitter.com/RepLukeMesser/statuses/874728761534578688',
        text: 'Great to talk with young Hoosiers as part of the Electric Cooperative Youth Tour! https://t.co/i9IIUtNaJw QT @wwvremc @RepLukeMesser #inytdc https://t.co/fIfzLwYB3K',
        source: 'Twitter Web Client',
    })
    expect(new Tweet(testData.retweet)).toEqual({
        id: '874728711320416257',
        screen_name: 'RepJayapal',
        time: '2017-06-13T16:42:31-04:00',
        link: 'https://www.twitter.com/AmeetSarpatwari/statuses/874728532336934914',
        text: 'RT @AmeetSarpatwari @RepJayapal Thank you. Health policy scholars--regardless of political persuasion--think this secrecy does a disservice to all Americans. https://t.co/VVRpVta122',
        source: 'Twitter Web Client',
    })

    expect(new Tweet(testData.normal)).toEqual({
        id: '874729112040079360',
        screen_name: 'WaysandMeansGOP',
        time: '2017-06-13T16:44:06-04:00',
        link: 'https://www.twitter.com/WaysandMeansGOP/statuses/874729112040079360',
        text: "It is time to reform Washington's broken tax code—to create jobs, increase paychecks, and grow our economy.\nhttps://t.co/36dRx905EX",
        source: 'TweetDeck',
    })
})

describe('Twitter Helper class methods', () => {
    let twitterClient
    let accounts
    beforeAll(() => {
        twitterClient = new TwitterHelper(TWITTER_CONFIG, LIST_ID)
        accounts = [{
            "id": 325830217,
            "id_str": "325830217",
            "screen_name": "VP44"
        }, {
            "id": 30313925,
            "id_str": "30313925",
            "screen_name": "ObamaWhiteHouse"
        }, {
            "id": 1093090866,
            "id_str": "1093090866",
            "screen_name": "FLOTUS44"
        }]
        data.ids = accounts.map(account => account.id_str)
    })
    test('Adding users to list', async() => {
        const listBeforeAdd = (await twitterClient.client.get('/lists/show', {
            list_id: LIST_ID
        })).data.member_count
        const update = (await twitterClient.updateList('create', accounts.map(account => account.id_str))).member_count

        const listAfterAdd = (await twitterClient.client.get('/lists/show', {
            list_id: LIST_ID
        })).data.member_count
        expect(update - listBeforeAdd).toEqual(3)
    })

    test('Removing users from list', async() => {
        const listBeforeRemove = (await twitterClient.client.get('/lists/show', {
            list_id: LIST_ID
        })).data.member_count
        const destroy = (await twitterClient.updateList('destroy', accounts.map(account => account.id_str))).member_count
        expect(listBeforeRemove - destroy).toEqual(3)
    })


    test('Collecting tweets', async() => {
        const arr = [expect.any(Object)]
        await expect(twitterClient.getStatuses()).resolves.toEqual(expect.arrayContaining(arr))
    })

    test('Regular run process', async() => {
        data.tweets = []
        await expect(twitterClient.run(data)).resolves.toEqual({
            sinceId: expect.any(String),
            success: true,
            tweets:  expect.anything(),
        })
    })
    test('New user run process', async() => {
        data.tweets = []
        await expect(twitterClient.run(data, {
            maintenance: true
        })).resolves.toEqual({
            sinceId: undefined,
            success: true,
            tweets: expect.anything(),
        })
    })
})