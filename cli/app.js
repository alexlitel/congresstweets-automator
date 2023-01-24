/* eslint-disable func-names */
import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import moment from 'moment'
import { timelineIterate, lookupUsers } from '../src/twitter/api'
import { nativeClone } from '../src/util'
import {
  createUserDatasets,
  extractAccounts,
  getKeyFromRecord,
  loadData,
  loadCsvData
} from './utils'
import { execSync } from 'child_process'
import * as prompts from './prompts'

class App {
  get(prop) {
    return _.get(this.state, prop)
  }

  actions = {
    'data/load': () => loadData(),
    'data/reload': () => this.reloadData(),
    'data/update_tweets': () => this.updateTweets(),
    'data/update_accounts_from_external_data': () =>
      this.updateAccountsFromExternalData(),
    'data/update_names_from_external_data': () =>
      this.updateNamesFromExternalData(),
    'data/update_missing_campaign': () =>
      this.updateMissingAccounts('campaign'),
    'data/update_missing_office': () => this.updateMissingAccounts('office'),
    'data/copy_accounts': () => this.copyAccountsFromHistoricalToCurrent(),
    'data/remove_tweets': () => this.removeTweets(),
    'data/add_entry': () => prompts.addEntry(),
    'data/add_account': () => this.appendAccount('add'),
    'data/add_account_search': () => this.appendAccount('search'),
    'data/modify_entry': () => this.modifyEntry(),
    'data/modify_account': () => this.modifyAccount(),
    'data/format': () => this.writeData(),
    'data/write': () => this.writeData(),
    'menu/main': () => prompts.startMenu(),
    'menu/update': () => prompts.updateMenu(),
    'menu/exit_update': () => true,
    'menu/exit_main': () => this.writeData()
  }

  modifyAccount = async () => {
    const [entryId, accountId] = (
      await prompts.searchLocalData(this.get('accounts'), 'accounts')
    ).split('.')
    const name = `${entryId}.accounts.${accountId}`
    const data = this.get(`data.${name}`)
    const newData = await prompts.modifyRecord({ ...data })

    return {
      name,
      newData
    }
  }

  modifyEntry = async () => {
    const name = await prompts.searchLocalData(this.get('names'), 'users')
    const data = this.get(`data.${name}`)
    const newData = await prompts.modifyRecord({ ...data })

    return {
      name,
      newData
    }
  }

  appendAccount = async (type, existingName) => {
    const name =
      existingName ||
      (await prompts.searchLocalData(this.get('names'), 'users'))

    console.log(name)
    const dataKey = this.get(`names.${name}`)
    const externalData = this.get(`externalData.${dataKey}`) || {}
    const promptData = await (type === 'search'
      ? prompts.searchTwitterUsers(name, externalData || {})
      : prompts.getTwitterUser(externalData))

    const { accountData, newData } = await promptData.reduce(
      (p, c) => {
        const { startDate, ...data } = c
        const newObject = { account: data.id, date: startDate }
        if (externalData.date) {
          Object.assign(newObject, {
            date: externalData.date,
            filters: externalData.filters || []
          })
        }
        p.newData.push(newObject)
        p.accountData = {
          ...p.accountData,
          [data.id]: data
        }
        return p
      },
      { accountData: {}, newData: [] }
    )

    return {
      name,
      accountData,
      newData
    }
  }

  updateTweets = async () => {
    // eslint-disable-next-line
    await execSync('cd ../site && git pull')
    const newData = await JSON.parse(
      fs.readFileSync(path.join(__dirname, '../build/new-data.json'))
    )

    let tweets = []

    for await (const item of newData) {
      let userTweets = await timelineIterate(
        this.reqCount,
        item.account,
        item.date
      )

      if (newData.filters && newData.filters.length) {
        const validDates = []
        for await (const filter of newData.filters) {
          let currentDate = moment(filter[0])
          const stopDate = moment(filter[1])
          while (currentDate <= stopDate) {
            const formatted = await moment(currentDate).format('YYYY-MM-DD')
            if (!validDates.includes(formatted)) {
              validDates.push(formatted)
            }
            currentDate = currentDate.add(1, 'days')
          }
        }

        userTweets = await userTweets.filter((item) =>
          validDates.includes(item.time.slice(0, item.time.indexOf('T')))
        )
      }

      tweets.push(userTweets)
    }

    tweets = await tweets.flatMap((x) => x)
    tweets = await tweets.reduce((p, c) => {
      const datePosted = c.time.split('T')[0]
      if (!p[datePosted]) {
        p[datePosted] = []
      }

      p[datePosted].push(c)

      return p
    }, {})

    const dataPath = await path.join(__dirname, '../../site/data/')
    for await (const entry of Object.entries(tweets)) {
      const [key, value] = entry
      const filePath = await path.join(dataPath, `${key}.json`)
      if (fs.existsSync(filePath)) {
        const data = await JSON.parse(fs.readFileSync(filePath))
        const data2 = await _.uniqBy(data.concat(value), 'id')
        // eslint-disable-next-line
        console.log(key, 'tweet count', value.length)
        console.log(key, 'filtered', data2.length)
        // eslint-disable-next-line

        await fs.writeFileSync(filePath, JSON.stringify(data2))
        // eslint-disable-next-line
        console.log('written')
      }
    }
  }

