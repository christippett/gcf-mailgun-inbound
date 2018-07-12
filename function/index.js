'use strict'

const debug = require('@google-cloud/debug-agent').start({allowExpressions: true})
const storage = require('@google-cloud/storage')()
const datastore = require('@google-cloud/datastore')()
const busboyPromise = require('./busboy.js')
const EmailProcessor = require('./email-processor.js')

// [START functions_mailgun_inbound_email]
/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.mailgunInboundEmail = (req, res) => {
  const debugReady = debug.isReady()
  if (req.method === 'POST') {

    const emailProcessor = new EmailProcessor({
      emailEntity: 'InboundEmail',
      attachmentEntity: 'InboundEmailAttachment',
      bucketName: 'aeroster-inbound-email-attachments',
      datastore,
      storage
    })

    const processRequest = busboyPromise(req)
      .then(function (parts) {
        const objectPrefix = [parts.fields['recipient'], emailProcessor.key.path[1]]
        const saveMessage = emailProcessor.saveMessage(parts.fields, objectPrefix)
        const saveAttachments = emailProcessor.saveAttachments(parts.files, objectPrefix)
        return Promise.all([saveMessage, saveAttachments])
      })
      .catch((err) => console.error(err))

    Promise.all([processRequest, debugReady])
      .then(() => res.send(`Email received and processed successfully: ${emailProcessor.key.path[1]}`))
      .catch((err) => res.status(500).send(err))

  } else {
    // Return a "method not allowed" error
    debugReady.then(() => res.status(405).end())
  }
}
// [END functions_mailgun_inbound_email]
