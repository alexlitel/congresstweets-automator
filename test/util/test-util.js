import mapValues from 'lodash/mapValues'
import isNil from 'lodash/isNil'
import {
    getTime,
} from '../../src/util'


export const generateTimeProps = (initDate, lastRun, lastUpdate) => mapValues({
  initDate,
  lastRun,
  lastUpdate,
}, v => isNil(v) ? null : getTime(v))

export const modifyDate = (date, offset, type) => getTime(date).add(offset, type)

export const bufferToString = buffer => Buffer.from(buffer, 'base64').toString('utf8')

export const testConfig = {
  TWITTER_CONFIG: {
    access_token: 'test',
    access_token_secret: 'test',
    consumer_key: 'test',
    consumer_secret: 'test',
  },
  TIME_ZONE: 'America/New_York',
  LIST_ID: '123456789',
  REDIS_URL: 'redis://localhost:6379',
  GITHUB_TOKEN: '123456789',
  GITHUB_USER: 'test-user',
  SITE_REPO: 'test-repo',
  SELF_REPO: 'test-self-repo',
  GITHUB_CONFIG: {
    owner: 'test-user',
    repo: 'test-repo',
  },
}

export const mockChanges = (postBuild, hasStore) => {
  const changes = {}
  changes.list = {}
  if (postBuild) {
    changes.storeUpdate = false
    Object.assign(changes.list, { add: [], remove: [] })
  } else {
    if (hasStore) {
      Object.assign(changes.list, { deactivated: [], reactivated: [], deleted: [] })
    }
    changes.list.renamed = []
    changes.members = { add: [], remove: [], update: [] }
    changes.social = { add: [] }
    changes.file = true
    changes.historical = true
  }
  changes.count = 1
  return changes
}
