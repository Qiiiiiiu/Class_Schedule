const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

function getSavedTheme() {
  try {
    return (app && app.globalData && app.globalData.theme) || wx.getStorageSync('theme') || 'dark'
  } catch (e) {
    return 'dark'
  }
}

Page({
  data: {
    userInfo: null,
    createTime: '',
    theme: getSavedTheme(),
    showEditModal: false,
    newName: ''
  },

  formatCreateTime(userInfo) {
    if (!userInfo || !userInfo.createTime) return ''
    const date = new Date(userInfo.createTime)
    if (isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  onLoad() {
    const theme = app.globalData.theme || 'dark'
    const userInfo = app.globalData.userInfo || {}
    app.applyThemeToSystem(theme)
    this.setData({
      theme,
      userInfo,
      createTime: this.formatCreateTime(userInfo)
    })
  },

  onShow() {
    if (!checkRole.checkLogin()) {
      return
    }
    const theme = app.globalData.theme || 'dark'
    const userInfo = app.globalData.userInfo || {}
    const patch = {
      userInfo,
      createTime: this.formatCreateTime(userInfo)
    }
    if (this.data.theme !== theme) {
      patch.theme = theme
    }
    this.setData(patch)
    app.applyThemeToSystem(theme)
  },

  initUserInfo() {
    const userInfo = app.globalData.userInfo || {}
    this.setData({
      userInfo,
      createTime: this.formatCreateTime(userInfo)
    })
  },

  // 切换主题
  onThemeChange(e) {
    const theme = e.detail.value ? 'dark' : 'light'
    this.setData({ theme })
    app.setTheme(theme)
  },

  // 显示修改姓名弹窗
  showEditNameModal() {
    this.setData({
      showEditModal: true,
      newName: this.data.userInfo.name || ''
    })
  },

  // 关闭修改姓名弹窗
  hideEditModal() {
    this.setData({
      showEditModal: false
    })
  },

  preventTouchMove() {},

  // 输入新姓名
  onNewNameInput(e) {
    this.setData({
      newName: e.detail.value.trim()
    })
  },

  // 保存姓名
  async onSaveName() {
    const { newName, userInfo } = this.data
    if (!newName) {
      wx.showToast({
        title: '姓名不能为空',
        icon: 'none'
      })
      return
    }

    if (newName === userInfo.name) {
      this.hideEditModal()
      return
    }

    wx.showLoading({
      title: '正在保存...',
      mask: true
    })

    try {
      const res = await api.updateUserInfo(userInfo.openid || app.globalData.openid, newName)
      wx.hideLoading()

      if (res) {
        // 更新全局及页面用户信息
        app.globalData.userInfo = res
        this.setData({
          userInfo: res,
          showEditModal: false
        })
        
        // 通知其他页面刷新数据
        app.globalData.refreshSchedule = true

        wx.showToast({
          title: '修改成功',
          icon: 'success'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('修改姓名失败:', err)
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      })
    }
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('loggedOut', true)
          app.globalData.openid = null
          app.globalData.userInfo = null
          if (typeof app.clearCache === 'function') {
            app.clearCache()
          }
          wx.reLaunch({
            url: '/pages/common/login/index?from=logout'
          })
        }
      }
    })
  }
})