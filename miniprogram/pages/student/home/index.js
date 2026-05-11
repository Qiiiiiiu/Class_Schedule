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

    const [teachersRes, coursesRes, myAppsRes] = await Promise.all([
      api.getTeachers(studentId),
      api.getMyCourses(studentId),
      api.getMyApplications(studentId)
    ])

    const teacherCount = teachersRes ? teachersRes.filter(t => t.bindingStatus === 'approved').length : 0
    const courseCount = coursesRes ? coursesRes.length : 0
    const myPendingApplications = myAppsRes ? myAppsRes.filter(a => a.status === 'pending').length : 0

    let pendingApplications = 0
    const teachersRes2 = await api.getTeachers(studentId)
    if (teachersRes2) {
      pendingApplications = teachersRes2.filter(t => t.bindingStatus === 'pending').length
    }

    const todayCourses = this.getTodayCourses(coursesRes || [])

    this.setData({
      stats: {
        teacherCount,
        courseCount,
        pendingApplications,
        myPendingApplications
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
    wx.navigateTo({
      url: '/pages/student/teachers/index'
    })
  },

  goToMyCourses() {
    wx.navigateTo({
      url: '/pages/student/my-courses/index'
    })
  },

  goToApplications() {
    wx.navigateTo({
      url: '/pages/student/teachers/index?tab=applications'
    })
  },

  goToMyApplications() {
    wx.navigateTo({
      url: '/pages/student/applications/index'
    })
  }
})