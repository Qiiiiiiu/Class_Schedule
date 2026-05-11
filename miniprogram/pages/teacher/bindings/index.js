const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    currentTab: 'pending',
    pendingList: [],
    approvedList: [],
    rejectedList: [],
    pendingCount: 0
  },

  onLoad() {
    if (!checkRole.checkTeacher()) {
      return
    }
    this.loadBindings()
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }
    this.loadBindings()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  getCurrentList() {
    const tab = this.data.currentTab
    if (tab === 'pending') return this.data.pendingList
    if (tab === 'approved') return this.data.approvedList
    return this.data.rejectedList
  },

  getEmptyText() {
    const texts = {
      pending: '暂无待审核的绑定申请',
      approved: '暂无已绑定的学生',
      rejected: '暂无已拒绝的申请'
    }
    return texts[this.data.currentTab]
  },

  async loadBindings() {
    const teacherId = app.globalData.openid
    const res = await api.getStudents(teacherId)

    if (res) {
      const pending = []
      const approved = []
      const rejected = []

      res.forEach(item => {
        const formatted = {
          ...item,
          applyTimeStr: this.formatTime(item.applyTime),
          statusStr: item.status === 'approved' ? '已绑定' : item.status === 'pending' ? '待审核' : '已拒绝'
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
        pendingList: pending,
        approvedList: approved,
        rejectedList: rejected,
        pendingCount: pending.length
      })
    }
  },

  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  async onApprove(e) {
    const item = e.currentTarget.dataset.item
    const result = await api.approveBinding(item._id, app.globalData.openid)
    if (result) {
      wx.showToast({
        title: '已通过',
        icon: 'success'
      })
      this.loadBindings()
    }
  },

  onReject(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: '拒绝申请',
      content: `确定拒绝${item.studentName}的绑定申请吗？`,
      inputPlaceholder: '请输入拒绝原因（选填）',
      success: async (res) => {
        if (res.confirm) {
          const result = await api.rejectBinding(item._id, app.globalData.openid, res.content || '')
          if (result) {
            wx.showToast({
              title: '已拒绝',
              icon: 'success'
            })
            this.loadBindings()
          }
        }
      }
    })
  }
})