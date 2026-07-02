const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    courses: []
  },

  onLoad() {
    if (!checkRole.checkTeacher()) {
      return
    }

    this.loadCourses()
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }

    this.loadCourses()
  },

  async loadCourses() {
    const now = Date.now()
    const cache = app.globalData.coursesCache

    if (cache && now - cache.timestamp < 30000) {
      this.setData({ courses: cache.data })
      return
    }

    try {
      const teacherId = app.globalData.openid

      let res = null
      try {
        res = await api.getCoursesWithStats(teacherId)
      } catch (err) {
        console.error('getCoursesWithStats 失败，使用降级方案:', err)
      }

      if (!res) {
        res = await api.getCourses(teacherId)
      }

      if (res && res.length > 0) {
        const now = new Date()

        const coursesWithAmount = await Promise.all(res.map(async (item) => {
          let childCourses = []
          try {
            childCourses = await api.getCourseSchedules(item._id) || []
          } catch (err) {
            console.error('获取子课程失败:', err)
          }

          const pricePerHour = item.price || 0
          let totalHours = 0
          let earnedHours = 0

          childCourses.forEach(child => {
            if (child.schedule && child.schedule.startTime && child.schedule.endTime) {
              const startTime = child.schedule.startTime
              const endTime = child.schedule.endTime
              const [startH, startM] = startTime.split(':').map(Number)
              const [endH, endM] = endTime.split(':').map(Number)
              const hours = (endH * 60 + endM - startH * 60 - startM) / 60

              totalHours += hours

              const courseDateStr = child.schedule.date
              if (courseDateStr) {
                const courseDateTime = new Date(`${courseDateStr}T${startTime}:00`)
                if (courseDateTime < now) {
                  earnedHours += hours
                }
              }
            }
          })


          return {
            ...item,
            studentCount: item.students ? item.students.length : 0,
            childCourseCount: childCourses.length,
            totalAmount: Math.round(totalHours * pricePerHour * 100) / 100,
            earnedAmount: Math.round(earnedHours * pricePerHour * 100) / 100
          }
        }))

        const coursesWithSchedule = coursesWithAmount.map(item => ({
          ...item,
          scheduleStr: this.formatSchedule(item)
        }))

        app.globalData.coursesCache = {
          data: coursesWithSchedule,
          timestamp: Date.now()
        }

        this.setData({ courses: coursesWithSchedule })
      }
    } catch (err) {
      console.error('loadCourses 失败:', err)
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

  async onReopenReminder() {
    wx.showLoading({ title: '开启中...' })
    try {
      const templateId = 'w223WKtyfXebjCpkNc2TbtczBuGuR4SUk2IRbMcRreU'
      const authResult = await new Promise((resolve) => {
        wx.requestSubscribeMessage({
          tmplIds: [templateId],
          success: (res) => {
            if (res[templateId] === 'accept') {
              resolve(true)
            } else {
              resolve(false)
            }
          },
          fail: () => {
            resolve(false)
          }
        })
      })

      if (!authResult) {
        wx.hideLoading()
        wx.showModal({
          title: '提示',
          content: '需要授权订阅消息才能收到课程提醒，请允许接收订阅消息',
          showCancel: false
        })
        return
      }

      const result = await api.clearTeacherReminderMarks(app.globalData.openid)

      wx.hideLoading()

      if (result) {
        wx.showToast({
          title: '提醒已重新开启',
          icon: 'success',
          duration: 2000
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('重新开启提醒失败:', err)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  onShowReminderInfo() {
    wx.showModal({
      title: '使用说明',
      content: '课程提醒为一次性订阅功能，为了让各位用户每节课都能收到提醒，建议密集上课时间里每天点击一次此按钮，用于重复订阅。',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})