  removeTweets = async () => {
    // eslint-disable-next-line
    await execSync('cd ../site && git pull')
    const query = await prompts.getQuery()

    const dataPath = await path.join(__dirname, '../../site/data/')
    const files = (await fs.readdirSync(dataPath)).filter((x) =>
      x.includes('.json')
    )
    for await (const entry of files) {
      const filePath = await path.join(dataPath, `${entry}`)
      if (fs.existsSync(filePath)) {
        const data = await JSON.parse(fs.readFileSync(filePath))
        const data2 = await nativeClone(data).filter(
          // eslint-disable-next-line
          ({ screen_name = '' }) => screen_name.toLowerCase() !== query
        )
        // eslint-disable-next-line
        console.log(entry, 'tweet count', data.length)
        console.log(entry, 'filtered', data2.length)
        // eslint-disable-next-line

        await fs.writeFileSync(filePath, JSON.stringify(data2))
        // eslint-disable-next-line
        console.log('written')
      }
    }
  }

  updateMissingAccounts = async (accountType) => {
    const bioguides = this.get('bioguides')
    const currentData = await this.get('data')

    const missingAccounts = bioguides.reduce((p, key) => {
      const { accounts: currData = {}, name } = currentData[key]
      const accounts = Object.values(currData)
      const hasNoAccounts =
        accounts.length && !accounts.some((x) => x.account_type === accountType)
      if (hasNoAccounts) {
        p[key] = name
      }

      return p
    }, {})

    for await (const [key, value] of Object.entries(missingAccounts)) {
      console.log(value)
      const { accountData, newData } = await this.appendAccount('search', value)

      this.state.data[key].accounts = {
        ...this.state.data[key].accounts,
        ...accountData
      }
      this.state.newData = [...this.state.newData, ...newData]
    }

    await this.reloadData()
  }

  copyAccountsFromHistoricalToCurrent = async () => {
    const historicalData = await loadData('historical-users', false)
    const currentUsers = await this.get('bioguides')
    const currentData = await this.get('data')

    const missing = {}

    for await (const id of currentUsers) {
      for await (const userId of Object.keys(
        historicalData.data[id].accounts
      )) {
        if (!currentData[id].accounts[userId]) {
          const { prev_names: prevNames, ...historicalAccountData } =
            historicalData.data[id].accounts[userId]
          missing[userId] = {
            bioguide: id,
            historicalAccountData
          }
        }
      }
    }

    const accounts = await lookupUsers(Object.keys(missing))

    for await (const account of accounts) {
      const missingData = missing[account.id_str]
      const pathVal = missingData.bioguide

      const newRecord = await prompts.convertSocialData(account)
      if (newRecord) {
        this.state.data[pathVal].accounts = {
          ...this.state.data[pathVal].accounts,
          [account.id_str]: newRecord
        }
      }
    }
  }

  reloadData = async () => {
    const data = this.get('data')

    this.state.names = await Object.entries(nativeClone(data)).reduce(
      (p, [k, v]) => {
        p[v.name] = k
        return p
      },
      {}
    )

    this.state.accounts = await extractAccounts(data)
  }

  writeData = async () => {
    const data = nativeClone(this.get('data'))
    await createUserDatasets(data)
    await fs.writeFileSync(
      path.join(__dirname, '../build/new-data.json'),
      JSON.stringify(this.get('newData'), null, '\t')
    )
  }

