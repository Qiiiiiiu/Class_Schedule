const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    userInfo: null,
    stats: {
      teacherCount: 0,
      courseCount: 0,
      pendingApplications: 0,
      myPendingApplications: 0
    },
    todayCourses: []
  },

  onLoad() {
    if (!checkRole.checkStudent()) {
      return
    }
    this.setData({
      userInfo: app.globalData.userInfo
    })
  },

  onShow() {
    if (!checkRole.checkStudent()) {
      return
    }
    this.setData({
      userInfo: app.globalData.userInfo
    })
    this.loadStats()
  },

  async loadStats() {
    const studentId = app.globalData.openid

    const [teachersRes, coursesRes] = await Promise.all([
      api.getTeachers(studentId),
      api.getMyCourses(studentId)
    ])

    const teacherCount = teachersRes ? teachersRes.filter(t => t.status === 'approved').length : 0
    const courseCount = coursesRes ? coursesRes.length : 0

    const todayCourses = this.getTodayCourses(coursesRes || [])

    this.setData({
      stats: {
        teacherCount,
        courseCount
      },
      todayCourses
    })
  },

  getTodayCourses(courses) {
    const today = new Date().getDay()
    return courses.filter(course => {
      return course.schedule && course.schedule.dayOfWeek === today
    }).map(course => ({
      ...course,
      teacherName: course.teacherName || '未知教师'
    }))
  },

  goToTeachers() {
    wx.redirectTo({
      url: '/pages/student/teachers/index'
    })
  },

  goToMyCourses() {
    wx.redirectTo({
      url: '/pages/student/my-courses/index'
    })
  }
})
