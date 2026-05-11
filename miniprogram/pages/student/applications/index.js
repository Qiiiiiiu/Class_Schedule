const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    currentTab: 'pending',
    applications: [],
    pendingList: [],
    approvedList: [],
    rejectedList: []
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
    this.loadApplications()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  get currentList() {
    const tab = this.data.currentTab
    if (tab === 'pending') return this.data.pendingList
    if (tab === 'approved') return this.data.approvedList
    return this.data.rejectedList
  },

  get emptyText() {
    const texts = {
      pending: '暂无待处理的申请',
      approved: '暂无已通过的申请',
      rejected: '暂无已拒绝的申请'
    }
    return texts[this.data.currentTab]
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