const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    theme: 'dark',
    totalStudentCount: 0,
    studentCount: 0,
    pendingBindingsCount: 0,
    oneOnOneCount: 0,
    groupClassCount: 0,
    pendingApplicationsCount: 0,
    todayScheduleCount: 0,
    weekScheduleCount: 0
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

  formatDateStr(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  async loadManagementStats() {
    const teacherId = app.globalData.openid
    if (!teacherId) return

    wx.showNavigationBarLoading()

    const today = new Date()
    const todayStr = this.formatDateStr(today)
    const dayOfWeek = today.getDay()
    const offsetToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offsetToMonday)
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
    const startDate = this.formatDateStr(weekStart)
    const endDate = this.formatDateStr(weekEnd)

    try {
      const [students, courses, pendingBindings, pendingApplications, weekSchedules] = await Promise.all([
        api.getStudents(teacherId).catch(() => []),
        api.getCourses(teacherId).catch(() => []),
        api.getPendingBindings(teacherId).catch(() => []),
        api.getPendingApplications(teacherId).catch(() => []),
        api.getSchedule(teacherId, { startDate, endDate }).catch(() => [])
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

      const schedules = weekSchedules || []
      const todayScheduleCount = schedules.filter(s => s && s.schedule && s.schedule.date === todayStr).length

      this.setData({
        totalStudentCount: (students || []).length,
        studentCount: approvedStudents.length,
        pendingBindingsCount: (pendingBindings || []).length,
        oneOnOneCount,
        groupClassCount,
        pendingApplicationsCount: (pendingApplications || []).length,
        todayScheduleCount,
        weekScheduleCount: schedules.length
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
