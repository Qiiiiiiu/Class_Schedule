const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

const EMPTY_TEXTS = {
  pending: '暂无待审核的绑定申请',
  approved: '暂无已绑定的学生',
  rejected: '暂无已拒绝的申请'
}

Page({
  data: {
    theme: 'dark',
    currentTab: 'pending',
    pendingList: [],
    approvedList: [],
    rejectedList: [],
    pendingCount: 0,
    emptyText: EMPTY_TEXTS.pending
  },

  onLoad() {
    if (!checkRole.checkTeacher()) {
      return
    }
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)
    this.loadBindings()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      currentTab: tab,
      emptyText: EMPTY_TEXTS[tab] || EMPTY_TEXTS.pending
    })
  },

  async loadBindings() {
    const teacherId = app.globalData.openid
    const res = await api.getStudents(teacherId)

    if (res) {
      const pending = []
      const approved = []
      const rejected = []

      res.forEach(item => {
        // 教师手动添加的未绑定学生（unbound）不属于绑定审核列表，不应归为“已拒绝”
        if (item.status === 'unbound') {
          return
        }

        const formatted = {
          ...item,
          applyTimeStr: this.formatTime(item.applyTime),
          statusStr: item.status === 'approved' ? '已绑定' : item.status === 'pending' ? '待审核' : '已拒绝'
        }

        if (item.status === 'pending') {
          pending.push(formatted)
        } else if (item.status === 'approved') {
          approved.push(formatted)
        } else if (item.status === 'rejected') {
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
      title: `拒绝 ${item.studentName || '该学生'} 的申请`,
      content: '',
      editable: true,
      placeholderText: '请输入拒绝原因（选填）',
      success: async (res) => {
        if (res.confirm) {
          const remark = (res.content || '').trim()
          const result = await api.rejectBinding(item._id, app.globalData.openid, remark)
          if (result) {
            wx.showToast({
              title: '已拒绝',
              icon: 'success'
            })
            if (typeof app.clearCache === 'function') {
              app.clearCache()
            }
            this.loadBindings()
          }
        }
      }
    })
  }
})