Component({
  properties: {
    active: {
      type: String,
      value: 'home'
    }
  },
  methods: {
    switchTab(e) {
      const path = e.currentTarget.dataset.path
      wx.redirectTo({
        url: path
      })
    }
  }
})
