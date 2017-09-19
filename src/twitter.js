import Twit from 'twit'
import bluebird from 'bluebird'
import _ from 'lodash'
import {
    checkDateValidity,
    getTime,
    trimLeadingSpace,
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

  static replaceUrls(data) {
    return data.full_text.replace(/(\bhttps\:\/\/t\.co\/\w+\b)/gi, (match) => {
      const nonMediaUrl = data.entities.urls.find(item => item.url === match)
      if (!nonMediaUrl) {
        if (!_.has(data, 'extended_entities.media')) return match

        const mediaUrls = data.extended_entities.media.filter(item => item.url === match)
        if (!mediaUrls.length) return match
        return mediaUrls.map((item) => {
          if (item.type === 'photo') return item.media_url
          return `${item.media_url} ${_.minBy(item.video_info.variants, ['bitrate']).url}`
        }).join(' ')
      }
      return nonMediaUrl.expanded_url
    })
  }

  static parseText(data, isRetweet, isQuote) {
    if (isRetweet) {
      if (isQuote) {
        return trimLeadingSpace(`RT @${data.retweeted_status.user.screen_name}
                        ${this.replaceUrls(data.retweeted_status)}
                        QT @${data.retweeted_status.quoted_status.user.screen_name}
                        ${this.replaceUrls(data.retweeted_status.quoted_status)}`, true)
      } return `RT @${data.retweeted_status.user.screen_name} ${this.replaceUrls(data.retweeted_status)}`
    } else if (isQuote) return `${this.replaceUrls(data)} QT @${data.quoted_status.user.screen_name} ${this.replaceUrls(data.quoted_status)}`
    return this.replaceUrls(data)
  }

  constructor(data) {
    const isRetweet = !!data.retweeted_status
    const isQuote = !!data.quoted_status || _.has(data, 'retweeted_status.quoted_status')
    this.id = data.id_str
    this.screen_name = data.user.screen_name
    this.user_id = data.user.id_str
    this.time = getTime(new Date(data.created_at), true)
    this.link = this.constructor.getLink(data, isRetweet)
    this.text = this.constructor.parseText(data, isRetweet, isQuote)
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
          case 'statuses/user_timeline':
            errStr += 'cannot get user statuses'
            break
          case 'users/show':
            errStr += 'cannot show user profile'
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

  async getStatuses(sinceId = undefined, maxId = undefined) {
    try {
      if (!this.listId) { throw new Error('List id is missing') }

      const props = _.omitBy({
        list_id: this.listId,
        count: 200,
        tweet_mode: 'extended',
        since_id: sinceId,
        max_id: maxId,
      }, _.isNil)


      return await this.makeRequest('get', 'lists/statuses', props)
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
                this.updateList(action, group),
                )).pop()
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

  async getActiveUsers(time) {
    try {
      if (!time || !time.yesterdayStart) throw new Error('Invalid time object')

      return (await this.getListMembers()).filter(member =>
                member.statuses_count > 0
                && checkDateValidity(member.status.created_at,
                                    time.yesterdayStart,
                                    'sameOrAfter'),
            )
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

      return (await this.makeRequest('get', 'lists/show', props))
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

  async getUserStatuses(userId, maxId, sinceId, params = {}) {
    try {
      if (!userId && !params.screen_name) throw new Error('User id is missing')

      const props = _.omitBy({
        user_id: userId,
        count: 200,
        tweet_mode: 'extended',
        max_id: maxId,
        since_id: sinceId,
        ...params,
      }, _.isNil)

      return await this.makeRequest('get', 'statuses/user_timeline', props)
    } catch (e) {
      return Promise.reject(e)
    }
  }


  async run(data, options = {}) {
    let isValid = true
    const {
            time,
            sinceId,
            lastRun,
            collectSince,
        } = data
    const {
            maintenance: isMaintenance,
            collectReplies,
        } = options
    let newSinceId
    let maxId
    let count = 0
    let tweetsCollection = time.yesterdayDate && !collectReplies ? {
      yesterday: [],
      today: [],
    } : []
    let ids
    let params

    while (isValid) {
      try {
        let tweets
        let lastTweet
        if (isMaintenance || collectReplies) {
          if (!ids) ids = data.ids.toCheck
          if (!params) params = isMaintenance ? { } : { include_rts: false }
          tweets = await this.getUserStatuses(ids[count],
                                              maxId,
                                              collectSince,
                                              params)
        } else {
          tweets = await this.getStatuses(sinceId, maxId)
          count += 1
        }

        if (tweets.length) {
          if (count === 1 && !isMaintenance) newSinceId = tweets[0].id_str
          lastTweet = tweets[tweets.length - 1]
        }
        if (!tweets.length || lastTweet.id_str === maxId) break
        else {
          let changeCount
          if (time.yesterdayDate && !collectReplies) {
            tweetsCollection = tweets.reduce((p, c) => {
              const { created_at: createdAt } = c
              if (checkDateValidity(createdAt, time.todayDate)) {
                p.today.push(new Tweet(c))
              } else p.yesterday.push(new Tweet(c))
              return p
            }, tweetsCollection)
          } else {
            tweetsCollection.push(...tweets
                            .filter((x) => {
                              if (collectReplies) {
                                const fromYesterday = checkDateValidity(x.created_at, time.yesterdayDate)
                                const notCongressId = !!x.in_reply_to_user_id_str && !data.ids.all.includes(x.in_reply_to_user_id_str)
                                const notRetweet = !x.retweeted_status
                                return fromYesterday && notCongressId && notRetweet
                              } else if (isMaintenance && !!x.in_reply_to_user_id_str) {
                                return checkDateValidity(x.created_at, time.todayDate) && data.ids.all.includes(x.in_reply_to_user_id_str)
                              }
                              return checkDateValidity(x.created_at, time.todayDate)
                            })
                            .map(tweet => new Tweet(tweet)))
          }
          if (isMaintenance) {
            if (!checkDateValidity(lastTweet.created_at, time.todayDate)) {
              changeCount = true
              count += 1
            }
            isValid = count < data.ids.toCheck.length
          } else if (time.yesterdayDate) {
            if (collectReplies) {
              if (!checkDateValidity(lastTweet.created_at, time.yesterdayStart, 'sameOrAfter')) {
                changeCount = true
                count += 1
              }

              isValid = count < data.ids.toCheck.length
            } else isValid = checkDateValidity(lastTweet.created_at, lastRun, 'sameOrAfter') && tweets.length === 200
          } else isValid = checkDateValidity(lastTweet.created_at, time.todayDate) && tweets.length === 200
          if (!isValid) break
          else if (!changeCount) maxId = lastTweet.id_str
          else maxId = null
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('err with twitter run process', e)
        break
      }
    }

    return {
      sinceId: newSinceId,
      success: count > 0,
      tweets: tweetsCollection,
    }
  }

  constructor(config, listId) {
    if (!config || !config.consumer_key || !config.consumer_secret) {
      throw new Error('Missing required props for Twit client')
    }

    this.client = new Twit(config)
    this.listId = listId
  }
}
/* eslint-disable max-len */
