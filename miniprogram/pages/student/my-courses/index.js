const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    currentTab: 'all',
    courses: [],
    displayCourses: [],
    applications: []
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

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    this.filterCourses()
  },

  async loadData() {
    const studentId = app.globalData.openid

    const [coursesRes, applicationsRes] = await Promise.all([
      api.getMyCourses(studentId),
      api.getMyApplications(studentId)
    ])

    if (coursesRes) {
      const courses = coursesRes.map(course => {
        const app = applicationsRes ? applicationsRes.find(a => a.courseId === course._id) : null
        return {
          ...course,
          scheduleStr: this.formatSchedule(course.schedule),
          applied: !!app,
          applicationStatus: app ? app.status : null
        }
      })

      this.setData({
        courses,
        displayCourses: courses,
        applications: applicationsRes || []
      })
    }
  },

  formatSchedule(schedule) {
    if (!schedule) return '时间待定'
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `${days[schedule.dayOfWeek] || ''} ${schedule.startTime || ''} - ${schedule.endTime || ''}`
  },

  filterCourses() {
    const tab = this.data.currentTab
    const courses = this.data.courses
    const today = new Date().getDay()

    let filtered = courses

    if (tab === 'today') {
      filtered = courses.filter(c => c.schedule && c.schedule.dayOfWeek === today)
    } else if (tab === 'week') {
      const weekDays = [today, ...Array.from({ length: 6 }, (_, i) => (today + i + 1) % 7)]
      filtered = courses.filter(c => c.schedule && weekDays.includes(c.schedule.dayOfWeek))
    }

    this.setData({ displayCourses: filtered })
  },

  get emptyText() {
    const texts = {
      all: '暂无已选课程',
      today: '今日暂无课程',
      week: '本周暂无课程'
    }
    return texts[this.data.currentTab]
  },

  async onApplyCourse(e) {
    const course = e.currentTarget.dataset.course

    const result = await api.applyCourse(
      course._id,
      app.globalData.openid,
      app.globalData.userInfo.name,
      course.name,
      course.teacherId,
      course.teacherName
    )

    if (result) {
      wx.showToast({
        title: '申请已发送',
        icon: 'success'
      })
      this.loadData()
    }
  }
})