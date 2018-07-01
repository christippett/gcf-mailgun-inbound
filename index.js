'use strict';

const debug = require('@google-cloud/debug-agent').start({allowExpressions: true});
const path = require('path');
const os = require('os');
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const Busboy = require('busboy');
const Storage = require('@google-cloud/storage');
const Datastore = require('@google-cloud/datastore');

class EmailProcessor {
    constructor(options) {
        this.entityType = options.entityType;
        this.bucketName = options.bucketName;
        this.datastore = new Datastore();
        this.storage = new Storage();
        this.fields = {};
        this.uploads = {};
    }

    handleRequest(req, res) {
        const busboy = new Busboy({headers: req.headers});
        busboy.on('field', this.processField.bind(this)); // Process each field
        busboy.on('file', this.processFile.bind(this)); // Process each file uploaded
        busboy.on('finish', () => this.saveEmail.bind(this)()
            .then((entityId) => res.send(`Email received and processed successfully: ${entityId}`))
            .catch(() => res.status(500).send({error: 'Something blew up!'}))
        );

        // Workaround to support req.rawBody not being available in the emulator
        // https://github.com/GoogleCloudPlatform/cloud-functions-emulator/issues/161#issuecomment-376563784
        if (req.rawBody) {
            busboy.end(req.rawBody);
        } else {
            req.pipe(busboy);
        }
    }

    processField(fieldname, val) {
        // TODO(developer): Process submitted field values here
        console.log(`Processed field ${fieldname}: ${val}.`);
        if (['timestamp', 'attachment-count'].indexOf(fieldname) > -1) {
            val = parseInt(val);
        }
        this.fields[fieldname] = val;
    }

    processFile(fieldname, file, filename) {
        // Note: os.tmpdir() points to an in-memory file system on GCF
        // Thus, any files in it must fit in the instance's memory.
        console.log(`Processed file ${filename}`);
        const tmpdir = os.tmpdir();
        const filepath = path.join(tmpdir, filename);
        this.uploads[fieldname] = filepath;
        file.pipe(fs.createWriteStream(filepath));
    }

    storeEmail(key, fields) {
        const includeFields = [
            'recipient', 'sender', 'from', 'subject', 'body-plain', 'stripped-text',
            'stripped-signature', 'body-html', 'stripped-html', 'attachment-count',
            'timestamp', 'token', 'signature', 'message-headers', 'content-id-map',
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
                console.log(`InboundEmail saved to Datastore with key: ${key.path[1]}`);
                return data;
            })
            .catch((err) => console.error('Error saving InboundEmail:', err));
    }

    storeFiles(key, fields, uploads) {
        const prefix = [fields['recipient'], key];
        const uploadTasks = [];
        const bucketName = this.bucketName;
        for (const name in uploads) {
            if (uploads.hasOwnProperty(name)) {
                const file = uploads[name];
                const destination = prefix.join('/') + '/' + path.basename(file);
                uploadTasks.push(this.storage
                    .bucket(bucketName)
                    .upload(file, {destination})
                    .then(() => {
                        let gcsPath = `gs://${bucketName}/${destination}`;
                        console.log(`${file} uploaded to ${gcsPath}.`);
                        fs.unlinkSync(file); // delete temp file
                        return gcsPath;
                    })
                    .catch((err) => console.error(`Error uploading ${file} to gs://${bucketName}/${destination}:`, err))
                );
            }
        };
        return Promise.all(uploadTasks);
    }

    saveEmail() {
        const key = this.datastore.key(['InboundEmail', uuidv4()]);
        const storeEmail = this.storeEmail(key, this.fields);
        const storeFiles = this.storeFiles(key, this.fields, this.uploads);
        // const publishMessage = this.publishMessage();
        return Promise.all([storeEmail, storeFiles])
            .then((data, gcsUploadPaths) => {
                if (gcsUploadPaths) {
                    const emailEntity = data[0];
                    return this.datastore.save({key, data: emailEntity})
                        .then(() => console.log('Updated InboundEmail with path of uploaded attachment(s)'));
                }
            })
            .then(() => key.path[1])
            .catch((err) => console.error('ERROR:', err));
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
        const emailProcessor = new EmailProcessor({
            entityType: 'InboundEmail',
            bucketName: 'aeroster-inbound-email-attachments',
        });
        emailProcessor.handleRequest(req, res);
    } else {
        // Return a "method not allowed" error
        debugReady.then(() => res.status(405).end());
    }
};
// [END functions_mailgun_inbound_email]
