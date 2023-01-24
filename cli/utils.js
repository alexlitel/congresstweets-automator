import { nativeClone, prettyPrint, keyedReduce, getTime } from '../src/util'
import _ from 'lodash'
import flat from 'flat'
import chalk from 'chalk'
import fs from 'fs'
import sortBy from 'lodash/sortBy'
import path from 'path'
import rp from 'request-promise'

export const formatRecord = (record) => {
  const str = [
    chalk.red.bold(record.screen_name),
    record.verified ? ' ✓' : '',
    '\n',
    record.name,
    '\n',
    chalk.magenta((record.description || '').replace(/(\r|\n)/g, '')),
    '\n',
    [
      record.created_at,
      record?.entities?.url?.urls
        ? record?.entities?.url?.urls[0]?.display_url
        : 'null',
      `${record.statuses_count} tweet(s)}`
    ].join(' | ')
  ].join('')
  return str
}

export const flatForCompare = (record) =>
  flat(_.omit(nativeClone(record), 'accounts'))

export const getFilePath = (fileName) =>
  path.join(
    __dirname,
    '../../accounts/',
    fileName.includes('.') ? fileName : `${fileName}.json`
  )

export const coerceAccounts = (data, action = 'from') =>
  data.map(({ accounts, ...x }) => ({
    ...x,
    accounts:
      action === 'from' ? keyedReduce(accounts, 'id') : Object.values(accounts)
  }))

export const coerceAccountsForRecord = (data, action = 'from') =>
  action === 'from'
    ? {
        ...data,
        accounts: keyedReduce(data.accounts, 'id')
      }
    : { ...data, accounts: Object.values(data.accounts) }

export const getKeyFromRecord = (rec) => {
  if (rec.id && rec.id.bioguide) return rec.id.bioguide
  return ['chamber', 'type', 'name', 'party']
    .map((x) => String(rec[x] || '').replace(/\W/g, ''))
    .filter((x) => x)
    .join('_')
}

export const extractAccounts = async (data) => {
  const obj = {}
  for (const [k, v] of Object.entries(data)) {
    if (v.accounts) {
      for (const [k2, v2] of Object.entries(v.accounts || [])) {
        obj[v2.screen_name] = [k, k2].join('.')
      }
    }
  }
  return obj
}

export const datasetConversion = (userData, action = 'from') => {
  if (action === 'from') {
    return userData.reduce(
      (acc, user) => ({
        ...acc,
        [getKeyFromRecord(user)]: coerceAccountsForRecord(user)
      }),
      {}
    )
  }
  return coerceAccounts(Object.values(userData), 'to')
}

export const sortAndFilterData = (data) => {
  const obj = {}
  obj.sorted = sortBy(data, ['chamber', 'type', 'state', 'name', 'party'])
  obj.filtered = obj.sorted.filter(
    (item) => !!item.accounts && !!item.accounts.length
  )
  return obj
}

export const writeDataToFile = async (fileName, data, isJson = true) => {
  const filePath = isJson ? `${fileName}.json` : fileName

  console.log(getFilePath(filePath))

  await fs.writeFileSync(getFilePath(filePath), data)

  return true
}

export const writeFileData = async (fileName, data) => {
  const parsedData = await sortAndFilterData(datasetConversion(data, 'to'))
  await writeDataToFile(fileName, prettyPrint(parsedData.sorted))
  await writeDataToFile(
    `${fileName}-filtered`,
    prettyPrint(parsedData.filtered)
  )
}

export const updateHistoricalData = async (newData) => {
  const oldData = await loadDataFile('historical-users')

  for await (const [key, val] of Object.entries(newData)) {
    if (oldData[key]) {
      if (oldData.name !== newData.name) {
        oldData.name = newData.name
      }

      for await (const key2 of ['party', 'chamber', 'state']) {
        if (oldData[key][key2]) {
          if (oldData[key][key2].toLowerCase() !== val[key2].toLowerCase()) {
            const oldVal = oldData[key][key2]
            oldData[key][key2] = val[key2]
            oldData[key].prev_props = [
              ...(oldData[key].prev_props || []),
              {
                [key2]: oldVal
              }
            ]
          }
        }
      }

      for await (const [id, val2] of Object.entries(val.accounts || [])) {
        if (!oldData[key].accounts[id]) {
          oldData[key].accounts[id] = val2
        } else if (val2.screen_name !== oldData[key].accounts[id].screen_name) {
          const oldVal = oldData[key].accounts[id].screen_name
          oldData[key].accounts[id].screen_name = val2.screen_name
          oldData[key].accounts[id].prev_names = [
            ...(oldData[key].prev_names || []),
            {
              [key]: oldVal
            }
          ]
        }
      }
    } else {
      oldData[key] = val
    }
  }
  return oldData
}

