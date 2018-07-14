import test from 'ava'
import {filterProperties, convertTimestampToDate} from '../function/utils.js'

test('can filter object properties using whitelist of fields', (t) => {
  const propertyWhitelist = ['a', 'b']
  const obj = filterProperties({'a': 'aaa', 'b': 'bbb', 'c': 'ccc'}, propertyWhitelist)
  const expectedObj = {'a': 'aaa', 'b': 'bbb'}
  t.deepEqual(obj, expectedObj)
})

test('can convert integer timestamp to date object', (t) => {
  const timestamp = 1531499400 // 13/07/2018 @ 4:30pm (UTC)
  const date = convertTimestampToDate(timestamp)
  const expectedDate = new Date('2018-07-13T16:30:00Z')
  t.deepEqual(date, expectedDate)
})

