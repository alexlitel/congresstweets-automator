import _ from 'lodash'
import redis from 'redis-mock'
import bluebird from 'bluebird'
import {
    appBuilder,
    App
} from '../src/app'
import {
    APP_CONFIG
} from '../src/config'

bluebird.promisifyAll(redis)

let redisClient

beforeAll(() => {
    redisClient = redis.createClient()
})

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000

describe('App class', () => {
    afterEach(async() => {
        await redisClient.flushdbAsync()
    })

    test('App instantiation', () => {
        const app = new App(APP_CONFIG, redisClient)
        const app2 = appBuilder(APP_CONFIG, redisClient)
        expect(app).toHaveProperty('config', expect.any(Object))
        expect(app2).toHaveProperty('config', expect.any(Object))
    })

    test('App initalization', async() => {
        const app = new App(APP_CONFIG, redisClient)

        await expect(app.init()).resolves.toEqual(expect.objectContaining({
            initDate: expect.any(String),
            lastRun: null,
            lastUpdate: null,
            sinceId: null,
            tweets: expect.any(Array),
            users: expect.any(Array)
        }))


    })

    test('App run process', async() => {
            const app = new App(APP_CONFIG, redisClient)
            await app.run()
            const appData = await redisClient.hgetallAsync('app')
            expect(JSON.parse(appData.tweets).length).toBeGreaterThan(0)
            expect(JSON.parse(appData.lastRun)).toBeTruthy()
            expect(appData.sinceId.length).toBeGreaterThan(0)
    })
})
