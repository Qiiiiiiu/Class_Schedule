const app = getApp()

let isRedirecting = false

function redirectToLogin() {
  if (isRedirecting) return
  isRedirecting = true
  wx.showToast({
    title: '请先登录',
    icon: 'none'
  })
  setTimeout(() => {
    wx.reLaunch({
      url: '/pages/common/login/index',
      complete: () => {
        setTimeout(() => {
          isRedirecting = false
        }, 500)
      }
    })
  }, 800)
}

function redirectToRoleHome(role) {
  if (isRedirecting) return
  isRedirecting = true
  const done = () => {
    setTimeout(() => {
      isRedirecting = false
    }, 500)
  }
  if (role === 'teacher') {
    wx.switchTab({
      url: '/pages/teacher/home/index',
      fail: () => wx.reLaunch({ url: '/pages/teacher/home/index', complete: done }),
      success: done
    })
  } else {
    wx.reLaunch({
      url: '/pages/student/home/index',
      complete: done
    })
  }
}

function checkLogin() {
  if (!app.globalData.openid || !app.globalData.userInfo || !app.globalData.userInfo.role) {
    redirectToLogin()
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
    redirectToRoleHome(app.globalData.userInfo.role)
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
    redirectToRoleHome(app.globalData.userInfo.role)
    return false
  }
  return true
}

function requireTeacher(callback) {
  const ok = checkTeacher()
  if (callback) callback(ok)
}

function requireStudent(callback) {
  const ok = checkStudent()
  if (callback) callback(ok)
}

module.exports = {
  checkLogin,
  checkTeacher,
  checkStudent,
  requireTeacher,
  requireStudent
}