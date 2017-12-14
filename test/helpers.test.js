import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import {
  getTime,
  trimLeadingSpace,
  nativeClone,
} from '../src/util'
import {
  mockChanges,
} from './util/test-util'
import {
  BuildMd,
  ChangeMessage,
} from '../src/helpers'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000

const data = {}

const loadData = () => {
  data.users = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/users.json')))
  data.tweets = JSON.parse(fs.readFileSync(path.join(__dirname, '/data/tweets-parsed.json')))
  data.yesterdayDate = getTime('2017-01-01', 'YYYY-MM-DD')
}

beforeAll(() => {
  loadData()
})

describe('BuildMd markdown generation class methods', () => {
  describe('generateMeta', () => {
    test('Generates metadata for markdown post', () => {
      const mockMeta = trimLeadingSpace(`---
            layout:     post
            title:      Tweets
            date:       2017-01-01
            summary:    These are the tweets for January 1, 2017.
            categories:
            ---\n\n`)
      expect(BuildMd.generateMeta(data.yesterdayDate)).toEqual(mockMeta)
    })
  })
})

describe('ChangeMessage (maintenance change message generator helper class)', () => {
  describe('Class methods', () => {
    describe('changeKeyTense', () => {
      test('Changes key tense for words not ending with \'d\'', () => {
        expect(ChangeMessage.changeKeyTense('delete')).toEqual('deleted')
        expect(ChangeMessage.changeKeyTense('want')).toEqual('wanted')
      })
      test('Changes key tense for words ending with \'dd\'', () => {
        expect(ChangeMessage.changeKeyTense('add')).toEqual('added')
      })
    })

    describe('wrapChangeData', () => {
      test('Wraps change data to lines of 72 characters max', () => {
        const wrappedChanges = 'Changed:\nmember 0, member 1, member 2, member 3, member 4, member 5, member 6,\nmember 7'
        expect(ChangeMessage.wrapChangeData(Array.from(Array(8)).map((x, i) => `member ${i}`), 'Changed:\n')).toEqual(wrappedChanges)
      })
    })

    describe('flattenChanges', () => {
      test('Flattens, sorts, and replaces keys', () => {
        const changesBuild = Object.assign(mockChanges(true), { list: { add: [1], remove: [1] } })
        const changesNoBuild = _.mapValues(mockChanges(false, true), (v) => {
          if (typeof v === 'object') {
            return _.mapValues(v, () => [1])
          }
          return v
        })

        const flattened = ChangeMessage.flattenChanges(changesBuild, { })
        const flattened2 = ChangeMessage.flattenChanges(changesNoBuild, { })

        expect(flattened).toHaveLength(2)
        expect(flattened.map(x => x[0])).toEqual(['accounts add', 'accounts remove'])
        expect(flattened2).toHaveLength(8)
        expect(flattened2.map(x => x[0]))
          .toEqual(['members add',
            'members remove',
            'members update',
            'accounts add',
            'accounts delete',
            'accounts rename',
            'accounts reactivate',
            'accounts deactivate'])
      })

      test('Omits keys and deleted accounts from removed members for commit', () => {
        let count = 0
        const changes = _.mapValues(mockChanges(false, true), (v) => {
          if (typeof v === 'object') {
            return _.mapValues(v, () => [1])
          }
          return v
        })

        changes.members.remove = [
          { id: { bioguide: '123' }, name: 'foo1' }, 
          { id: { bioguide: '1' }, name: 'foo' },
        ]
        changes.list.deleted = [
          { id: '1', bioguide: '1', name: 'foo' },
          { id: '3', bioguide: '3', name: 'foo1' },
          { id: '2', bioguide: '2', name: 'foo2' },
        ]
        const flattened = ChangeMessage.flattenChanges(changes, { isCommit: true })
        expect(flattened).toHaveLength(6)
        expect(flattened.map(x => x[0])).not.toContain('accounts reactivate')
        expect(flattened.map(x => x[0])).not.toContain('accounts deactivate')
        expect(flattened.find(x => x[0] === 'accounts delete')[1]).toHaveLength(2)
      })

      test('Tabulates flattened changes', () => {
        const changes = _.mapValues(mockChanges(false, true), (v) => {
          if (typeof v === 'object') {
            return _.mapValues(v, () => [1])
          }
          return v
        })
        const flattened = ChangeMessage.flattenChanges(changes, {})
        expect(flattened).toHaveProperty('count', 8)
      })
    })

    describe('stringifyChangeList', () => {
      test('Stringifies list post-build', () => {
        const changes = [
          ['accounts add', [{ screen_name: 'Twitter' }]],
          ['accounts remove',
            [
              { screen_name: 'Removed Twitter' },
              { screen_name: 'Removed Twitter' }]],
        ]
        const changeString = '\n\n1 account added\nTwitter\n\n2 accounts removed\nRemoved Twitter\nRemoved Twitter'
        expect(ChangeMessage
          .stringifyChangeList(
            changes,
            { postBuild: true },
          )).toEqual(changeString)
      })

      test('Stringifies list not in post-build', () => {
        const changes = [
          ['members add', [{ name: 'Person 2' }, { name: 'Person 1' }, { name: 'Person 3' }]],
          ['accounts add', [{ name: 'Person', screen_name: 'TwitterPerson', account_type: 'office' }]],
          ['accounts deactivated', [{ name: 'Person 9', screen_name: 'InactiveTwitterPerson', account_type: 'office' }]],
        ]
        const changeString = ['Members added:\nPerson 2, Person 1, Person 3', 'Accounts added:\nTwitterPerson (Person office)',
          'Accounts deactivated:\nInactiveTwitterPerson (Person 9 office)'].join('\n\n')
        expect(ChangeMessage.stringifyChangeList(changes, {})).toEqual(`\n\n${changeString}`)
      })
    })

    describe('createCommitMessage', () => {
      test('Converts change list with updated records to orderly short-ish commit message', () => {
        const changes = [
          ['accounts rename', [{ screen_name: 'Twitter', account_type: 'office', name: 'Person' }]],
          ['members add', [{ name: 'Person' }, { name: 'Person 2' }]],
          ['members remove', [{ name: 'Person' }]],
        ]
        expect(ChangeMessage.createCommitMessage(changes)).toEqual('Add Person & Person 2, remove Person, & update records')
      })
      test('Converts change list sans updated records to orderly short-ish commit message', () => {
        const changes = [
          ['members add', [{ name: 'Person' }]],
          ['members remove', [{ name: 'Person' }]],
          ['accounts add', [{ name: 'Person', account_type: 'office', screen_name: 'Twitter' }]],
        ]
        expect(ChangeMessage.createCommitMessage(changes)).toEqual('Add Person, remove Person, & add Person office account')
      })
    })

    describe('summarizeChanges', () => {
      test('Post-build', () => {
        expect(ChangeMessage.summarizeChanges({}, {}, { postBuild: true })).toEqual('Successful build')
      })
      test('Post build with store update', () => {
        expect(ChangeMessage.summarizeChanges({}, { storeUpdate: true }, { postBuild: true })).toEqual('Successful build\nStore updated')
      })
      test('New congress (more than 10 new/removed members) and isCommit flag enabled', () => {
        const changes = {}
        changes.members = {}
        changes.count = 11
        changes.members.add = Array.from(Array(5)).map((x, i) => ({
          name: `member ${i}`,
          chamber: x % 2 === 0 ? 'house' : 'senate',
        }))
        changes.members.remove = Array.from(Array(6)).map((x, i) => ({
          name: `member ${i}`,
          chamber: x % 2 === 0 ? 'house' : 'senate',
        }))
        const changeMsg = ChangeMessage.summarizeChanges({}, changes, { isCommit: true })
        expect(changeMsg).toEqual('Update datasets for new Congress')
      })
      test('Change count is greater than or equal to 10 and isCommit flag enabled', () => {
        const changes = {}
        changes.count = 11
        const changeMsg = ChangeMessage.summarizeChanges(changes, {}, { isCommit: true })
        expect(changeMsg).toEqual('Update user datasets')
      })
      test('Change count is less than 10 and isCommit flag enabled', () => {
        const changes = [
          ['members add', [{ name: 'Person1' }, { name: 'Person3' }]],
          ['members remove', [{ name: 'Person2' }]],
        ]
        changes.count = 3
        const changeMsg = ChangeMessage.summarizeChanges(changes, {}, { isCommit: true })
        expect(changeMsg).toEqual('Add Person1 & Person3, & remove Person2')
      })
      test('No changes and/or local development environment', () => {
        expect(ChangeMessage.summarizeChanges({}, {}, { isProd: true })).toEqual('Successful server maintenance process')
        expect(ChangeMessage.summarizeChanges({}, {}, { isProd: false })).toEqual('Successful local maintenance process')
      })
    })

    describe('create (change message generation)', () => {
      describe('No changes', () => {
        test('Post-build', () => {
          const changes = Object.assign(mockChanges(true), { count: 0 })
          expect(ChangeMessage.create(changes, { postBuild: true })).toEqual('Successful build')
        })
        test('Production env', () => {
          const changes = Object.assign(mockChanges(true), { count: 0 })
          const message = 'Successful server maintenance process'
          expect(ChangeMessage.create(changes, { isProd: true })).toEqual(message)
        })
        test('Local env', () => {
          const changes = Object.assign(mockChanges(true), { count: 0 })
          const message = 'Successful local maintenance process'
          expect(ChangeMessage.create(changes, { isProd: false })).toEqual(message)
        })
      })

      describe('Changes in production env', () => {
        let keyStrings
        beforeEach(() => {
          keyStrings = [
            'Accounts deactivated',
            'Accounts reactivated',
            'Accounts deleted',
            'Accounts renamed',
            'Members added',
            'Members removed',
            'Members updated',
            'Accounts added',
          ]
        })
        test('Prints serialized change list for commit', () => {
          const changes = Object.assign(mockChanges(false, true), { count: 6 })
          const mockAccount = [{
            id: '123',
            bioguide: '1',
            name: 'member 1',
            chamber: 'senate',
            screen_name: 'member1',
            account_type: 'office',
          }]

          const mockMember = [{
            id: { bioguide: '1' },
            name: 'member 1',
            chamber: 'senate',
          }]
          changes.list.renamed = nativeClone(mockAccount)
          changes.list.deleted = nativeClone(mockAccount)
          changes.list.deleted.push(Object.assign({}, mockAccount[0], { bioguide: '222', name: 'member 5' }))
          changes.social.add = []
          changes.social.add.push(Object.assign({}, mockAccount[0], { bioguide: '333', name: 'member 7' }))
          changes.members.remove = nativeClone(mockMember)
          changes.members.add = []
          changes.members.add.push(Object.assign({}, mockAccount[0], { bioguide: '444', name: 'member 2' }))
          changes.members.update = nativeClone(mockMember)

          const changeMsg = ChangeMessage.create(changes, { isCommit: true })
          expect(changeMsg.startsWith('Add member 2, remove member 1, add member 7 office account, delete member 5 office account, & update records')).toBeTruthy()
          expect(changeMsg.includes('member 1 office account')).toBeFalsy()
          expect(changeMsg.split('\n')).toHaveLength(19)
          expect(keyStrings.slice(2).every(keyString =>
            changeMsg.includes(`\n${keyString}:\nmember`) || changeMsg.includes(`\n${keyString}:\nmember`))).toBeTruthy()
        })

        test('Prints serialized change list for console', () => {
          const changes = Object.assign(mockChanges(false, true), { count: 8 })
          const mockAccount = [{
            name: 'member 1',
            chamber: 'senate',
            screen_name: 'member1',
            account_type: 'office',
          }]

          const mockMember = [{
            name: 'member 1',
            chamber: 'senate',
          }]
          changes.list.reactivated = nativeClone(mockAccount)
          changes.list.deactivated = nativeClone(mockAccount)
          changes.list.renamed = nativeClone(mockAccount)
          changes.list.deleted = nativeClone(mockAccount)
          changes.social.add = nativeClone(mockAccount)
          changes.members.remove = nativeClone(mockMember)
          changes.members.add = nativeClone(mockMember)
          changes.members.update = nativeClone(mockMember)

          const changeMsg = ChangeMessage.create(changes, { })
          expect(keyStrings.slice(2).every(keyString =>
            changeMsg.includes(`\n${keyString}:\nmember 1`) || changeMsg.includes(`\n${keyString}:\nmember1`))).toBeTruthy()
        })
      })

      describe('Post-build', () => {
        test('Store updated', () => {
          const changes = Object.assign(mockChanges(true), { count: 0 })
          changes.storeUpdate = true
          const changeMsg = ChangeMessage.create(changes, { postBuild: true })
          expect(changeMsg).toContain('Successful build')
          expect(changeMsg).toContain('Store updated')
        })
        test('List members added', () => {
          const changes = Object.assign(mockChanges(true), { count: 5 })
          changes.list.add = Array.from(Array(4)).map((x, i) => ({
            name: `member ${i}`,
            chamber: x % 2 === 0 ? 'house' : 'senate',
            screen_name: `member${i}`,
          }))
          const changeMsg = ChangeMessage.create(changes, { postBuild: true })
          expect(changeMsg.split('\n')).toHaveLength(7)
          expect(changeMsg).toContain('4 accounts added\n')
          expect(changeMsg).toContain('Successful build\n')
          expect(changeMsg).toContain('member0\n')
          expect(changeMsg).toContain('member3')
        })

        test('List members removed', () => {
          const changes = Object.assign(mockChanges(true), { count: 5 })
          changes.list.remove = Array.from(Array(4)).map((x, i) => ({
            name: `member ${i}`,
            chamber: x % 2 === 0 ? 'house' : 'senate',
            screen_name: `member${i}`,
          }))
          const changeMsg = ChangeMessage.create(changes, { postBuild: true })
          expect(changeMsg.split('\n')).toHaveLength(7)
          expect(changeMsg).toContain('4 accounts removed\n')
          expect(changeMsg).toContain('Successful build\n')
          expect(changeMsg).toContain('member0\n')
          expect(changeMsg).toContain('member3')
        })
      })

      describe('New congress — more than 10 new/removed members', () => {
        let changes
        beforeEach(() => {
          changes = mockChanges(false)
        })
        test('Prints', () => {
          changes.count = 11
          changes.members.add = Array.from(Array(5)).map((x, i) => ({
            name: `member ${i}`,
            chamber: x % 2 === 0 ? 'house' : 'senate',
          }))
          changes.members.remove = Array.from(Array(6)).map((x, i) => ({
            name: `member ${i}`,
            chamber: x % 2 === 0 ? 'house' : 'senate',
          }))
          const changeMsg = ChangeMessage.create(changes, { isCommit: true })
          expect(changeMsg).toContain('Update datasets for new Congress')
          expect(changeMsg.split('\n')).toHaveLength(7)
          expect(changeMsg).toContain('Members added:\nmember 0, member 1, member 2, member 3, member 4\n\n')
          expect(changeMsg).toContain('Members removed:\nmember 0, member 1, member 2, member 3, member 4, member 5')
        })
      })

      describe('Change count greater than 10 - not new congress', () => {
        test('Prints', () => {
          const changes = mockChanges(false, true)
          changes.count = 11
          changes.list.deleted = Array.from(Array(4)).map((x, i) => ({
            name: `member ${i}`,
            chamber: x % 2 === 0 ? 'house' : 'senate',
            screen_name: `member${i}`,
            account_type: 'office',
          }))
          changes.list.renamed = Array.from(Array(4)).map((x, i) => ({
            name: `member ${i}`,
            chamber: x % 2 === 0 ? 'house' : 'senate',
            screen_name: `member${i}`,
            account_type: 'office',
          }))
          changes.social.add = Array.from(Array(3)).map((x, i) => ({
            name: `member ${i}`,
            chamber: x % 2 === 0 ? 'house' : 'senate',
            screen_name: `member${i}`,
            account_type: 'office',
          }))
          const changeMsg = ChangeMessage.create(changes, { isCommit: true })
          expect(changeMsg.split('\n')).toHaveLength(13)
          expect(changeMsg).toContain('Update user datasets')
          expect(changeMsg).toContain('Accounts deleted:\nmember0 (member 0 office),')
          expect(changeMsg).toContain('Accounts renamed:\nmember0 (member 0 office),')
          expect(changeMsg).toContain('Accounts added:\nmember0 (member 0 office),')
        })
      })
    })
  })
})
