import '../src/load-env'

import {
    getTime,
    checkDateValidity,
    createTimeObj,
    getFullPartyName,
    trimTemplateLeadingSpace
} from '../src/util'

import {
    generateTimeProps,
    modifyDate
} from './util/test-util'

describe('util function tests', () => {
	test('time zone conversion utility function', () => {
	    const date = getTime('2010-01-01').startOf('day')
	    const date2 = getTime('2010-01-01').startOf('day')
	    expect(getTime(date).date()).toBe(1)
	    expect(date.format()).toBe('2010-01-01T00:00:00-05:00')
	    expect(getTime(date, 'hh:mmA')).toBe('12:00AM')
	    expect(getTime(date2).date()).toBe(1)
	    expect(date2.format()).toBe('2010-01-01T00:00:00-05:00')
	    expect(getTime(date2, 'hh:mmA')).toBe('12:00AM')
	})

	test('utility function for checking tweet date validity works', () => {
	    const date = getTime('2010-01-01').startOf('day')
	    const date2 = getTime(date).subtract(20, 'seconds')
	    const date3 = getTime(date).add(3, 'hours')

	    expect(checkDateValidity(date, date2)).toBe(false)
	    expect(checkDateValidity(date, date3)).toBe(true)
	})


    test('app time object pseudo-factory utility works', () => {
    	const date = getTime()
   		
    	const data = {
    		initRun: generateTimeProps(getTime(date, 'YYYY-MM-DD'), undefined, undefined),
    		normalDate: generateTimeProps(modifyDate(date, -2, 'days').format('YYYY-MM-DD'), modifyDate(date, -3, 'hours').startOf('hour'), getTime(date).startOf('day')),
    		deleteDate: generateTimeProps(modifyDate(date, -12, 'days').format('YYYY-MM-DD'), modifyDate(date, -1, 'hours').startOf('hour'), modifyDate(date, -11, 'days'))
    	}


        expect(createTimeObj(data.initRun)).toMatchObject({
        	now: expect.anything(),
        	todayDate: date.format('YYYY-MM-DD')
        })
        expect(createTimeObj(data.normalDate)).toMatchObject({
        	now: expect.anything(),
        	todayDate: date.format('YYYY-MM-DD')
        })

        expect(createTimeObj(data.deleteDate)).toMatchObject({
        	deleteDate: modifyDate(date, -12, 'days').format('YYYY-MM-DD'),
        	now: expect.anything(),
        	todayDate: date.format('YYYY-MM-DD'),
        	yesterdayDate: modifyDate(date, -1, 'days').format('YYYY-MM-DD'),
        })
      
    })

    test('get full party name utility works', () => {
	   
	    expect(getFullPartyName('d')).toBe('Democrats')
	    expect(getFullPartyName('r')).toBe('Republicans')
	    expect(getFullPartyName('bi')).toBe('Bipartisan')
	    expect(getFullPartyName('i')).toBe('Independent')
	    
	})

	test('trim whitespace from multiline template literals formatted nicely in code works', () => {
		const str = `lineone
					linetwo
					linethree`

		const trimmedStr = trimTemplateLeadingSpace(str)
		expect(trimmedStr.split('\n').every(line => !/^(?![\n])\s+/gmi.test(line))).toEqual(true)
	})
})