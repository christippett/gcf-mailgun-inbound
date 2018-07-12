'use strict';

const debug = require('@google-cloud/debug-agent').start({allowExpressions: true});
const path = require('path');
const os = require('os');
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const Busboy = require('busboy');
const storage = require('@google-cloud/storage')();
const datastore = require('@google-cloud/datastore')();

class EmailProcessor {
    constructor(options) {
        this.emailEntityName = options.emailEntityName;
        this.attachmentEntityName = options.attachmentEntityName;
        this.bucketName = options.bucketName;
        this.datastore = options.datastore;
        this.storage = options.storage;
        this.fields = {};
        this.uploads = {};
    }

    processField(fieldname, val) {
        // TODO(developer): Process submitted field values here
        console.log(`Processed field: ${fieldname}`);
        if (['timestamp', 'attachment-count'].indexOf(fieldname) > -1) {
            val = parseInt(val);
        }
        this.fields[fieldname] = val;
    }

    processFile(fieldname, file, filename) {
        // Note: os.tmpdir() points to an in-memory file system on GCF
        // Thus, any files in it must fit in the instance's memory.
        console.log(`Processed file: ${filename}`);
        const tmpdir = os.tmpdir();
        const filepath = path.join(tmpdir, filename);
        this.uploads[fieldname] = filepath;
        file.pipe(fs.createWriteStream(filepath));
    }

    save() {
        const emailKey = this.datastore.key([this.emailEntityName, uuidv4()]);
        return this.storeFileObject(emailKey, this.fields, this.uploads)
            .then(() => this.createEmailEntity(emailKey, this.fields))
            .then(() => Promise.resolve(emailKey.path[1]));
    }

    createEmailEntity(key, fields) {
        // Include only parsed message fields
        // Refer: https://documentation.mailgun.com/en/latest/user_manual.html#parsed-messages-parameters
        const includeFields = [
            'recipient', 'sender', 'from', 'subject', 'body-plain', 'stripped-text',
            'stripped-signature', 'body-html', 'stripped-html', 'attachment-count',
            'timestamp', 'token', 'signature', 'message-headers', 'content-id-map',
            'attachments',
        ];
        const excludeFromIndexes = [
            'stripped-text',
            'stripped-html',
            'stripped-signature',
            'body-html',
            'body-plain',
            'message-headers',
            'content-id-map',
        ];
        const data = this._filterObjectProperties(fields, includeFields);
        data['date'] = this._convertTimestampToDate(data['timestamp']);
        return this.datastore.save({key, excludeFromIndexes, data})
            .then(() => {
                console.log(`${this.emailEntityName} saved to Datastore with key: ${key.path[1]}`);
                return data;
            })
            .catch((err) => {
                console.error(`Error saving ${this.emailEntityName}:`, err);
                return Promise.reject(err);
            });
    }

    createAttachmentEntity(emailKey, metadata) {
        const key = this.datastore.key(emailKey.path.concat(this.attachmentEntityName));
        const attachment = {
            key,
            data: {
                bucket: metadata.bucket,
                name: metadata.name,
                contentType: metadata.contentType,
                size: metadata.size,
                md5Hash: metadata.md5Hash,
            },
        };
        return this.datastore.save(attachment);
    }

    storeFileObject(emailKey, fields, uploads) {
        const prefix = [fields['recipient'], emailKey.path[1]];
        const uploadTasks = [];
        const bucketName = this.bucketName;
        const bucket = this.storage.bucket(bucketName);
        for (const name in uploads) {
            if (uploads.hasOwnProperty(name)) {
                const file = uploads[name];
                const fileName = path.basename(file);
                const destination = prefix.join('/') + '/' + fileName;
                uploadTasks.push(
                    bucket
                    .upload(file, {destination})
                        .then(() => {
                            let gcsPath = `gs://${bucketName}/${destination}`;
                            console.log(`Uploaded to ${gcsPath}.`);
                            fs.unlinkSync(file);
                            return Promise.resolve();
                        })
                        .then(() => bucket.file(destination).getMetadata())
                        .then((metadata) => this.createAttachmentEntity.bind(this)(emailKey, metadata[0]))
                        .catch((err) => {
                            console.error(`Error uploading file ${fileName}: `, err);
                            return Promise.reject(err);
                        })
                );
            }
        };
        return Promise.all(uploadTasks);
    }

    _filterObjectProperties(raw, filteredKeys) {
        return Object.keys(raw)
            .filter((key) => filteredKeys.includes(key))
            .reduce((obj, key) => {
                obj[key] = raw[key];
                return obj;
            }, {});
    }

    _convertTimestampToDate(timestamp) {
        let timestampAsDate = new Date(0);
        timestampAsDate.setUTCSeconds(timestamp);
        return timestampAsDate;
    }

    _generateDate() {
        const today = new Date();
        const dd = ('0' + today.getDate()).slice(-2);
        const mm = ('0' + (today.getMonth() + 1)).slice(-2); // January is 0!
        const yyyy = today.getFullYear();
        return `${yyyy}${mm}${dd}`;
    }
}

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
        const emailProcessed = new Promise((resolve) => {
            const emailProcessor = new EmailProcessor({
                emailEntityName: 'InboundEmail',
                attachmentEntityName: 'InboundEmailAttachment',
                bucketName: 'aeroster-inbound-email-attachments',
                datastore: datastore,
                storage: storage,
            });
            const busboy = new Busboy({headers: req.headers});
            busboy.on('field', emailProcessor.processField.bind(emailProcessor)); // Process each field
            busboy.on('file', emailProcessor.processFile.bind(emailProcessor)); // Process each file uploaded
            busboy.on('finish', () => {
                emailProcessor.save.bind(emailProcessor)()
                    .then((emailKey) => resolve(emailKey));
            });
            // Workaround to support req.rawBody not being available in the emulator
            // https://github.com/GoogleCloudPlatform/cloud-functions-emulator/issues/161#issuecomment-376563784
            if (req.rawBody) {
                busboy.end(req.rawBody);
            } else {
                req.pipe(busboy);
            }
        });
        Promise.all([emailProcessed, debugReady])
            .then((data) => res.send(`Email received and processed successfully: ${data[0]}`))
            .catch((err) => res.status(500).send(err));
    } else {
        // Return a "method not allowed" error
        debugReady.then(() => res.status(405).end());
    }
};
// [END functions_mailgun_inbound_email]
