'use strict'

module.exports.filterProperties = function (raw, includedKeys) {
  return Object.keys(raw)
    .filter((key) => includedKeys.includes(key))
    .reduce((obj, key) => {
      obj[key] = raw[key]
      return obj
    }, {})
  }

module.exports.convertTimestampToDate = function (timestamp) {
  let timestampAsDate = new Date(0)
  timestampAsDate.setUTCSeconds(timestamp)
  return timestampAsDate
}

module.exports.generateDate = function () {
  const today = new Date()
  const dd = ('0' + today.getDate()).slice(-2)
  const mm = ('0' + (today.getMonth() + 1)).slice(-2) // January is 0!
  const yyyy = today.getFullYear()
  return `${yyyy}${mm}${dd}`
}
