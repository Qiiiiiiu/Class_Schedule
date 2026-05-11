const wxBroker = require('./wxBroker.js')

const cloud = {
  init() {
    return wxBroker.getCloud()
  },

  initEnv() {
    return wxBroker.init()
  },

  database() {
    return wxBroker.getDB()
  },

  callFunction(name, data) {
    return wxBroker.callFunction(name, data)
  }
}

module.exports = cloud