  updateAccountsFromExternalData = async () => {
    const bioguides = this.get('bioguides')
    const csvData = await loadCsvData(bioguides)
    const currentData = await this.get('data')
    const missingItems = await Object.entries(csvData).reduce((acc, [k, v]) => {
      const currentRecord = currentData[v.bioguide_id]
      const normalizedName = v.user_name.toLowerCase()
      const recordInAccounts = Object.values(currentRecord.accounts).some(
        (val) =>
          val.screen_name.toLowerCase() === normalizedName || val.id === k
      )
      if (!recordInAccounts) {
        acc[k] = v
      }
      return acc
    }, {})

    const accounts = await lookupUsers(Object.keys(missingItems))

    for await (const account of accounts) {
      const missingData = missingItems[account.id_str]
      const pathVal = missingData.bioguide_id
      const externalData = this.get(`externalData.${pathVal}`) || {}
      externalData.accountType =
        missingData.account_type === 'official' ? 'office' : 'campaign'
      const { startDate, ...newRecord } =
        (await prompts.convertSocialData(account, externalData)) || {}
      if (newRecord && JSON.stringify(newRecord) !== '{}') {
        this.state.data[pathVal].accounts = {
          ...this.state.data[pathVal].accounts,
          [account.id_str]: newRecord
        }

        const newObject = { account: account.id_str, date: startDate }
        if (externalData.date) {
          Object.assign(newObject, {
            date: externalData.date,
            filters: externalData.filters || []
          })
        }
        this.state.newData = [...this.state.newData, newObject]
      }
    }

    await this.reloadData()
  }

  updateNamesFromExternalData = async () => {
    const externalData = this.get('externalData')
    const currentData = this.get('data')
    const bioguides = this.get('bioguides')

    for await (const bioguide of bioguides) {
      const count = bioguides.indexOf(bioguide)
      const currentRecord = currentData[bioguide]
      const { name: currentName } = currentRecord
      const externalRecord = externalData[bioguide]
      const nameParts = currentName.split(/\s/g)
      const hasThreeParts = nameParts.length > 2
      const diffFirst = externalRecord.names.some(
        (name) => !name.value.startsWith(nameParts[0])
      )
      const isNewAndMaybeDiff =
        externalRecord.isNewish &&
        !externalRecord.names.every((name) => name.value === currentName)
      if (isNewAndMaybeDiff || diffFirst || hasThreeParts) {
        console.log(
          count,
          currentName,
          isNewAndMaybeDiff,
          diffFirst,
          hasThreeParts
        )

        const updatedName = await prompts.updateNameFromDataset(
          currentData[bioguide],
          externalData[bioguide].names
        )
        if (
          updatedName &&
          updatedName !== 'skip' &&
          updatedName !== currentData[bioguide].name
        ) {
          this.state.data[bioguide].name = updatedName
        }
      }
    }

    await this.reloadData()
  }

  async dispatch(action) {
    const data = await this.actions[action]()
    await this.resolveAction({ data, action })
  }

  async resolveAction({ data, action }) {
    let nextAction
    let pathVal
    let newPath
    switch (action) {
      case 'data/add_account':
        pathVal = this.state.names[data.name]
        this.state.data[pathVal].accounts = {
          ...this.state.data[pathVal].accounts,
          ...data.accountData
        }
        this.state.newData = [...this.state.newData, ...data.newData]
        await this.reloadData()
        break
      case 'data/add_account_search':
        pathVal = this.state.names[data.name]
        this.state.data[pathVal].accounts = {
          ...this.state.data[pathVal].accounts,
          ...data.accountData
        }
        this.state.newData = [...this.state.newData, ...data.newData]
        await this.reloadData()
        break
      case 'data/add_entry':
        newPath = getKeyFromRecord(data)
        this.state.data = {
          ...this.state.data,
          [newPath]: data
        }
        await this.reloadData()
        break
      case 'data/modify_entry':
        this.state.data[data.name] = data.newData
        await this.reloadData()
        break
      case 'data/modify_account':
        _.set(this.state.data, data.name, data.newData)
        await this.reloadData()
        break
      case 'data/load':
        this.state = { ...this.state, ...data }
        break
      case 'menu/main':
        this.state = { ...this.state, menu: 'main' }
        nextAction = data.action
        break
      case 'menu/update':
        this.state = { ...this.state, menu: 'update' }
        nextAction = data.action
        break
      case 'menu/exit_update':
        this.state = { ...this.state, menu: 'main' }
        break
      case 'menu/exit_main':
        process.exit(0)
        break
      default:
        break
    }
    if (!nextAction) {
      nextAction = `menu/${this.get('menu')}`
    }
    return this.dispatch(nextAction)
  }

  async init() {
    await execSync('cd ../accounts && git pull')

    await this.dispatch('data/load')
    await this.dispatch('menu/main')
  }

  constructor() {
    this.state = { menu: 'main' }
    this.reqCount = 0
  }
}

export default App
