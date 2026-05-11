const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    currentTab: 'courses',
    courses: [],
    applications: [],
    pendingCount: 0
  },

  onLoad(options) {
    if (!checkRole.checkTeacher()) {
      return
    }

    if (options.tab === 'applications') {
      this.setData({ currentTab: 'applications' })
    }

    this.loadCourses()
    this.loadApplications()
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }

    this.loadCourses()
    this.loadApplications()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  async loadCourses() {
    const teacherId = app.globalData.openid
    const res = await api.getCourses(teacherId)

    if (res) {
      const coursesWithChildCount = await Promise.all(res.map(async (item) => {
        const childCourses = await api.getCourseSchedules(item._id)
        return {
          ...item,
          scheduleStr: this.formatSchedule(item),
          studentCount: item.students ? item.students.length : 0,
          childCourseCount: childCourses ? childCourses.length : 0
        }
      }))

      this.setData({ courses: coursesWithChildCount })
    }
  },

  formatSchedule(course) {
    if (!course.schedule) return '未安排'

    const { schedule } = course
    const startTime = schedule.startTime || ''
    const endTime = schedule.endTime || ''
    const classroom = schedule.classroom || ''

    return `${startTime} - ${endTime} ${classroom}`.trim()
  },

  async loadApplications() {
    const teacherId = app.globalData.openid
    const res = await api.getPendingApplications(teacherId)

    if (res) {
      const applications = res.map(item => ({
        ...item,
        applyTimeStr: this.formatTime(item.applyTime)
      }))

      this.setData({
        applications,
        pendingCount: applications.length
      })
    }
  },

  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  },

  onAddCourse() {
    wx.navigateTo({
      url: '/pages/teacher/courses/add'
    })
  },

  onEditCourse(e) {
    const course = e.currentTarget.dataset.course
    const courseData = encodeURIComponent(JSON.stringify(course))
    wx.navigateTo({
      url: `/pages/teacher/courses/add?mode=edit&courseId=${course._id}&courseData=${courseData}`
    })
  },

  async onDeleteCourse(e) {
    const courseId = e.currentTarget.dataset.courseId

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这门课程吗？',
      success: async (res) => {
        if (res.confirm) {
          const result = await api.deleteCourse(courseId, app.globalData.openid)
          if (result) {
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })
            this.loadCourses()
          }
        }
      }
    })
  },

  async onSendReminder(e) {
    const courseId = e.currentTarget.dataset.courseId
    const result = await api.sendReminder(courseId, app.globalData.openid)
    if (result) {
      wx.showToast({
        title: '提醒已发送',
        icon: 'success'
      })
    }
  },

  onAccept(e) {
    const applicationId = e.currentTarget.dataset.applicationId
    this.handleApplication(applicationId, 'accept')
  },

  onReject(e) {
    const applicationId = e.currentTarget.dataset.applicationId
    this.handleApplication(applicationId, 'reject')
  },

  async handleApplication(applicationId, action) {
    const result = await api.handleApplication(applicationId, action)
    if (result) {
      wx.showToast({
        title: action === 'accept' ? '已通过' : '已拒绝',
        icon: 'success'
      })
      this.loadApplications()
    }
  }
})