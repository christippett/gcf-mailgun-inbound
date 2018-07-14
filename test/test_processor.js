import test from 'ava'
import sinon from 'sinon'
import EmailProcessor from '../function/processor.js'

test.beforeEach(t => {
  const config = {
    emailEntity: 'InboundEmail',
    attachmentEntity: 'InboundEmailAttachment',
    bucketName: 'inbound-email-attachments'
  }
  const datastore = {
    key: sinon.fake(function (path) {
      return {path: path}
    }),
    save: sinon.fake.resolves()
  }
  const storage = {
    bucket: sinon.fake()
  }
  t.context = {
    processor: new EmailProcessor(config, datastore, storage)
  }
})

test('message saved to datastore', (t) => {
  const fields = {recipient: 'bob@example.com'}
  t.context.processor.saveMessage(fields)
  const data = t.context.processor.datastore.save.firstCall.args[0].data
  t.deepEqual(data, fields)
})

test('message data cleansed before saving', (t) => {
  const fields = {
    recipient: 'bob@example.com',
    timestamp: '1531499400', // 13/07/2018 @ 4:30pm (UTC)
    'attachment-count': '2'
  }
  const expectedData = {
    recipient: 'bob@example.com',
    timestamp: 1531499400, // converted to integer
    date: new Date('2018-07-13T16:30:00Z'), // timestamp converted to Date
    'attachment-count': 2 // converted to integer
  }
  t.context.processor.saveMessage(fields)
  const data = t.context.processor.datastore.save.firstCall.args[0].data
  t.deepEqual(data, expectedData)
})
