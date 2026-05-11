const app = getApp()
const api = require('../../../utils/api.js')

Page({
  data: {
    name: '',
    phone: '',
    role: 'student',
    loading: false
  },

  onNameInput(e) {
    this.setData({
      name: e.detail.value
    })
  },

  onPhoneInput(e) {
    this.setData({
      phone: e.detail.value
    })
  },

  onRoleChange(e) {
    this.setData({
      role: e.detail.value
    })
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

    this.setData({ loading: true })

    try {
      const loginRes = await api.login()

      if (loginRes && loginRes.openid) {
        app.globalData.openid = loginRes.openid
        
        const userRes = await api.getUserInfo(loginRes.openid)
        
        if (userRes && userRes._id) {
          app.globalData.userInfo = userRes
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
          
          setTimeout(() => {
            if (userRes.role === 'teacher') {
              wx.reLaunch({
                url: '/pages/teacher/home/index'
              })
            } else {
              wx.reLaunch({
                url: '/pages/student/home/index'
              })
            }
          }, 1500)
        } else {
          const createRes = await api.callFunction('createUser', {
            openid: loginRes.openid,
            name: name,
            role: role,
            phone: phone || ''
          })

          if (createRes && createRes._id) {
            app.globalData.userInfo = createRes
            wx.showToast({
              title: '注册成功',
              icon: 'success'
            })

            setTimeout(() => {
              if (role === 'teacher') {
                wx.reLaunch({
                  url: '/pages/teacher/home/index'
                })
              } else {
                wx.reLaunch({
                  url: '/pages/student/home/index'
                })
              }
            }, 1500)
          }
        }
      }
    } catch (err) {
      console.error('Login error:', err)
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onLoad() {
    if (app.globalData.openid && app.globalData.userInfo) {
      if (app.globalData.userInfo.role === 'teacher') {
        wx.switchTab({
          url: '/pages/teacher/home/index'
        })
      } else {
        wx.switchTab({
          url: '/pages/student/home/index'
        })
      }
    }
  }
})