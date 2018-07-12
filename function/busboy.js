'use strict'

// Original author:
// https://github.com/atesgoral/busboy-promise

const path = require('path')
const os = require('os')
const fs = require('fs');
const Busboy = require('busboy')

module.exports = function (req, options) {
  return new Promise(function (resolve, reject) {
    const busboy = new Busboy(Object.assign({headers: req.headers}, options))
    const parts = {
      fields: {},
      files: {}
    }

    busboy.on('field', function (name, value) {
      parts.fields[name] = value
      console.log(`Processed field: ${name}`)
    })

    busboy.on('file', function (name, file, filename, encoding, mimeType) {
      // Note: os.tmpdir() points to an in-memory file system on GCF
      // Thus, any files in it must fit in the instance's memory.
      const tmpdir = os.tmpdir()
      const filepath = path.join(tmpdir, filename)
      file.pipe(fs.createWriteStream(filepath))
      parts.files[name] = {
        file: filepath,
        filename: filename,
        encoding: encoding,
        mimeType: mimeType
      }
      console.log(`Processed file: ${name}`)
    })

    busboy.on('finish', function () {
      console.log('Busboy finished!')
      resolve(parts)
    })

    busboy.on('error', function (err) {
      reject(err)
    })

    // Workaround to support req.rawBody not being available in cloud functions emulator
    // https://github.com/GoogleCloudPlatform/cloud-functions-emulator/issues/161#issuecomment-376563784
    if (req.rawBody) {
      busboy.end(req.rawBody)
    } else {
      req.pipe(busboy)
    }
  })
}
