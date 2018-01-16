import {
  extractAccounts,
  getTime,
  nativeClone,
  checkDateValidity,
  buildQueries,
  serializeObj,
  createTimeObj,
  getActualUrl,
  getFullPartyName,
  prettyPrint,
  trimLeadingSpace,
  unserializeObj,
} from '../src/util'
import {
  generateTimeProps,
  modifyDate,
} from './util/test-util'
import MockApi from './helpers/api-mock'

describe('Utility function tests', () => {
  describe('Time utility functions', () => {
    describe('getTime', () => {
      test('Time zone conversion works', () => {
        const date = getTime('2010-01-01').startOf('day')
        expect(getTime(date).date()).toBe(1)
        expect(date.format()).toBe('2010-01-01T00:00:00-05:00')
        expect(getTime(date, 'hh:mmA')).toBe('12:00AM')
        expect(getTime(date).date()).toBe(1)
        expect(getTime(date, 'iso')).toBe('2010-01-01T05:00:00.000Z')
        expect(date.format()).toBe('2010-01-01T00:00:00-05:00')
        expect(getTime(date, 'hh:mmA')).toBe('12:00AM')
      })
    })

    describe('checkDateValidity', () => {
      test('Checks if date is same when only two arguments passed', () => {
        const date = getTime('2010-01-01').startOf('day')
        const date2 = getTime(date).subtract(20, 'seconds')
        const date3 = getTime(date).add(3, 'hours')

        expect(checkDateValidity(date, date2)).toBe(false)
        expect(checkDateValidity(date, date3)).toBe(true)
      })

      test('Checks if date is before when comparisonType is "before"', () => {
        const date = getTime('2010-01-01').startOf('day')
        const date2 = getTime(date).subtract(20, 'seconds')
        const date3 = getTime(date).add(3, 'hours')

        expect(checkDateValidity(date, date2, 'before')).toBe(false)
        expect(checkDateValidity(date, date3, 'before')).toBe(true)
      })

      test('Checks if date is after when comparisonType is "After"', () => {
        const date = getTime('2010-01-01').startOf('day')
        const date2 = getTime(date).subtract(20, 'seconds')
        const date3 = getTime(date).add(3, 'hours')

        expect(checkDateValidity(date, date2, 'After')).toBe(true)
        expect(checkDateValidity(date, date3, 'After')).toBe(false)
      })

      test('Checks if date is same or after when comparisonType is "sameOrAfter"', () => {
        const date = getTime('2010-01-01').startOf('day')
        const date2 = getTime(date).subtract(20, 'seconds')
        const date3 = getTime(date).add(3, 'hours')

        expect(checkDateValidity(date, date2, 'sameOrAfter')).toBe(true)
        expect(checkDateValidity(date, date3, 'sameOrAfter')).toBe(false)
      })

      test('Checks if date is same or before when comparisonType is "sameOrBefore"', () => {
        const date = getTime('2010-01-01').startOf('day')
        const date2 = getTime(date).subtract(20, 'seconds')
        const date3 = getTime(date).add(3, 'hours')

        expect(checkDateValidity(date, date2, 'sameOrBefore')).toBe(false)
        expect(checkDateValidity(date, date3, 'sameOrBefore')).toBe(true)
      })
    })

    describe('generateTimeProps app time object pseudo-factory', () => {
      let date

      beforeAll(() => { date = getTime() })

      test('Returns time object when app run for first time', () => {
        const data = generateTimeProps(getTime(date, 'YYYY-MM-DD'), undefined, undefined)

        expect(createTimeObj(data)).toMatchObject({
          now: getTime(date).startOf('hour').format(),
          todayDate: date.format('YYYY-MM-DD'),
        })
      })

      test('Returns time object during normal app process', () => {
        const data = generateTimeProps(
          modifyDate(date, -2, 'days').format('YYYY-MM-DD'),
          modifyDate(date, -3, 'hours').startOf('hour'),
          getTime(date).startOf('day'),
        )

        expect(createTimeObj(data)).toMatchObject({
          now: getTime(date).startOf('hour').format(),
          todayDate: date.format('YYYY-MM-DD'),
        })
      })

      test('Returns object with yesterday properties when last run date is yesterday', () => {
        const data = generateTimeProps(
          modifyDate(date, -2, 'days').format('YYYY-MM-DD'),
          modifyDate(date, -3, 'hours').startOf('hour'),
          modifyDate(date, -1, 'days').startOf('day'),
        )

        expect(createTimeObj(data)).toMatchObject({
          now: getTime(date).startOf('hour').format(),
          todayDate: date.format('YYYY-MM-DD'),
          yesterdayDate: modifyDate(date, -1, 'days').format('YYYY-MM-DD'),
          yesterdayStart: modifyDate(date, -1, 'days').startOf('day').format(),
        })
      })

      test('Returns object with delete date property when init date > 100 days prior', () => {
        const data = generateTimeProps(
          modifyDate(date, -111, 'days').format('YYYY-MM-DD'),
          modifyDate(date, -1, 'hours').startOf('hour'),
          modifyDate(date, -11, 'days'),
        )

        expect(createTimeObj(data)).toMatchObject({
          deleteDate: modifyDate(date, -102, 'days').format('YYYY-MM-DD'),
          now: getTime(date).startOf('hour').format(),
          todayDate: date.format('YYYY-MM-DD'),
          yesterdayDate: modifyDate(date, -1, 'days').format('YYYY-MM-DD'),
          yesterdayStart: modifyDate(date, -1, 'days').startOf('day').format(),
        })
      })
    })
  })


  describe('Misc utility functions', () => {
    describe('buildQueries', () => {
      describe('User array passed as argument', () => {
        test('Builds iterable url-encoded search queries of 500 chars or less', () => {
          const names = Array.from(Array(20))
            .map((x, i) => ({ screen_name: `TwitterMember${i}` }))
          const queries = buildQueries(names)
          expect(typeof queries[0]).toEqual('string')
          expect(queries.every(query => query.length <= 500)).toBeTruthy()
        })

        test('Does not join query with only one user', () => {
          const names = Array.from(Array(20))
            .map((x, i) => ({ screen_name: `TwitterMember${i}` })).slice(0, 1)
          const queries = buildQueries(names)
          expect(queries).toHaveLength(1)
          expect(queries[0]).toEqual('from%3ATwitterMember0%20include%3Anativeretweets%20AND%20include%3Aretweets')
        })
      })

      describe('List id passed as argument', () => {
        test('Returns array with single string with list query', () => {
          expect(buildQueries('123')).toEqual(['list%3A123%20include%3Anativeretweets%20AND%20include%3Aretweets'])
        })
      })
    })

    describe('unserializeObj', () => {
      test('Successfully unserializes object', () => {
        const foo = {
          one: null,
          two: '\{"foo": true\}',
          three: 'null',
          four: undefined,
          five: 'undefined',
          six: '"2016-03-02"',
        }
        expect(unserializeObj(foo)).toEqual({
          one: null,
          two: { foo: true },
          three: null,
          four: null,
          five: null,
          six: '2016-03-02',
        })
      })
    })

    describe('nativeClone', () => {
      test('Clones object natively', () => {
        const obj = { foo: true }
        expect(nativeClone(obj)).toEqual(obj)
      })
    })

    describe('serializeObj', () => {
      test('Serializes object for store correctly', () => {
        const obj = {
          foo: true, foo2: null, foo3: [1, 2, 4], foo4: 'whatever',
        }
        expect(serializeObj(obj)).toEqual({
          foo: 'true',
          foo3: '[1,2,4]',
          foo4: '"whatever"',
        })
      })
    })


    describe('extractAccounts', () => {
      test('Extracts accounts from user dataset', () => {
        const accounts = [
          {
            id: { bioguide: '123', govtrack: 123 },
            name: 'A Person',
            type: 'member',
            chamber: 'house',
            state: 'CA',
            party: 'R',
            accounts: [
              { id: 123, screen_name: 'RepPerson', account_type: 'office' },
              { id: 456, screen_name: 'ElectPerson', account_type: 'campaign' },
            ],
          },
          {
            id: { thomas_id: 'JCSE', senate_committee_id: 'JCSE', tag: 'csce' },
            name: 'Sample Committee',
            chamber: 'joint',
            type: 'committee',
            accounts: [],
          },
          {
            name: 'House Caucus',
            chamber: 'house',
            type: 'caucus',
            party: 'R',
            accounts: [
              { id: 789, screen_name: 'housecaucus', account_type: 'office' },
            ],
          },
        ]

        const extractedAccounts = extractAccounts(accounts)

        expect(extractedAccounts).toHaveLength(3)
        expect(extractedAccounts[0]).toEqual({
          id: 123,
          screen_name: 'RepPerson',
          chamber: 'house',
          type: 'member',
          account_type: 'office',
          name: 'A Person',
          user_index: 0,
          account_index: 0,
          bioguide: '123',
          state: 'CA',
          party: 'R',
        })

        expect(extractedAccounts[1]).toEqual({
          id: 456,
          screen_name: 'ElectPerson',
          chamber: 'house',
          type: 'member',
          account_type: 'campaign',
          name: 'A Person',
          user_index: 0,
          account_index: 1,
          bioguide: '123',
          state: 'CA',
          party: 'R'
        })

        expect(extractedAccounts[2]).toEqual({
          id: 789,
          screen_name: 'housecaucus',
          chamber: 'house',
          type: 'caucus',
          account_type: 'office',
          name: 'House Caucus',
          user_index: 2,
          account_index: 0,
          party: 'R',
        })
      })
    })
    describe('getActualUrl', () => {
      const mockApi = new MockApi()
      beforeAll(() => {
        mockApi.init()
      })

      afterAll(() => MockApi.cleanMocks())

      test('Returns real url from shortened url', async () => {
        await expect(getActualUrl('http://www.testurl.com/sh0rt')).resolves.toEqual('http://www.testurl.com/actualpage')
      })

      test('Returns url passed as argument if url is normal', async () => {
        await expect(getActualUrl('http://www.testurl.com/normal')).resolves.toEqual('http://www.testurl.com/normal')
      })
    })
  })

  describe('Formatting utility functions', () => {
    describe('prettyPrint', () => {
      test('Pretty print works', () => {
        const c = { foo: true }
        const cStr = '{\n\t"foo": true\n}'
        expect(prettyPrint(c)).toEqual(cStr)
      })
    })

    describe('getFullPartyName', () => {
      test('Get full party name utility works', () => {
        expect(getFullPartyName('d')).toBe('Democrats')
        expect(getFullPartyName('r')).toBe('Republicans')
        expect(getFullPartyName('bi')).toBe('Bipartisan')
        expect(getFullPartyName('i')).toBe('Independent')
      })
    })

    describe('trimLeadingSpace', () => {
      test('Trim whitespace from multiline template literals formatted nicely in code', () => {
        const str = `lineone
                            linetwo
                            linethree`

        const trimmedStr = trimLeadingSpace(str)
        expect(trimmedStr.split('\n').every(line => !/^(?![\n])\s+/gmi.test(line))).toEqual(true)
        expect(trimmedStr.split('\n')).toHaveLength(3)
      })

      test('Trims whitespace from multiline template literals and flattens when flatten arg is true', () => {
        const str = `lineone
                            linetwo
                            linethree`

        const trimmedStr = trimLeadingSpace(str, true)
        expect(trimmedStr.split('\n')).toHaveLength(1)
      })
    })
  })
})