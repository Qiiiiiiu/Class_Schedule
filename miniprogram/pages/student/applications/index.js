const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

const EMPTY_TEXTS = {
  pending: '暂无待处理的申请',
  approved: '暂无已通过的申请',
  rejected: '暂无已拒绝的申请'
}

Page({
  data: {
    theme: 'dark',
    currentTab: 'pending',
    applications: [],
    pendingList: [],
    approvedList: [],
    rejectedList: [],
    currentList: [],
    emptyText: EMPTY_TEXTS.pending
  },

  onLoad() {
    if (!checkRole.checkStudent()) {
      return
    }
  },

  onShow() {
    if (!checkRole.checkStudent()) {
      return
    }
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)
    this.loadApplications()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab }, () => {
      this.updateCurrentView()
    })
  },

  updateCurrentView() {
    const tab = this.data.currentTab
    const currentList = tab === 'pending'
      ? this.data.pendingList
      : tab === 'approved'
        ? this.data.approvedList
        : this.data.rejectedList
    this.setData({
      currentList,
      emptyText: EMPTY_TEXTS[tab] || EMPTY_TEXTS.pending
    })
  },

  async loadApplications() {
    const studentId = app.globalData.openid
    const res = await api.getMyApplications(studentId)

    if (res) {
      const pending = []
      const approved = []
      const rejected = []

      res.forEach(item => {
        const formatted = {
          ...item,
          applyTimeStr: this.formatTime(item.applyTime),
          statusStr: this.getStatusStr(item.status)
        }

        if (item.status === 'pending') {
          pending.push(formatted)
        } else if (item.status === 'approved') {
          approved.push(formatted)
        } else {
          rejected.push(formatted)
        }
      })

      this.setData({
        applications: res,
        pendingList: pending,
        approvedList: approved,
        rejectedList: rejected
      }, () => {
        this.updateCurrentView()
      })
    }
  },

  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  getStatusStr(status) {
    const strs = {
      pending: '待处理',
      approved: '已通过',
      rejected: '已拒绝'
    }
    return strs[status] || '未知'
  }
})