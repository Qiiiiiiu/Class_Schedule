const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    theme: 'dark',
    studentCount: 0,
    pendingBindingsCount: 0,
    oneOnOneCount: 0,
    groupClassCount: 0,
    totalClassCount: 0,
    pendingApplicationsCount: 0
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
    this.loadManagementStats()
  },

  async loadManagementStats() {
    const teacherId = app.globalData.openid
    if (!teacherId) return

    wx.showNavigationBarLoading()

    try {
      const [students, courses, pendingBindings, pendingApplications] = await Promise.all([
        api.getStudents(teacherId).catch(() => []),
        api.getCourses(teacherId).catch(() => []),
        api.getPendingBindings(teacherId).catch(() => []),
        api.getPendingApplications(teacherId).catch(() => [])
      ])

      const approvedStudents = (students || []).filter(s => s.status === 'approved')
      let oneOnOneCount = 0
      let groupClassCount = 0

      ;(courses || []).forEach(c => {
        const classType = (c.classType === 'one_on_one' || c.classType === 'group')
          ? c.classType
          : (Array.isArray(c.students) && c.students.length > 1 ? 'group' : 'one_on_one')
        if (classType === 'group') groupClassCount++
        else oneOnOneCount++
      })

      this.setData({
        studentCount: approvedStudents.length,
        pendingBindingsCount: (pendingBindings || []).length,
        oneOnOneCount,
        groupClassCount,
        totalClassCount: (courses || []).length,
        pendingApplicationsCount: (pendingApplications || []).length
      })
    } catch (err) {
      console.error('Failed to load management stats:', err)
    } finally {
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
    }
  },

  onPullDownRefresh() {
    this.loadManagementStats()
  },

  navigateToClasses(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'all'
    wx.navigateTo({
      url: `/pages/teacher/courses/index?tab=${tab}`
    })
  },

  navigateToStudents() {
    wx.navigateTo({
      url: '/pages/teacher/students/index'
    })
  },

  navigateToBindings() {
    wx.navigateTo({
      url: '/pages/teacher/bindings/index'
    })
  },

  navigateToSchedule() {
    wx.navigateTo({
      url: '/pages/teacher/schedule/index'
    })
  }
})
