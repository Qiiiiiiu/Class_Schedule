const app = getApp()
const checkRole = require('../../../utils/checkRole.js')

Page({
  data: {
    userInfo: null,
    createTime: ''
  },

  onLoad() {
    this.setData({
      userInfo: app.globalData.userInfo || {}
    })
    if (this.data.userInfo && this.data.userInfo.createTime) {
      const date = new Date(this.data.userInfo.createTime)
      this.setData({
        createTime: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      })
    }
  },

  onShow() {
    this.setData({
      userInfo: app.globalData.userInfo || {}
    })
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.openid = null
          app.globalData.userInfo = null
          wx.navigateTo({
            url: '/pages/common/login/index'
          })
        }
      }
    })
  }
})