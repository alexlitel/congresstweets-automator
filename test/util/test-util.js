import _ from 'lodash'
import { getTime } from '../../src/util'
// eslint-disable-next-line
export const generateTimeProps = (initDate, lastRun, lastUpdate) => {
	return _.mapValues({initDate, lastRun, lastUpdate}, v => _.isNil(v) ? null : getTime(v))
}

export const modifyDate = (date, offset, type) => {
	return getTime(date).add(offset, type)
}