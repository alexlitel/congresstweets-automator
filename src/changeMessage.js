import _ from 'lodash'
import wrap from 'word-wrap'

export const flattenChanges = (changes, { isCommit }) => {
  const flatChanges = _.chain(changes)
    .thru((obj) => {
      if (isCommit) {
        if (
          ['membersRemove', 'listDeleted'].every(
            (key) => obj[key] && obj[key].length
          )
        ) {
          const removeIds = obj.membersRemove.map((x) => x.id.bioguide)
          obj.listDeleted = obj.listDeleted.filter(
            (x) => !removeIds.includes(x.bioguide)
          )
        }
      }
      return obj
    })
    .pickBy((v, k) => {
      const isValidArr = typeof v === 'object' && v.length
      if (isCommit) return isValidArr && !k.includes('tivate')
      return isValidArr
    })
    .mapKeys((v, key) => {
      let keyString = key.replace('.', ' ').replace(/(social|list)/, 'accounts')
      keyString = keyString.replace(/ed$/, 'e')
      return keyString
    })
    .toPairs()
    .orderBy(
      ([key]) => [
        key.startsWith('members'),
        key.includes('add'),
        key.includes('remove'),
        key.startsWith('accounts'),
        key.includes('delete'),
        key.includes('rename'),
        key.includes('reactivate'),
      ],
      ['desc']
    )
    .value()
  flatChanges.count = Object.values(flatChanges).reduce(
    (p, c) => p + c[1].length,
    0
  )
  return flatChanges
}

export const wrapChangeData = (changeData, keyToString) => {
  return wrap(`${keyToString}${changeData.join(', ')}`, {
    width: 72,
    trim: true,
    indent: '',
  })
}

export const changeKeyTense = (key) => {
  if (!key.endsWith('d')) {
    return `${key}${key.endsWith('e') ? '' : 'e'}d`
  }
  return `${key}ed`
}

export const createCommitMessage = (flatChanges) => {
  const reduced = flatChanges
    .sort((a) => !/(add|delete|remove)/.test(a[0]))
    .reduce((p, [key, val], i, a) => {
      const isAddDelete = /(add|delete|remove)/.test(key)
      const keyString = isAddDelete
        ? `${key.split(' ').pop()} `
        : 'update records'
      // if (i === 0) keyString = _.capitalize(keyString)
      let mappedString
      if (isAddDelete) {
        const socOrList = key.includes('accounts')
        let changeData = val
          .map((x, j, a2) =>
            [
              j > 0 && j === a2.length - 1 ? '& ' : '',
              x.name || x,
              socOrList ? ` ${x.account_type}` : '',
            ].join('')
          )
          .join(val.length > 2 ? ', ' : ' ')
        if (socOrList) {
          changeData = `${changeData} account${val.length > 1 ? 's' : ''}`
        }
        mappedString = `${keyString}${changeData}`
      } else if (
        !p.includes('update records') &&
        !p.includes('Update records')
      ) {
        mappedString = keyString
      }
      if (mappedString) {
        p.push(mappedString)
      }
      // Code to handle weird edge case where updated records
      // wasn't appearing at the end of change messages
      if (i === a.length - 1) {
        if (i > 0) {
          if (p.includes('update records') || p.includes('Update records')) {
            p = p.filter((x) => !/(update records)/.test(x))
            p.push('update records')
          }
          p[p.length - 1] = `& ${p[p.length - 1]}`
        }
        p[0] = `${p[0][0].toUpperCase() + p[0].slice(1)}`
      }

      return p
    }, [])
  return reduced.join(', ')
}

export const summarizeChanges = (
  flatChanges,
  changes,
  { postBuild, isProd, isCommit }
) => {
  const message = []
  if (postBuild) {
    message.push('Successful build')
    if (changes.storeUpdate) message.push('Store updated')
  } else if (
    isCommit &&
    changes.members &&
    changes.members.add.concat(changes.members.remove).length > 10
  ) {
    message.push('Update datasets for new Congress')
  } else if (isCommit && flatChanges.count >= 10) {
    message.push('Update user datasets')
  } else if (isCommit && flatChanges.count && flatChanges.count < 10) {
    const line = createCommitMessage(flatChanges)
    message.push(line)
  } else {
    message.push(
      `Successful ${isProd ? 'server' : 'local'} maintenance process`
    )
  }
  return message.join('\n')
}

export const stringifyChangeList = (flatChanges, { postBuild }) => {
  const stringified = flatChanges
    .map(([key, val]) => {
      const changeData = val.map((x) => {
        if (postBuild) return x.screen_name || x
        if (key.includes('account'))
          return `${x.screen_name} (${x.name} ${x.account_type})`
        return x.name || x
      })
      let keyToString = postBuild ? key : _.capitalize(key)
      let newStr

      if (!keyToString.endsWith('d') || keyToString.endsWith('dd')) {
        keyToString = changeKeyTense(keyToString)
      }

      if (val.length === 1 && keyToString.includes('account')) {
        keyToString = keyToString.replace('accounts', 'account')
      }

      if (postBuild) {
        keyToString = `${changeData.length} ${keyToString}\n`
        newStr = `${keyToString}${changeData.join('\n')}`
      } else {
        keyToString = `${keyToString}:\n`
        newStr = wrapChangeData(changeData, keyToString)
      }

      return newStr
    })
    .join('\n\n')
  return `\n\n${stringified}`
}

export const createChangeMessage = (changes, options = {}) => {
  let changeString = ''
  const flatChanges = flattenChanges(changes, options)
  if (flatChanges.count) {
    changeString = stringifyChangeList(flatChanges, options)
  }
  const summary = summarizeChanges(flatChanges, changes, options)
  return `${summary}${changeString}`
}
