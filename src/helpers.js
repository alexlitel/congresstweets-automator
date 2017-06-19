import _ from 'lodash'
import pretty from 'pretty'
import {
  getTime,
  getFullPartyName,
  trimTemplateLeadingSpace,
} from './util'

// eslint-disable-next-line import/prefer-default-export
export class BuildMd {
  static generateMeta(date) {
    return trimTemplateLeadingSpace(`---
			layout:     post
			title:      Tweets
			date:       ${getTime(date, 'YYYY-MM-DD')}
			summary:    These are the tweets for ${getTime(date, 'MMMM D, YYYY')}.
			categories:
			---\n\n`)
  }
  static tweetItem(item) {
    return `<li class="tweet-item">
				 <p class="tweet-text">${item.text}</p>
				 <p class="tweet-meta">
				 <span class="tweet-meta-span">${item.text.startsWith('RT @')
				? 'Retweeted' : 'Posted'} at ${getTime(item.time, 'hh:mm A')} via ${item.source}</span>
				 <a href="${item.link}" class="tweet-meta-link">Link</a></p></li>`
  }
  static tweetList(list) {
    return `<ul class="tweet-list">${list.sort((a, b) => a.time.localeCompare(b.time)).map(BuildMd.tweetItem).join('\n')}</ul>`
  }

  static categoryHeader(val, i) {
    return `<h${i + 1} class="items-cat-title items-cat-title-h${i + 1}">${val}</h${i + 1}>`
  }

  static transformData(date, tweets, users) {
    let str = this.generateMeta(date)
    let lastSplit

    str += _.chain(tweets)
      .groupBy((item) => {
        const caseInsensitiveHandle = item.screen_name.toLowerCase()
        const match = _.find(users, user => JSON.stringify(user.accounts).toLowerCase().includes(`"${caseInsensitiveHandle}`))

        const isCampaign = _.has(match, 'accounts.campaign') &&
          match
          .accounts
          .campaign
          .some(account =>
            account
            .screen_name.toLowerCase() === caseInsensitiveHandle)
        let args = [match.chamber, match.type]
        if (match.type === 'committee') {
          args = [...args, match.name,
            getFullPartyName(_.find(match.accounts.office,
                account => account
                .screen_name
                .toLowerCase() === caseInsensitiveHandle)
              .party),
          ]
        }

        if (match.type === 'caucus') args = [...args, getFullPartyName(match.party), match.name, `${isCampaign ? 'campaign' : 'office'}`]
        if (match.type === 'member') args = [...args, match.state, `${match.name} (${_.toUpper(match.party)})`, `${isCampaign ? 'campaign' : 'office'}`]
        if (match.type === 'party') args = [...args, match.name, `${isCampaign ? 'campaign' : 'office'}`]
        return [...args, `@${item.screen_name}`].filter(x => !!x).join('***')
      })
      .mapValues(this.tweetList)
      .toPairs()
      .sortBy(0)
      .reduce((p, c) => {
        const split = c[0].split('***')
        const diffs = _.difference(split, lastSplit)
        lastSplit = split
        // eslint-disable-next-line no-confusing-arrow
        const headers = split.map((item, i) => diffs.includes(item) ||
          (item === 'campaign' || item === 'office' || item === 'Republicans' || item === 'Democrats') ?
          this.categoryHeader(item, i, split[1]) : null).filter(item => item)
        const vals = c.slice(1)
        p.push(...headers)
        p.push(vals)
        return p
      }, [])
      .join('\n')
      .thru(val => pretty(val))
      .value()


    return str
  }
}
