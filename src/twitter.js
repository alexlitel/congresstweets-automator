import Twit from 'twit'
import bluebird from 'bluebird'
import asyncReplace from 'string-replace-async'
import _ from 'lodash'
import {
  buildQueries,
  checkDateValidity,
  getActualUrl,
  getTime,
} from './util'

/* eslint-disable max-len */
export class Tweet {
  static getLink(data, isRetweet) {
    const {
      user: {
        screen_name: screenName,
      },
      id_str: tweetId,
    } =
        isRetweet ? data.retweeted_status : data
    return `https://www.twitter.com/${screenName}/statuses/${tweetId}`
  }

  static async replaceUrls(data) {
    return asyncReplace(data.full_text, /(\bhttps\:\/\/t\.co\/\w+\b)/gi, async (match) => {
      const nonMediaUrl = (data.entities.urls.find(item => item.url === match) || {}).expanded_url
      if (!nonMediaUrl) {
        if (!_.has(data, 'extended_entities.media')) return match

        const mediaUrls = data.extended_entities.media.filter(item => item.url === match)
        if (!mediaUrls.length) return match
        return mediaUrls.map((item) => {
          if (item.type === 'photo') return item.media_url
          return `${item.media_url} ${_.minBy(item.video_info.variants, 'bitrate').url}`
        }).join(' ')
      } else if (!nonMediaUrl.includes('facebook.com/') && /\.\w{1,4}\/\w+$/.test(nonMediaUrl)) {
        return getActualUrl(nonMediaUrl)
      }
      return nonMediaUrl
    })
  }

  static async parseText(data, isRetweet, isQuote) {
    if (isRetweet) {
      if (isQuote) {
        return `RT @${data.retweeted_status.user.screen_name} ` +
                `${await this.replaceUrls(data.retweeted_status)} ` +
                `QT @${data.retweeted_status.quoted_status.user.screen_name} ` +
                `${await this.replaceUrls(data.retweeted_status.quoted_status)}`
      } return `RT @${data.retweeted_status.user.screen_name} ${await this.replaceUrls(data.retweeted_status)}`
    } else if (isQuote) return `${await this.replaceUrls(data)} QT @${data.quoted_status.user.screen_name} ${await this.replaceUrls(data.quoted_status)}`
    return this.replaceUrls(data)
  }

  static async create(data) {
    const isRetweet = !!data.retweeted_status
    const isQuote = !!data.quoted_status || _.has(data, 'retweeted_status.quoted_status')
    data.parsed_text = await this.parseText(data, isRetweet, isQuote)
    data.link = this.getLink(data, isRetweet)
    return Promise.resolve(new Tweet(data))
  }

  constructor(data) {
    this.id = data.id_str
    this.screen_name = data.user.screen_name
    this.user_id = data.user.id_str
    this.time = getTime(new Date(data.created_at), true)
    this.link = data.link
    this.text = data.parsed_text
    this.source = data.source.split('"nofollow"\>')[1].slice(0, -4)
  }
}

