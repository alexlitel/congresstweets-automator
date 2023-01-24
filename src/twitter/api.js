import Twit from 'twit'
import bluebird from 'bluebird'
import { normalizeTweetData } from './parseTweet'
import { buildQueries } from './buildQueries'
import _ from 'lodash'
import { checkDateValidity, getTime } from '../util'
import { LIST_ID, TWITTER_CONFIG } from '../config'

export const twitterClient = new Twit(TWITTER_CONFIG)

export const switchAuthType = () => {
  if (!twitterClient.config.app_only_auth) {
    twitterClient.config = Object.assign(
      _.pick(twitterClient.config, ['consumer_key', 'consumer_secret']),
      { app_only_auth: true }
    )
  } else {
    twitterClient.config = twitterClient.config
  }
}

export const makeApiRequest = async (method, path, props) => {
  try {
    if (!method || !path || !Object.keys(props).length)
      throw new Error('Invalid request parameters')
    const { data, resp: res } = await twitterClient[method](path, props)

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
        case 'users/lookup':
          errStr += 'cannot show user profiles'
          break
        case 'search/tweets':
        case 'users/search':
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

export const updateList = async (action, ids, listId) => {
  try {
    if (!LIST_ID || listId) throw new Error('List id is missing')
    else if (!action) throw new Error('Valid list action is required')
    else if (!ids || !ids.length)
      throw new Error('Need user ids to perform list action')

    if (ids.length > 100) {
      return (
        await Promise.all(
          _.chunk(ids, 100).map(async (group) => updateList(action, group))
        )
      ).pop()
    }

    const props = {
      list_id: LIST_ID,
      user_id: ids
    }

    return await makeApiRequest('post', `lists/members/${action}_all`, props)
  } catch (e) {
    return Promise.reject(e)
  }
}

export const getListMembers = async (noStatuses = false) => {
  try {
    if (!LIST_ID) throw new Error('List id is missing')

    const props = {
      list_id: LIST_ID,
      count: 5000
    }

    if (noStatuses) props.skip_status = true
    return (await makeApiRequest('get', 'lists/members', props)).users
  } catch (e) {
    return Promise.reject(e)
  }
}

export const lookupUsers = async (ids, screenName = false) => {
  try {
    if (!ids || !ids.length) throw new Error('No ids')
    if (ids.length > 100) {
      return bluebird.reduce(
        _.chunk(ids, 100),
        async (p, group) => p.concat(await lookupUsers(group, screenName)),
        []
      )
    }

    const props = {
      [screenName ? 'screen_name' : 'user_id']: ids
    }

    return await makeApiRequest('post', 'users/lookup', props)
  } catch (e) {
    return Promise.reject(e)
  }
}

export const searchUsers = async (query, page = 0) => {
  try {
    if (!query) throw new Error('Query is missing')

    const props = {
      q: query,
      count: 20,
      page
    }

    return await makeApiRequest('get', 'users/search', props)
  } catch (e) {
    return Promise.reject(e)
  }
}

export const getList = async () => {
  try {
    if (!LIST_ID) throw new Error('List id is missing')

    const props = {
      list_id: LIST_ID
    }

    return await makeApiRequest('get', 'lists/show', props)
  } catch (e) {
    return Promise.reject(e)
  }
}

export const createList = async (listName = null, description = null) => {
  try {
    const props = _.omitBy(
      {
        name: listName || 'congress',
        mode: 'private',
        description
      },
      _.isNil
    )

    return await makeApiRequest('post', 'lists/create', props)
  } catch (e) {
    return Promise.reject(e)
  }
}

export const getUser = async (userId, screenName = false) => {
  try {
    if (!userId) throw new Error('User id is missing')
    // eslint-disable-next-line no-restricted-globals
    if (isNaN(+userId) && !screenName) screenName = true
    const props = {
      [screenName ? 'screen_name' : 'user_id']: userId
    }

    return await makeApiRequest('get', 'users/show', props)
  } catch (e) {
    return Promise.reject(e)
  }
}

export const isAccountValid = async (id) => {
  try {
    if (!id) throw new Error('User id is missing')
    await getUser(id)
    return true
  } catch (e) {
    if (e.toString() === 'Error: User id is missing') return Promise.reject(e)
    return false
  }
}

export const searchStatuses = async (query, sinceId, maxId, params) => {
  try {
    if (!query || !query.length) throw new Error('Query required for search')
    const props = _.omitBy(
      {
        q: query,
        count: 100,
        tweet_mode: 'extended',
        result_type: 'recent',
        since_id: sinceId,
        max_id: maxId,
        ...params
      },
      _.isNil
    )

    return await makeApiRequest('get', 'search/tweets', props)
  } catch (e) {
    return Promise.reject(e)
  }
}

export const searchIterate = async (query, sinceId, maxId, time) => {
  try {
    let isValid = true
    let collected = []
    while (isValid) {
      let lastTweet
      const { statuses: tweets, search_metadata: metadata } =
        await searchStatuses(query, sinceId, maxId)
      if (tweets.length) lastTweet = tweets[tweets.length - 1]
      if (!tweets.length || lastTweet.id_str === maxId) isValid = false
      else {
        const mapped = await Promise.all(tweets.map(normalizeTweetData))
        collected = collected.concat(mapped)
        if (metadata.next_results && tweets.length === 100) {
          if (
            !sinceId &&
            !checkDateValidity(lastTweet.created_at, time.todayDate)
          ) {
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

export const userTimeline = async (
  reqCount,
  userId,
  screenName = false,
  maxId,
  sinceId = null
) => {
  try {
    if (Number.isNaN(+userId) && !screenName) screenName = true
    const props = _.omitBy(
      {
        [screenName ? 'screen_name' : 'user_id']: userId,
        since_id: sinceId,
        max_id: maxId,
        tweet_mode: 'extended',
        count: 200
      },
      _.isNil
    )

    reqCount = reqCount + 1

    return await makeApiRequest('get', 'statuses/user_timeline', props)
  } catch (e) {
    return Promise.reject(e)
  }
}

export const timelineIterate = async (
  reqCount,
  userId,
  date,
  sinceId = null,
  maxTweetId = null
) => {
  try {
    let isValid = true
    let collected = []
    let maxId = maxTweetId || null
    const timeStamp = await getTime(date).startOf('day')
    while (isValid) {
      let lastTweet = null
      const tweets = (
        await userTimeline(reqCount, userId, null, maxId, sinceId)
      ).filter(
        (x) => timeStamp <= getTime(new Date(x.created_at)).startOf('day')
      )
      if (tweets.length) lastTweet = tweets[tweets.length - 1]
      if (!tweets.length || lastTweet.id_str === maxId) isValid = false
      else {
        const mapped = await Promise.all(tweets.map(normalizeTweetData))
        collected = collected.concat(mapped)
        if (mapped.length < 199) {
          isValid = false
        } else {
          maxId = lastTweet.id_str
        }
      }
    }
    return collected
  } catch (e) {
    return Promise.reject(e)
  }
}

export const collectTweets = async (data, isMaintenance) => {
  try {
    const { time, collectSince, accounts } = data
    const sinceId = isMaintenance ? collectSince : data.sinceId
    let count = 0
    let tweetsCollection = time.yesterdayDate
      ? {
          yesterday: [],
          today: []
        }
      : []
    let newSinceId
    const maxId = isMaintenance && data.sinceId ? data.sinceId : null
    const queries = buildQueries(isMaintenance ? accounts : LIST_ID)

    if (isMaintenance) await switchAuthType()
    while (count < queries.length) {
      const tweets = await searchIterate(
        decodeURIComponent(queries[count]),
        sinceId,
        maxId,
        time
      )
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
          const mappedAndValid = await bluebird.filter(tweets, (x) =>
            x.time.includes(time.todayDate)
          )
          tweetsCollection = tweetsCollection.concat(mappedAndValid)
        }
      }

      count += 1
    }

    return {
      sinceId: newSinceId,
      success: count === queries.length,
      tweets: tweetsCollection
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('err with twitter run process', e)
    return Promise.reject(e)
  }
}

/* eslint-disable max-len */
