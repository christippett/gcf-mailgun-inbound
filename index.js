'use strict';

const debug = require('@google-cloud/debug-agent').start({ allowExpressions: true });
const path = require('path');
const os = require('os');
const fs = require('fs');
const Busboy = require('busboy');
const Storage = require('@google-cloud/storage');
const Datastore = require('@google-cloud/datastore');

// [START functions_mailgun_inbound_email]
/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.mailgunInboundEmail = (req, res) => {
    const debugReady = debug.isReady();
    if (req.method === 'POST') {
        const tmpdir = os.tmpdir();
        const busboy = new Busboy({ headers: req.headers });

        // This object will accumulate all the fields, keyed by their name
        const fields = {};

        // This object will accumulate all the uploaded files, keyed by their name.
        const uploads = {};

        // This code will process each non-file field in the form.
        busboy.on('field', (fieldname, val) => {
            // TODO(developer): Process submitted field values here
            console.log(`Processed field ${fieldname}: ${val}.`);
            fields[fieldname] = val;
        });

        // This code will process each file uploaded.
        busboy.on('file', (fieldname, file, filename) => {
            // Note: os.tmpdir() points to an in-memory file system on GCF
            // Thus, any files in it must fit in the instance's memory.
            console.log(`Processed file ${filename}`);
            const filepath = path.join(tmpdir, filename);
            uploads[fieldname] = filepath;
            file.pipe(fs.createWriteStream(filepath));
        });

        // This event will be triggered after all uploaded files are saved.
        busboy.on('finish', () => {
            // Save InboundEmail to Datastore
            const saveEmail = processData(fields)
                .then(key => {
                    const prefix = [generateDate(), fields['recipient'], key.path[1]];
                    return processFiles(uploads, prefix);
                })
                .then(gcsUploadPaths => {
                    console.log(gcsUploadPaths);
                })
            Promise.all([saveEmail, debugReady]).then(() => res.send());
        });

        if (req.rawBody) {
            busboy.end(req.rawBody);
        }
        else {
            req.pipe(busboy);
        }

    } else {
        // Return a "method not allowed" error
        debugReady.then(() => res.status(405).end());
    }
};
// [END functions_mailgun_inbound_email]

function generateDate() {
    const today = new Date();
    const dd = ('0' + today.getDate()).slice(-2);
    const mm = ('0' + (today.getMonth() + 1)).slice(-2); //January is 0!
    const yyyy = today.getFullYear();
    return `${yyyy}${mm}${dd}`
}

function filterObjectProperties(raw, filteredKeys) {
    return Object.keys(raw)
    .filter(key => filteredKeys.includes(key))
    .reduce((obj, key) => {
      obj[key] = raw[key];
      return obj;
    }, {});
}

function processData(fields) {
    const datastore = new Datastore();
    const key = datastore.key(['InboundEmail']);
    const timestampAsDate = new Date(0);
    timestampAsDate.setUTCSeconds(fields['timestamp']);
    const includeFields = [
        'recipient', 'sender', 'from', 'subject', 'body-plain', 'stripped-text',
        'stripped-signature', 'body-html', 'stripped-html', 'attachment-count',
        'timestamp', 'token', 'signature', 'message-headers', 'content-id-map'
    ]
    const data = filterObjectProperties(fields, includeFields);
    data['timestamp'] = datastore.int(data['timestamp']);
    data['attachment-count'] = datastore.int(data['attachment-count']);
    data['date'] = timestampAsDate;
    const excludeFromIndexes = [
        'stripped-text',
        'stripped-html',
        'stripped-signature',
        'body-html',
        'body-plain',
        'message-headers',
        'content-id-map'
    ];
    return datastore.save({ key, excludeFromIndexes, data })
        .then(() => {
            console.log(`InboundEmail saved to Datastore with key: ${key.path[1]}`);
            return key;
        })
        .catch(err => {
            console.error('ERROR:', err);
        })
}

function processFiles(files, prefix) {
    // Create storage client
    const storage = new Storage();
    const bucketName = 'aeroster-inbound-email-attachments';
    const uploadTasks = [];

    // Remove temp files
    for (const name in files) {
        const file = files[name];
        const destination = prefix.join('/') + '/' + path.basename(file)
        console.log(`File uploaded to ${file}`)
        // Uploads a local file to the bucket with the kms key
        uploadTasks.push(storage
            .bucket(bucketName)
            .upload(file, { destination })
            .then(() => {
                let gcsPath = `gs://${bucketName}/${destination}`;
                console.log(`${file} uploaded to ${gcsPath}.`);
                fs.unlinkSync(file);
                return gcsPath;
            })
            .catch(err => {
                console.error(`Error uploading ${file} to gs://${bucketName}/${destination}.`);
                console.error('ERROR:', err);
            }));
    }
    return Promise.all(uploadTasks);
};