export const createUserDatasets = async (newData) => {
  const toWrite = {}
  toWrite.users = await nativeClone(newData)
  toWrite['historical-users'] = await updateHistoricalData(nativeClone(newData))
  for await (const [key, data] of Object.entries(toWrite)) {
    await writeFileData(key, data)
  }
}

export const loadDataFile = async (file) => {
  const filePath = getFilePath(file)
  const data = JSON.parse(await fs.readFileSync(filePath))

  return datasetConversion(data)
}

export const loadExternalData = async (dataType = 'current') => {
  const collectionTermStart = getTime(new Date(`2017-01-03T00:00-04:00`))
  const collectionStart = getTime(new Date(`2017-06-21T00:00-04:00`))
  const externalData = (
    await rp({
      gzip: true,
      url: `https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-${dataType}.json`,
      json: true
    })
  ).reduce((acc, item) => {
    const termDates = item.terms.reduce(
      (accTerms, term) => {
        const startDate = getTime(new Date(`${term.start}T00:00-04:00`))
        const endDate = getTime(new Date(`${term.end}T00:00-04:00`))
        if (
          startDate.isSameOrAfter(collectionTermStart) ||
          endDate.isSameOrAfter(collectionTermStart)
        ) {
          if (startDate.isBefore(collectionStart)) {
            term.start = '2017-06-21'
          }

          if (
            accTerms.consecutive &&
            accTerms.lastItem &&
            term.start !== accTerms.lastItem
          ) {
            accTerms.consecutive = false
          }

          accTerms.lastItem = term.end

          accTerms.terms.push([term.start, term.end])
        }
        return accTerms
      },
      { lastItem: null, terms: [], consecutive: true }
    )

    const { consecutive, terms } = termDates
    const date = terms[0][0]
    const filters = consecutive ? [] : terms
    const names = [
      {
        name: 'wikipedia',
        value: item.id.wikipedia
      },
      {
        name: 'ballotpedia',
        value: item.id.ballotpedia
      },
      {
        name: 'Nickname (or first) + last',
        value: `${item.name.nickname || item.name.first} ${item.name.last}`
      },
      {
        name: 'First + last',
        value: `${item.name.first} ${item.name.last}`
      },
      {
        name: 'Official full',
        value: item.name.official_full
      }
    ]
      .filter((name) => !!name.value)
      .map((obj) => {
        let name = obj.value
        if (name.includes('(')) {
          name = name.slice(0, name.lastIndexOf('(')).trim()
        }

        name = _.deburr(name)
        return {
          name: obj.name + ': ' + name,
          value: name
        }
      })
      .sort((a, b) => b.value.length - a.value.length)

    return {
      ...acc,
      [item.id.bioguide]: {
        date,
        filters,
        consecutive,
        names,
        name: names[names.length - 1].value,
        isNewish: getTime(date).isAfter(getTime('2020-11-03T00:00-04:00')),
        termsCount: terms.length
      }
    }
  }, {})
  return externalData
}

export const loadData = async (dataType = 'users', loadExternal = true) => {
  const data = await loadDataFile(dataType)
  const names = Object.entries(nativeClone(data)).reduce(
    (p, [k, v]) => ({
      ...p,
      [v.name]: k
    }),
    {}
  )

  const accounts = await extractAccounts(data)
  const bioguides = await Object.keys(data).filter((x) => !x.includes('_'))
  const externalData = loadExternal ? await loadExternalData() : null
  return { data, names, accounts, newData: [], bioguides, externalData }
}

export const loadCsvData = async (bioguides) => {
  const externalData = await rp({
    gzip: true,
    url: 'https://s3.amazonaws.com/pp-projects-static/politwoops/active_accounts.csv'
  })

  const lines = externalData.split('\n')
  const keys = lines[0].split(',')
  const iterateData = lines.slice(0)

  const coerced = iterateData.reduce((acc, item) => {
    const user = _.zipObject(keys, item.split(','))
    if (user.bioguide_id && bioguides.includes(user.bioguide_id)) {
      acc[user.twitter_id] = user
    }
    return acc
  }, {})

  return coerced
}
