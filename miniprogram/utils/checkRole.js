const app = getApp()

function checkLogin() {
  if (!app.globalData.openid) {
    wx.showToast({
      title: '请先登录',
      icon: 'none'
    })
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/common/login/index'
      })
    }, 1500)
    return false
  }
  return true
}

function checkTeacher() {
  if (!checkLogin()) return false
  if (app.globalData.userInfo.role !== 'teacher') {
    wx.showToast({
      title: '您不是教师',
      icon: 'none'
    })
    return false
  }
  return true
}

function checkStudent() {
  if (!checkLogin()) return false
  if (app.globalData.userInfo.role !== 'student') {
    wx.showToast({
      title: '您不是学生',
      icon: 'none'
    })
    return false
  }
  return true
}

function requireTeacher(callback) {
  if (!checkLogin()) {
    if (callback) callback(false)
    return
  }
  if (app.globalData.userInfo.role !== 'teacher') {
    wx.showToast({
      title: '您不是教师',
      icon: 'none'
    })
    if (callback) callback(false)
    return
  }
  if (callback) callback(true)
}

function requireStudent(callback) {
  if (!checkLogin()) {
    if (callback) callback(false)
    return
  }
  if (app.globalData.userInfo.role !== 'student') {
    wx.showToast({
      title: '您不是学生',
      icon: 'none'
    })
    if (callback) callback(false)
    return
  }
  if (callback) callback(true)
}

module.exports = {
  checkLogin,
  checkTeacher,
  checkStudent,
  requireTeacher,
  requireStudent
}