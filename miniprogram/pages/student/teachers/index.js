const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    currentTab: 'teachers',
    boundTeachers: [],
    applications: [],
    bindCode: '',
    pendingCount: 0
  },

  onLoad(options) {
    if (!checkRole.checkStudent()) {
      return
    }

    if (options.tab === 'applications') {
      this.setData({ currentTab: 'applications' })
    }
  },

  onShow() {
    if (!checkRole.checkStudent()) {
      return
    }
    this.loadData()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  async loadData() {
    await Promise.all([
      this.loadBoundTeachers(),
      this.loadApplications()
    ])
  },

  async loadBoundTeachers() {
    const studentId = app.globalData.openid
    const res = await api.getTeachers(studentId)

    if (res) {
      const boundTeachers = res.filter(t => t.bindingStatus === 'approved')
      const teachers = boundTeachers.map(item => ({
        _id: item._id,
        teacherId: item.teacherId || item.openid,
        teacherName: item.teacherName || item.name,
        teacherAvatar: item.teacherAvatar || '',
        phone: item.phone || '',
        subject: item.subject || ''
      }))

      this.setData({
        boundTeachers: teachers,
        pendingCount: res.filter(t => t.bindingStatus === 'pending').length
      })
    }
  },

  getStatusStr(status) {
    const strs = {
      approved: '已通过',
      pending: '待处理',
      rejected: '已拒绝'
    }
    return strs[status] || '未知'
  },

  async loadApplications() {
    const studentId = app.globalData.openid
    const res = await api.getMyApplications(studentId)

    if (res) {
      const applications = res.map(item => ({
        ...item,
        applyTimeStr: this.formatTime(item.applyTime),
        statusStr: this.getStatusStr(item.status)
      }))

      this.setData({ applications })
    }
  },

  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  onBindCodeInput(e) {
    this.setData({ bindCode: e.detail.value })
  },

  async onVerifyBindCode() {
    const { bindCode } = this.data

    if (!bindCode || bindCode.length !== 6) {
      wx.showToast({
        title: '请输入6位绑定码',
        icon: 'none'
      })
      return
    }

    const studentId = app.globalData.openid
    const studentName = app.globalData.userInfo ? app.globalData.userInfo.name : ''

    const result = await api.verifyBindCode(studentId, studentName, bindCode)

    if (result) {
      wx.showToast({
        title: '绑定成功',
        icon: 'success'
      })
      this.setData({ bindCode: '' })
      this.loadData()
    }
  }
})
