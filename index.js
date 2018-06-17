'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const uuid = require(`uuid`);
const Busboy = require('busboy');
const Storage = require('@google-cloud/storage');

// [START functions_mailgun_inbound_email]
/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.mailgunInboundEmail = (req, res) => {
    if (req.method === 'POST') {
        const emailId = uuid()
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
            // Process email attachments, upload to GCS
            const prefix = [generateDate(), fields['sender'], emailId]
            processFiles(uploads, prefix);
            res.send();
        });

        req.pipe(busboy);

    } else {
        // Return a "method not allowed" error
        res.status(405).end();
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

function processFiles(files, prefix) {
    // Create storage client
    const storage = new Storage();
    const bucketName = 'aeroster-inbound-email-attachments';

    // Remove temp files
    for (const name in files) {
        const file = files[name];
        const destination = prefix.join('/') + '/' + path.basename(file)
        console.log(`File uploaded to ${file}`)
        // Uploads a local file to the bucket with the kms key
        storage
            .bucket(bucketName)
            .upload(file, { destination })
            .then(() => {
                console.log(`${file} uploaded to gs://${bucketName}/${destination}.`);
                fs.unlinkSync(file);
            })
            .catch(err => {
                console.error(`Error uploading ${file} to gs://${bucketName}/${destination}.`);
                console.error('ERROR:', err);
            });
    }
};