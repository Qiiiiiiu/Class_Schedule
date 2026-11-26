Component({
  properties: {
    active: {
      type: String,
      value: 'home'
    },
    theme: {
      type: String,
      value: ''
    }
  },
  data: {
    currentTheme: 'dark'
  },
  lifetimes: {
    attached() {
      this.syncTheme()
    }
  },
  pageLifetimes: {
    show() {
      this.syncTheme()
    }
  },
  observers: {
    theme(val) {
      if (val) {
        this.setData({ currentTheme: val })
      }
    }
  },
  methods: {
    syncTheme() {
      const app = getApp()
      const theme = this.data.theme || (app && app.globalData && app.globalData.theme) || 'dark'
      this.setData({ currentTheme: theme })
    },
    switchTab(e) {
      const path = e.currentTarget.dataset.path
      if (!path) return
      if (path === '/pages/common/my-info/index') {
        wx.switchTab({
          url: path,
          fail: () => wx.reLaunch({ url: path })
        })
        return
      }
      wx.redirectTo({
        url: path
      })
    }
  }
})
