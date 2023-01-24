// eslint-disable-next-line
import inquirer from 'inquirer'
import _ from 'lodash'
import { prettyPrint } from '../src/util'
import { formatRecord } from './utils'
import { getUser, searchUsers } from '../src/twitter/api'

const menuCreate = (menuType, choices) => async () => {
  const promptVal = await inquirer.prompt({
    message: 'What do you want to do?',
    name: 'action',
    type: 'list',
    choices
  })
  return { menu: menuType, ...promptVal }
}

export const startMenu = menuCreate('startMenu', [
  { name: 'Update user datasets', value: 'menu/update' },
  { name: 'Format user datasets', value: 'data/format' },
  { name: 'Update tweet datasets', value: 'data/update_tweets' },
  { name: 'Remove tweets from datasets', value: 'data/remove_tweets' },
  { name: 'Exit', value: 'menu/exit_main' }
])

export const updateMenu = menuCreate('updateMenu', [
  { name: 'Init list', value: 'data/init_list' },
  { name: 'Add entry to dataset', value: 'data/add_entry' },
  { name: 'Add account to dataset', value: 'data/add_account' },
  {
    name: 'Search for accounts to add to dataset',
    value: 'data/add_account_search'
  },
  { name: 'Change user entry', value: 'data/modify_entry' },
  { name: 'Change account', value: 'data/modify_account' },
  {
    name: 'Copy accounts from historical to current',
    value: 'data/copy_accounts'
  },
  {
    name: 'Update accounts using external datasets',
    value: 'data/update_accounts_from_external_data'
  },
  {
    name: 'Update names using external datasets',
    value: 'data/update_names_from_external_data'
  },
  {
    name: 'Update missing office accounts',
    value: 'data/update_missing_office'
  },
  {
    name: 'Update missing campaign accounts',
    value: 'data/update_missing_campaign'
  },
  { name: 'Exit', value: 'menu/exit_update' }
])

const listQuestions = {
  account_type: {
    message: 'What is the account type?',
    name: 'account_type',
    type: 'list',
    choices: ['campaign', 'office']
  },
  chamber: {
    message: 'What is the chamber?',
    name: 'chamber',
    type: 'list',
    choices: ['house', 'joint', 'senate']
  },
  type: {
    message: 'What is the entry type?',
    name: 'type',
    type: 'list',
    choices: ['caucus', 'committee', 'member', 'party']
  },
  party: {
    message: 'What is the party?',
    name: 'party',
    type: 'list',
    choices: ['D', 'I', 'N/A', 'R']
  }
}

export const searchLocalData = async (users, dataType = 'users') => {
  const keys = Object.keys(users)
  const sourceFunc = async (answers, input = '') => {
    const vals = await keys.filter((key) => key.toLowerCase().includes(input))
    return vals
  }
  // eslint-disable-next-line
  inquirer.registerPrompt(
    'autocomplete',
    require('inquirer-autocomplete-prompt')
  )
  return (
    await inquirer.prompt({
      message: `Which ${dataType} to you want to choose?`,
      name: 'searchLocal',
      type: 'autocomplete',
      source: sourceFunc
    })
  ).searchLocal
}

export const chooseLocalData = async (users, dataType = 'users') => {
  const keys = Object.keys(users)
  const sourceFunc = async (answers, input = '') => {
    const vals = await keys.filter((key) => key.toLowerCase().includes(input))
    return vals
  }
  // eslint-disable-next-line
  inquirer.registerPrompt(
    'autocomplete',
    require('inquirer-autocomplete-prompt')
  )
  return (
    await inquirer.prompt({
      message: `Which ${dataType} to you want to choose?`,
      name: 'searchLocal',
      type: 'autocomplete',
      source: sourceFunc
    })
  ).searchLocal
}

export const confirmRecord = async (record) =>
  (
    await inquirer.prompt({
      type: 'confirm',
      name: 'confirmPrompt',
      message: `Does this look ok? ${prettyPrint(record)}`,
      default: false
    })
  ).confirmPrompt

export const addProperty = async (obj = {}) => {
  const questions = [
    {
      type: 'input',
      name: 'propKey',
      message: 'What is the property key/path?'
    },
    {
      type: 'input',
      name: 'propValue',
      message: 'What is the property value?',
      when: (answers) =>
        answers.propKey.length && !listQuestions[answers.propKey],
      default: (answers) => obj[answers.propKey] || ''
    },
    {
      type: 'list',
      name: 'propValue',
      message: 'What is the property value?',
      when: (answers) =>
        answers.propKey.length && !!listQuestions[answers.propKey],
      choices: (answers) => listQuestions[answers.propKey].choices,
      default: (answers) =>
        obj[answers.propKey] || listQuestions[answers.propKey].choices[0]
    },
    {
      type: 'confirm',
      name: 'addAnother',
      message: 'Add another property?',
      default: false
    }
  ]

  const promptVal = await inquirer.prompt(questions)
  const newObj = {
    ...obj,
    ..._(
      promptVal.propValue
        ? _.set({}, promptVal.propKey, promptVal.propValue)
        : {}
    )
  }

  return promptVal.addAnother ? addProperty(newObj) : newObj
}

