import fs from 'fs'
import path from 'path'
import '../src/load-env'
import {
  getTime,
  trimTemplateLeadingSpace,
} from '../src/util'
import {
  BuildMd,
} from '../src/helpers'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000

const data = {}

const loadData = () => {
  data.users = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/users.json')))
  data.tweets = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/tweets-parsed.json')))
  data.yesterdayDate = getTime('2017-06-13', 'YYYY-MM-DD')
}

beforeAll(() => {
  loadData()
})

describe('Markdown post building class methods', () => {
  test('Category header generator', () => {
    expect(BuildMd.categoryHeader('Foo', 1)).toEqual('<h2 class="items-cat-title items-cat-title-h2">Foo</h2>')
  })

  test('Tweet item to HTML conversion', () => {
    const tweet = {
      screen_name: 'SenWarren',
      time: '2017-06-13T14:30:26-04:00',
      link: 'https://www.twitter.com/SenWarren/970207298',
      text: 'AG Sessions lied to the Senate in January about his own contact with the Russians &amp; played a direct role in firing FBI Director Comey.',
      source: 'Twitter Web Client',
    }
    const tweetText = trimTemplateLeadingSpace(`<li class="tweet-item">
    <p class="tweet-text">AG Sessions lied to the Senate in January about his own contact with the Russians &amp; played a direct role in firing FBI Director Comey.</p>
    <p class="tweet-meta">
    <span class="tweet-meta-span">Posted at 02:30 PM via Twitter Web Client</span>
    <a href="https://www.twitter.com/SenWarren/970207298" class="tweet-meta-link">Link</a></p></li>`)

    const generatedText = trimTemplateLeadingSpace(BuildMd.tweetItem(tweet))

    expect(generatedText).toEqual(tweetText)
  })

  test('Tweet list generation', () => {
    const tweets = [{
      screen_name: 'SenWarren',
      time: '2017-06-13T14:31:15-04:00',
      link: 'https://www.twitter.com/SenWarren/970207298',
      text: 'Jeff Sessions should have never been confirmed as Attorney General – and I’ve called for him to resign. #SessionsHearing',
      source: 'Twitter Web Client',
    }, {
      screen_name: 'SenWarren',
      time: '2017-06-13T14:30:26-04:00',
      link: 'https://www.twitter.com/SenWarren/970207298',
      text: 'AG Sessions lied to the Senate in January about his own contact with the Russians &amp; played a direct role in firing FBI Director Comey.',
      source: 'Twitter Web Client',
    }, {
      screen_name: 'SenWarren',
      time: '2017-06-13T14:29:22-04:00',
      link: 'https://www.twitter.com/SenWarren/970207298',
      text: "Tune in here to watch AG Jeff Sessions' live testimony before the Senate Intel Committee: https://t.co/rR1S96bCep #SessionsHearing",
      source: 'Twitter Web Client',
    }]

    const generatedList = trimTemplateLeadingSpace(BuildMd.tweetList(tweets))

    const listText = trimTemplateLeadingSpace(`<ul class="tweet-list"><li class="tweet-item">
    <p class="tweet-text">Tune in here to watch AG Jeff Sessions' live testimony before the Senate Intel Committee: https://t.co/rR1S96bCep #SessionsHearing</p>
    <p class="tweet-meta">
    <span class="tweet-meta-span">Posted at 02:29 PM via Twitter Web Client</span>
    <a href="https://www.twitter.com/SenWarren/970207298" class="tweet-meta-link">Link</a></p></li>
    <li class="tweet-item">
    <p class="tweet-text">AG Sessions lied to the Senate in January about his own contact with the Russians &amp; played a direct role in firing FBI Director Comey.</p>
    <p class="tweet-meta">
    <span class="tweet-meta-span">Posted at 02:30 PM via Twitter Web Client</span>
    <a href="https://www.twitter.com/SenWarren/970207298" class="tweet-meta-link">Link</a></p></li>
    <li class="tweet-item">
    <p class="tweet-text">Jeff Sessions should have never been confirmed as Attorney General – and I’ve called for him to resign. #SessionsHearing</p>
    <p class="tweet-meta">
    <span class="tweet-meta-span">Posted at 02:31 PM via Twitter Web Client</span>
    <a href="https://www.twitter.com/SenWarren/970207298" class="tweet-meta-link">Link</a></p></li></ul>`)

    expect(generatedList).toEqual(listText)
  })
  
})
