let cloudInstance = null
let dbInstance = null

function init() {
  if (cloudInstance) return cloudInstance
  
  try {
    cloudInstance = wx.cloud
    if (!cloudInstance) {
      console.error('wx.cloud is not available')
      return null
    }
    
    cloudInstance.init({
      env: 'cloudbase-3g9lbidb4b420308'
    })
    
    dbInstance = cloudInstance.database()
    return cloudInstance
  } catch (err) {
    console.error('Failed to init cloud:', err)
    return null
  }
}

function getCloud() {
  if (!cloudInstance) {
    init()
  }
  return cloudInstance
}

function getDB() {
  if (!dbInstance) {
    init()
  }
  return dbInstance
}

function callFunction(name, data = {}) {
  const c = getCloud()
  if (!c) {
    return Promise.reject(new Error('Cloud not initialized'))
  }
  return c.callFunction({
    name: name,
    data: data
  })
}

function collection(name) {
  const db = getDB()
  if (!db) {
    return null
  }
  return db.collection(name)
}

module.exports = {
  init,
  getCloud,
  getDB,
  callFunction,
  collection
}