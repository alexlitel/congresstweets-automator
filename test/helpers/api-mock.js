import nock from 'nock'
import qs from 'qs'
import path from 'path'
import fs from 'fs'
import capitalize from 'lodash/capitalize'
import {
    modifyDate,
} from '../util/test-util'
import {
    getTime,
    extractAccounts,
    nativeClone,
} from '../../src/util'

class MockApi {
  static cleanMocks() {
    return nock.cleanAll()
  }

  static parseUrl(url) {
    const qIndex = url.indexOf('?')
    const hasParams = qIndex !== -1 && qIndex !== url.length - 1
    if (hasParams) {
      const urlPath = url.substr(0, qIndex)
      const queryParams = qs.parse(decodeURIComponent(url.substr(qIndex + 1)))
      return {
        path: urlPath,
        query: queryParams,
      }
    } return {
      path: url,
    }
  }

  loadMockData(key) {
    return JSON.parse(this.mockData)[key]
  }

  resetOptions() {
    this.options = {}
  }


  // eslint-disable-next-line
  twitterGetParser(url, req) {
    const mockData = this.loadMockData('twitter')
    let data

    const {
            path: urlPath,
            query: urlQuery,
        } = url

    if (urlPath.includes('list') && !urlQuery.list_id) throw new Error()

    if (/lists\/(?!(statuses|members\.json)).+/.test(urlPath)) {
      data = mockData.list

      if (this.options.total) data.member_count = this.options.total
    } else if (urlPath.includes('lists/members.json')) {
      data = {}
      if (this.options.maintain) {
        data.users = extractAccounts(this.loadMockData('githubcontent').users).map((x) => {
          x.id_str = x.id
          x.id = +x.id
          return x
        })
        if (this.options.maintain.type) {
          const { type } = this.options.maintain
          if (type === 'deactivated') data.users = data.users.slice(1)
          if (type === 'renamed') data.users[0].screen_name = 'changedName'
        }
      } else {
        const arrLength = this.options.app ? 10 : 100
        const activeCount = this.options.app ? 5 : 50
        data.users = Array.from(Array(arrLength)).map((item, i) => {
          const user = nativeClone(mockData.user)
          user.screen_name = `Twitter${i}`
          user.id = i
          user.id_str = i.toString()
          if (this.options.lastDay) {
            if (!!user.status && !!user.status.created_at) {
              user.status.created_at = modifyDate(this.date, i < activeCount ? -1 : -15, 'd')
            }
          } else if (urlQuery.skip_status) {
            if (user.status) delete user.status
          }
          return user
        })
      }
    } else if (urlPath.includes('statuses')) {
      if (this.options.noTweets) return []
      const isListCall = urlPath.includes('lists')
      const {
                tweets,
            } = mockData
      let arrInfo = {}

      if (urlQuery.since_id || urlQuery.max_id) {
        // eslint-disable-next-line
        let { max_id: maxId, since_id: sinceId, } = urlQuery


        if (sinceId && /^\d+$/.test(sinceId)) {
          arrInfo.end = parseInt(sinceId)
          if (!maxId) {
            arrInfo.start = 0
            arrInfo.end = isListCall ? 200 : 50
            maxId = 0
          }
        }
        if (maxId) {
          arrInfo.start = /^\d+$/.test(maxId) ? parseInt(maxId) : 50
          if (!arrInfo.end) {
            arrInfo.end = arrInfo.start + (isListCall ? 200 : 50)
          }
        }

        if (arrInfo.start && arrInfo.end && arrInfo.start > arrInfo.end) {
          const { end, start } = arrInfo
          arrInfo.start = end
          arrInfo.end = start
        }
      }

      if (!Object.keys(arrInfo).length) {
        arrInfo = {
          start: 0,
          end: isListCall ? 200 : 50,
        }
      }

      arrInfo.arrLength = Math.abs(arrInfo.end - arrInfo.start)
      if (arrInfo.arrLength > 200) {
        arrInfo.end = arrInfo.start + 200
        arrInfo.arrLength = 200
      }

      if (this.options.app) {
        arrInfo = {
          start: 10,
          end: 20,
          arrLength: 10,
        }
      }

      data = Array.from(Array(arrInfo.arrLength)).map((x, i) => {
        const index = i + arrInfo.start
        const item = nativeClone(tweets[0])
        item.id_str = index.toString()
        if (this.options.run) {
          if (isListCall) {
            if (this.options.app) {
              item.created_at = index < 15 ? this.date : modifyDate(this.date, -15, 'm')
            } else if (index < 450) {
              item.created_at = this.date
            } else {
              item.created_at = this.options.lastDay && index < 651 ?
                                modifyDate(this.date, -15, 'm') :
                                modifyDate(this.date, -1, 'd')
            }
          } else if ((this.options.multiGet && index < 75) || i < 5) {
            if (item.retweeted_status) delete item.retweeted_status
            item.created_at = this.options.maintenance ?
                                modifyDate(this.date, 1, 'h') :
                                modifyDate(this.date, -15, 'm')

            item.id_str = Math.random().toString()
            item.in_reply_to_status_id = 123456
            item.in_reply_to_status_id_str = Math.random().toString()
            item.in_reply_to_user_id = 2500
            if (this.options.maintenance) {
              item.in_reply_to_user_id_str = i === 4 ? '2500' : '123123'
            } else if (this.options.collectReplies) {
              item.in_reply_to_user_id_str = i === 4 ? '123123' : '2500'
            }
            item.in_reply_to_screen_name = 'fooUser'
          } else {
            item.created_at = modifyDate(this.date, -15, 'd')
          }
        }
        return item
      })
    } else if (urlPath.includes('users/show')) {
      if (urlQuery.screen_name === 'reject' || urlQuery.user_id === '100') throw new Error()
      data = mockData.user
      if (urlQuery.screen_name) data.screen_name = urlQuery.screen_name
      if (urlQuery.user_id) data.id_str = urlQuery.user_id
    }


    return data
  }
  // eslint-disable-next-line
  twitterPostParser(url, req) {
    const mockData = this.loadMockData('twitter')
    let data

    if (url.path.includes('lists/')) {
      data = mockData.list
      if (url.path.includes('lists/members')) {
        if (!url.query.list_id) throw new Error()
        if (!url.query.user_id) throw new Error()
        if (url.path.includes('members/create_all')) {
          this.options.total = (!this.options.total ? data.member_count : this.options.total) + url.query.user_id.split(',').length
        } else if (url.path.includes('members/destroy_all')) {
          this.options.total = this.options.total - url.query.user_id.split(',').length
          if (this.options.total === data.member_count) delete this.options.total
        }
        if (this.options.total) data.member_count = this.options.total
      } else if (url.path.includes('lists/create')) {
        data.name = url.query.name
        data.slug = url.query.name
        data.full_name = data.full_name.replace('news', url.query.name)
        data.uri = data.uri.replace('news', url.query.name)
      }
    }


    return data
  }
  // eslint-disable-next-line
  githubGetParser(url, req) {
    const mockData = this.loadMockData('github')
    let data

    if (url.path.includes('commits/heads/master')) {
      data = mockData.latestsha
    } else if (url.path.includes('git/trees')) {
      data = mockData.tree

      if (this.options.recursive) {
        data.tree.push(...['users',
          'users-filtered',
          'historical-users',
          'historical-users-filtered']
                      .map(x => ({
                        sha: 'foo',
                        url: 'foo',
                        path: `data/${x}.json`,
                        type: 'blob',
                        mode: '100644',
                      })))
      }
    }
    return data
  }
  // eslint-disable-next-line
  githubContentGetParser(url, req) {
    const mockData = this.loadMockData('githubcontent').users
    let data = mockData.filter(user => user.type === 'member')
    if (url.path.includes('current')) {
      if (this.options.maintain.type) {
        const { type } = this.options.maintain
        if (type === 'deleteCurr') data = data.slice(0, -1)
      }
      data = data.map((user) => {
        const obj = {}
        const { name } = user
        obj.id = Object.assign({}, user.id)
        obj.id.wikipedia = `${name} (Senator)`
        obj.id.ballotpedia = name
        obj.name = {
          first: name.split(' ')[0],
          last: name.split(' ')[1],
          full_name: name,
        }

        obj.terms = [
          {
            type: user.chamber === 'senate' ? 'sen' : 'rep',
            state: user.state,
            party: user.party,
          },
        ]
        return obj
      })
    } else {
      data = extractAccounts(data)
      data = data.map((user) => {
        const obj = {}
        obj.id = { bioguide: user.bioguide, govtrack: user.govtrack }
        obj.social = {
          twitter: user.screen_name,
          twitter_id: user.id,
        }
        return obj
      })
    }


    return data
  }

