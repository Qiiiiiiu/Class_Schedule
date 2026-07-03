const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    boundTeachers: [],
    bindCode: ''
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
    this.loadData()
  },

  async loadData() {
    await this.loadBoundTeachers()
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
        boundTeachers: teachers
      })
    }
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