export const modifyRecord = async (record, potentialValue) => {
  process.stdout.write(prettyPrint(record))

  return addProperty(record, potentialValue)
}

export const updateNameFromDataset = async (record, names) => {
  return (
    await inquirer.prompt({
      message: `What do you want to update ${record.name} to`,
      name: 'name',
      type: 'list',
      choices: ['skip', ...names],
      default: 'skip'
    })
  ).name
}

export const addEntry = async () => {
  const questions = [
    listQuestions.chamber,
    listQuestions.type,
    {
      message: 'What is the name?',
      name: 'name',
      type: 'input'
    },
    listQuestions.party
  ]

  let newEntry = {
    id: {},
    name: null,
    type: null,
    chamber: null,
    party: null,
    accounts: [],
    ...(await inquirer.prompt(questions))
  }

  if (newEntry.type === 'committee') delete newEntry.party

  while (!(await confirmRecord(newEntry))) {
    newEntry = await addProperty(newEntry)
  }

  if (Object.keys(newEntry).length === 0) delete newEntry.id

  return (await confirmRecord(newEntry)) ? newEntry : null
}

export const getQuery = async (query = '') =>
  (
    await inquirer.prompt({
      message: 'What is your query?',
      name: 'query',
      type: 'input',
      default: query,
      validate: (input) => (input.length ? true : 'Enter input')
    })
  ).query

export const convertSocialData = async (data, options = {}) => {
  process.stdout.write(await formatRecord(data))
  const questions = [
    {
      ...listQuestions.account_type,
      default: options.accountType
    },
    {
      message: 'Does this record have a name?',
      name: 'hasName',
      type: 'confirm',
      default: false,
      when: !options.noName
    },
    {
      message: 'What is the name?',
      name: 'name',
      type: 'input',
      default: data.name,
      when: (answers) => !options.noName && answers.hasName
    },
    {
      message: 'Does this record have a party?',
      name: 'hasParty',
      type: 'confirm',
      default: false,
      when: !options.noParty
    },
    {
      ...listQuestions.party,
      default: 'N/A',
      when: (answers) => !options.noParty && answers.hasParty
    },
    {
      message: 'What is start date to add?',
      name: 'startDate',
      type: 'input',
      default: options.startDate || options.date || '2021-01-03',
      when: !(options && options.noStartDate)
    }
  ]

  const answers = await inquirer.prompt(questions)
  const newObj = {
    id: data.id_str,
    screen_name: data.screen_name,
    ...['account_type', 'name', 'party'].reduce((p, c) => {
      if (answers[c]) p[c] = answers[c]
      return p
    }, {}),
    startDate: answers.startDate
  }
  return (await confirmRecord(newObj)) ? newObj : null
}

export const searchTwitterUsers = async (query, options = {}) => {
  const recursiveSearchQuery = async (page = 0, input = []) => {
    const getChoices = async () =>
      (await searchUsers(query, page))
        .filter((user) => {
          const stringData = ['screen_name', 'description', 'name']
            .map((x) => (user[x] || '').toLowerCase())
            .join('')

          return (
            user.verified || /(campaign|office|official)/gi.test(stringData)
          )
        })
        .map((x) => ({
          name: formatRecord(x),
          value: x
        }))
    const questions = [
      {
        message: 'What do you want to do?',
        name: 'accounts',
        type: 'checkbox',
        choices: getChoices,
        pageSize: 50
      },
      {
        message: 'Do you want the next page?',
        name: 'nextPage',
        type: 'confirm',
        default: false
      }
    ]

    const { accounts, nextPage } = await inquirer.prompt(questions)
    input = [...input, ...accounts]
    return nextPage ? recursiveSearchQuery(page + 1, input) : input
  }

  if (!query) {
    query = await getQuery(query)
  }

  const searchQuery = await recursiveSearchQuery()

  const converted = []

  for await (const item of searchQuery) {
    const newData = await convertSocialData(item, options)
    if (newData) converted.push(newData)
  }

  return converted
}

export const getTwitterUser = async (options = {}) => {
  const query = await getQuery()
  const userData = await getUser(query, /^\d+$/.test(query))
  const converted = await convertSocialData(userData, options)
  return converted ? [converted] : []
}
