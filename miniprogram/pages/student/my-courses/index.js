const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    courses: [],
    emptyText: '暂无已选课程'
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
    const studentId = app.globalData.openid
    const coursesRes = await api.getMyCourses(studentId)

    if (coursesRes) {
      const courses = coursesRes.map(course => {
        const isCreatedByStudent = course.creatorRole === 'student' || course.createdBy === studentId
        return {
          ...course,
          name: isCreatedByStudent ? (course.name || course.courseName || '') : ((course.teacherName || '教师') + '的课程'),
          scheduleStr: this.formatSchedule(course.schedule)
        }
      })

      this.setData({
        courses
      })
    }
  },

  formatSchedule(schedule) {
    if (!schedule) return '时间待定'
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `${days[schedule.dayOfWeek] || ''} ${schedule.startTime || ''} - ${schedule.endTime || ''}`
  },

  onAddCourse() {
    wx.navigateTo({
      url: '/pages/student/courses/add'
    })
  },

  goToCourseDetail(e) {
    const courseId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/student/courses/detail?id=${courseId}`
    })
  }
})