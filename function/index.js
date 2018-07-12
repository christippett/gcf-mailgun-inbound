'use strict'

const storage = require('@google-cloud/storage')()
const datastore = require('@google-cloud/datastore')()
const EmailProcessor = require('./processor.js')
const config = {
  emailEntity: 'InboundEmail',
  attachmentEntity: 'InboundEmailAttachment',
  bucketName: 'aeroster-inbound-email-attachments'
}

// [START functions_mailgun_inbound_email]
/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.mailgunInboundEmail = (req, res) => {
  if (req.method === 'POST') {
    const emailProcessor = new EmailProcessor(config, datastore, storage)
    emailProcessor.handleRequest(req, res)
  } else {
    res.status(405).end()
  }
}
// [END functions_mailgun_inbound_email]