export class TwitterHelper {
  async makeRequest(method, path, props) {
    try {
      if (!method || !path || !Object.keys(props).length) throw new Error('Invalid request parameters')
      const { data, resp: res } = await this.client[method](path, props)

      if (res.statusCode !== 200 || !!data.errors) {
        let errStr = ''

        switch (path) {
          case 'lists/create':
            errStr += 'cannot create list'
            break
          case 'lists/members':
            errStr += 'cannot retrieve members of list'
            break
          case 'lists/members/create_all':
            errStr += 'cannot add members to list'
            break
          case 'lists/members/destroy_all':
            errStr += 'cannot remove members from list'
            break
          case 'lists/show':
            errStr += 'cannot retrieve list'
            break
          case 'lists/statuses':
            errStr += 'cannot get list statuses'
            break
          case 'users/show':
            errStr += 'cannot show user profile'
            break
          case 'search/tweets':
            errStr += 'invalid search query'
            break
          default:
            break
        }
        throw new Error(`${res.statusCode || 404} error ${errStr}`)
      }
      return data
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async updateList(action, ids) {
    try {
      if (!this.listId) throw new Error('List id is missing')
      else if (!action) throw new Error('Valid list action is required')
      else if (!ids || !ids.length) throw new Error('Need user ids to perform list action')

      if (ids.length > 100) {
        return (await bluebird.map(_.chunk(ids, 100), async group =>
          this.updateList(action, group))).pop()
      }

      const props = {
        list_id: this.listId,
        user_id: ids,
      }

      return await this.makeRequest('post', `lists/members/${action}_all`, props)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async getListMembers(noStatuses = false) {
    try {
      if (!this.listId) throw new Error('List id is missing')

      const props = {
        list_id: this.listId,
        count: 5000,
      }

      if (noStatuses) props.skip_status = true
      return (await this.makeRequest('get', 'lists/members', props)).users
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async getList() {
    try {
      if (!this.listId) throw new Error('List id is missing')

      const props = {
        list_id: this.listId,
      }

      return await this.makeRequest('get', 'lists/show', props)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async createList(listName = null, description = null) {
    try {
      const props = _.omitBy({
        name: listName || 'congress',
        mode: 'private',
        description,
      }, _.isNil)

      return await this.makeRequest('post', 'lists/create', props)
    } catch (e) {
      return Promise.reject(e)
    }
  }


  async getUser(userId, screenName = false) {
    try {
      if (!userId) throw new Error('User id is missing')
      // eslint-disable-next-line no-restricted-globals
      if (isNaN(+userId) && !screenName) screenName = true
      const props = {
        [screenName ? 'screen_name' : 'user_id']: userId,
      }

      return await this.makeRequest('get', 'users/show', props)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async isAccountValid(id) {
    try {
      if (!id) throw new Error('User id is missing')
      await this.getUser(id)
      return true
    } catch (e) {
      if (e.toString() === 'Error: User id is missing') return Promise.reject(e)
      return false
    }
  }

  async searchStatuses(query, sinceId, maxId, params) {
    try {
      if (!query || !query.length) throw new Error('Query required for search')
      const props = _.omitBy({
        q: query,
        count: 100,
        tweet_mode: 'extended',
        result_type: 'recent',
        since_id: sinceId,
        max_id: maxId,
        ...params,
      }, _.isNil)

      return await this.makeRequest('get', 'search/tweets', props)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async searchIterate(query, sinceId, maxId, time) {
    try {
      let isValid = true
      let collected = []
      while (isValid) {
        let lastTweet
        const {
          statuses: tweets,
          search_metadata: metadata,
        } = await this.searchStatuses(query, sinceId, maxId)
        if (tweets.length) lastTweet = tweets[tweets.length - 1]
        if (!tweets.length || lastTweet.id_str === maxId) isValid = false
        else {
          const mapped = await bluebird.map(tweets, x => Tweet.create(x))
          collected = collected.concat(mapped)
          if (metadata.next_results && tweets.length === 100) {
            if (!sinceId && !checkDateValidity(lastTweet.created_at, time.todayDate)) {
              isValid = false
            } else {
              maxId = metadata.next_results.match(/\d+/).pop()
            }
          } else {
            isValid = false
          }
        }
        if (!isValid) break
      }
      return collected
    } catch (e) {
      return Promise.reject(e)
    }
  }


  switchAuthType() {
    if (!this.client.config.app_only_auth) {
      this.client.config = Object.assign(_.pick(
        this.client.config,
        ['consumer_key', 'consumer_secret'],
      ), { app_only_auth: true })
    } else {
      this.client.config = this.config
    }
  }

  async run(data, options = {}) {
    try {
      const {
        time,
        collectSince,
        accounts,
      } = data
      const {
        maintenance: isMaintenance,
      } = options
      const sinceId = isMaintenance ? collectSince : data.sinceId
      let count = 0
      let tweetsCollection = time.yesterdayDate ? {
        yesterday: [],
        today: [],
      } : []
      let newSinceId
      const maxId = isMaintenance && data.sinceId ? data.sinceId : null
      const queries = buildQueries(isMaintenance
        ? accounts
        : this.listId)

      if (isMaintenance) await this.switchAuthType()
      while (count < queries.length) {
        const tweets = await this.searchIterate(decodeURIComponent(queries[count]), sinceId, maxId, time)
        if (tweets.length) {
          if (!isMaintenance && !newSinceId) newSinceId = tweets[0].id
          if (time.yesterdayDate) {
            tweetsCollection = tweets.reduce((p, c) => {
              if (c.time.includes(time.todayDate)) {
                p.today.push(c)
              } else p.yesterday.push(c)
              return p
            }, tweetsCollection)
          } else {
            const mappedAndValid = await bluebird
              .filter(tweets, x => x.time.includes(time.todayDate))
            tweetsCollection = tweetsCollection.concat(mappedAndValid)
          }
        }


        count += 1
      }

      return {
        sinceId: newSinceId,
        success: count === queries.length,
        tweets: tweetsCollection,
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('err with twitter run process', e)
      return Promise.reject(e)
    }
  }

  constructor(config, listId) {
    if (!config || !config.consumer_key || !config.consumer_secret) {
      throw new Error('Missing required props for Twit client')
    }
    this.config = config
    this.client = new Twit(this.config)
    this.listId = listId
  }
}
/* eslint-disable max-len */
