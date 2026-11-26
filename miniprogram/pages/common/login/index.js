const app = getApp()
const api = require('../../../utils/api.js')

// 请求超时时间（毫秒）
const REQUEST_TIMEOUT = 10000

Page({
  data: {
    name: '',
    phone: '',
    role: 'student',
    loading: false,
    showLoginForm: false,
    loginError: ''
  },

  onNameInput(e) {
    this.setData({
      name: e.detail.value,
      loginError: ''
    })
  },

  onRoleChange(e) {
    this.setData({
      role: e.detail.value
    })
  },

  // 带超时的Promise
  async withTimeout(promise, timeout = REQUEST_TIMEOUT) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('请求超时'))
      }, timeout)
    })
    return Promise.race([promise, timeoutPromise])
  },

  async onLogin() {
    const { name, role, phone } = this.data

    if (!name) {
      wx.showToast({
        title: '请输入姓名',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true, loginError: '' })

    try {
      // 带超时的登录请求
      const loginRes = await this.withTimeout(api.login())

      if (loginRes && loginRes.openid) {
        app.globalData.openid = loginRes.openid
        
        // 带超时的获取用户信息请求
        const userRes = await this.withTimeout(api.getUserInfo(loginRes.openid))
        
        if (userRes && userRes._id) {
          wx.removeStorageSync('loggedOut')
          app.globalData.userInfo = userRes
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
          
          setTimeout(() => {
            this.redirectToHome()
          }, 1000)
        } else {
          // 注册新用户
          const createRes = await this.withTimeout(api.callFunction('createUser', {
            openid: loginRes.openid,
            name: name,
            role: role,
            phone: phone || ''
          }))

          if (createRes && createRes._id) {
            wx.removeStorageSync('loggedOut')
            app.globalData.userInfo = createRes
            wx.showToast({
              title: '注册成功',
              icon: 'success'
            })

            setTimeout(() => {
              this.redirectToHome()
            }, 1000)
          } else {
            this.setData({ loginError: '注册失败，请重试' })
          }
        }
      } else {
        this.setData({ loginError: '获取用户信息失败' })
      }
    } catch (err) {
      console.error('Login error:', err)
      // 超时错误特殊处理
      if (err.message === '请求超时') {
        this.setData({ loginError: '网络请求超时，请检查网络后重试' })
      } else {
        this.setData({ loginError: '登录失败：' + (err.message || '未知错误') })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  onShow() {
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)
  },

  async onLoad(options = {}) {
    // 若用户主动退出登录（含杀进程重进），跳过自动登录并停留在登录表单
    const isLoggedOut = options.from === 'logout' || wx.getStorageSync('loggedOut') === true
    if (isLoggedOut) {
      this.setData({
        loading: false,
        showLoginForm: true,
        loginError: ''
      })
      return
    }

    // 先检查是否已有登录状态
    if (app.globalData.openid && app.globalData.userInfo) {
      wx.nextTick(() => {
        this.redirectToHome()
      })
      return
    }

    await this.attemptAutoLogin()
  },

  async attemptAutoLogin() {
    this.setData({ loading: true, loginError: '' })

    try {
      // 带超时的自动登录
      const loginRes = await this.withTimeout(api.login())

      if (loginRes && loginRes.openid) {
        app.globalData.openid = loginRes.openid
        
        const userRes = await this.withTimeout(api.getUserInfo(loginRes.openid))
        
        if (userRes && userRes._id) {
          wx.removeStorageSync('loggedOut')
          app.globalData.userInfo = userRes
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
          setTimeout(() => {
            this.redirectToHome()
          }, 1000)
        } else {
          // 新用户，显示注册表单
          this.setData({ showLoginForm: true })
        }
      } else {
        this.setData({ showLoginForm: true })
      }
    } catch (err) {
      console.error('Auto login error:', err)
      // 超时或其他错误，显示登录表单
      if (err.message === '请求超时') {
        this.setData({ loginError: '网络请求超时，请检查网络' })
      }
      this.setData({ showLoginForm: true })
    } finally {
      this.setData({ loading: false })
    }
  },

  redirectToHome() {
    if (!app.globalData.userInfo || !app.globalData.userInfo.role) {
      this.setData({ showLoginForm: true })
      return
    }
    
    if (app.globalData.userInfo.role === 'teacher') {
      wx.switchTab({
        url: '/pages/teacher/home/index',
        fail: () => {
          wx.reLaunch({
            url: '/pages/teacher/home/index'
          })
        }
      })
    } else {
      // 学生首页不是 tab 页，所以直接 reLaunch，不尝试 switchTab 以免抛出路由失败逻辑并引发竞态
      wx.reLaunch({
        url: '/pages/student/home/index'
      })
    }
  },

  // 重试登录
  retryLogin() {
    this.attemptAutoLogin()
  }
})
