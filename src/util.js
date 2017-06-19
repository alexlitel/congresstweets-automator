import moment from 'moment-timezone'
import mapValues from 'lodash/mapValues'
import {
  TIME_ZONE,
} from './config'

export const isProd = process.env.NODE_ENV === 'production'

export const getTime = (time, format = false) => {
  // eslint-disable-next-line no-param-reassign
  time = time || new Date()
  return format ?
    moment.tz(time, TIME_ZONE).format(format === true ? undefined : format) :
    moment.tz(time, TIME_ZONE)
}


export const checkDateValidity = (date, time) => {
  const parsedDate = getTime(new Date(date))
  return parsedDate.isSame(time, 'day')
}

export const createTimeObj = (data) => {
  const time = {}
  time.now = getTime().startOf('hour')
  time.todayDate = getTime(time.now).format('YYYY-MM-DD')

  if (data.lastRun) {
    const diffDay = data.lastUpdate ?
      !time.now.isSame(data.lastUpdate, 'day') : !time.now.isSame(data.lastRun, 'day')
    if (diffDay) {
      const yesterday = getTime(time.now).subtract(1, 'days').startOf('day')
      if (yesterday.diff(data.initDate, 'days') > 10) {
        time.deleteDate = getTime(yesterday).subtract(11, 'days').format('YYYY-MM-DD')
      }
      time.yesterdayDate = yesterday.format('YYYY-MM-DD')
    }
  }
  // eslint-disable-next-line
  return mapValues(time, v => moment.isDate(v) || moment.isMoment(v) ? v.format() : v)
}


export const getFullPartyName = (str) => {
  const dict = {
    D: 'Democrats',
    BI: 'Bipartisan',
    I: 'Independent',
    R: 'Republicans',
  }
  return dict[str.toUpperCase()]
}

export const trimTemplateLeadingSpace = str => str.replace(/^(?![\n])\s+/gmi, '')