  githubPostParser(url, req) {
    const mockData = this.loadMockData('github')
    let data
    if (url.path.includes('git/blobs')) {
      data = mockData.blobs
    } else if (url.path.includes('git/trees')) {
      data = mockData.tree
      data.tree = req.tree
    } else if (url.path.includes('git/commits')) {
      data = mockData.createcommit
      data.message = req.message
      data.parents = req.parents.map(parent => ({
        sha: parent,
        url: 'foo',
        html_url: 'foo',
      }))
    } else if (url.path.includes('git/refs')) {
      data = mockData.updatereference
    }

    return data
  }

  handleApiReply(api, method) {
    const that = this
    // eslint-disable-next-line func-names
    return function (url, req) {
      try {
        const parsedUrl = that.constructor.parseUrl(url)
        if (!!req && typeof req === 'string') req = JSON.parse(req)
        const data = that[`${api}${capitalize(method)}Parser`](parsedUrl, req)
        return [200, data]
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(e)
        return [404, 'Unable to access the requested resource']
      }
    }
  }

  init() {
    this.constructor.cleanMocks()

    if (this.type === 'twitter' || this.type === 'both') {
      nock(/twitter\.com/)
                .persist()
                .get(/.*/)
                .reply(this.handleApiReply('twitter', 'GET'))
                .post(/.*/)
                .reply(this.handleApiReply('twitter', 'POST'))
    }

    if (this.type === 'github' || this.type === 'both') {
      nock(/github\.com/)
                .persist()
                .get(/.*/)
                .reply(this.handleApiReply('github', 'GET'))
                .post(/.*/)
                .reply(this.handleApiReply('github', 'POST'))
                .patch(/.*/)
                .reply(this.handleApiReply('github', 'POST'))
    }

    if (this.type === 'both') {
      nock(/githubusercontent\.com/)
                .persist()
                .get(/.*/)
                .reply(this.handleApiReply('githubContent', 'GET'))
    }
  }

  constructor(type, options = {}) {
    this.type = type
    this.options = options
    this.date = getTime('2017-02-02')
    this.mockData = fs.readFileSync(path.join(__dirname, '/../data/mock-data.json'))
  }
}


export default MockApi
