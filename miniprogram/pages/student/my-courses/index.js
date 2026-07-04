const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    currentTab: 'schedule', // 'schedule' or 'list'
    courses: [], // 扁平课程列表
    emptyText: '暂无已选课程',
    selectedCourse: null,

    // 周课表字段
    weekLabel: '',
    currentWeekStart: null,
    weekDays: [],
    timeSlots: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'],
    courseColors: [
      { bg: 'rgba(59, 130, 246, 0.85)', text: '#ffffff' }, // 蓝色
      { bg: 'rgba(139, 92, 246, 0.85)', text: '#ffffff' }, // 紫色
      { bg: 'rgba(6, 182, 212, 0.85)', text: '#ffffff' },  // 青色
      { bg: 'rgba(16, 185, 129, 0.85)', text: '#ffffff' }, // 绿色
      { bg: 'rgba(245, 158, 11, 0.85)', text: '#ffffff' },  // 橙色
      { bg: 'rgba(236, 72, 153, 0.85)', text: '#ffffff' },  // 粉色
      { bg: 'rgba(239, 68, 68, 0.85)', text: '#ffffff' }    // 红色
    ]
  },

  onLoad() {
    if (!checkRole.checkStudent()) {
      return
    }
    this.initWeek()
  },

  onShow() {
    if (!checkRole.checkStudent()) {
      return
    }

    if (app.globalData.navigateWeekStart) {
      const weekStartDate = new Date(app.globalData.navigateWeekStart)
      if (!isNaN(weekStartDate.getTime())) {
        this.setData({ 
          currentWeekStart: weekStartDate,
          currentTab: 'schedule'
        })
        this.updateWeekLabel()
        this.generateWeekDays()
      }
      app.globalData.navigateWeekStart = null
    }

    this.loadData()
  },

  // 切换选项卡
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    this.loadData()
  },

  // 初始化本周起始日期
  initWeek() {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // 周一为一周开始
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - offset)
    weekStart.setHours(0, 0, 0, 0)

    this.setData({ currentWeekStart: weekStart })
    this.updateWeekLabel()
    this.generateWeekDays()
  },

  // 更新周显示标签
  updateWeekLabel() {
    const start = this.data.currentWeekStart
    const end = new Date(start)
    end.setDate(start.getDate() + 6)

    const startStr = `${start.getMonth() + 1}/${start.getDate()}`
    const endStr = `${end.getMonth() + 1}/${end.getDate()}`

    this.setData({
      weekLabel: `${startStr} - ${endStr}`
    })
  },

  // 生成周一至周日数组结构
  generateWeekDays() {
    const start = this.data.currentWeekStart
    const today = new Date()
    const days = []
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

    for (let i = 0; i < 7; i++) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      const isToday = date.toDateString() === today.toDateString()

      days.push({
        name: dayNames[i],
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        isToday,
        courses: []
      })
    }

    this.setData({ weekDays: days })
  },

  // 加载数据
  async loadData() {
    if (this.data.currentTab === 'list') {
      await this.loadFlatCourses()
    } else {
      await this.loadScheduleData()
    }
  },

  // 加载扁平化课程列表
  async loadFlatCourses() {
    const studentId = app.globalData.openid
    const coursesRes = await api.getMyCourses(studentId)

    if (coursesRes) {
      const courses = coursesRes.map(course => {
        const isCreatedByStudent = course.creatorRole === 'student' || course.createdBy === studentId
        return {
          ...course,
          name: course.name || course.courseName || '未命名课程',
          isCreatedByStudent,
          scheduleStr: this.formatScheduleStr(course.schedule)
        }
      })

      this.setData({
        courses
      })
    }
  },

  // 加载周课表数据并计算定位
  async loadScheduleData() {
    const studentId = app.globalData.openid
    const scheduleRes = await api.getStudentSchedules(studentId)

    if (scheduleRes) {
      this.generateWeekDays()
      const weekDays = [...this.data.weekDays]
      const weekStart = this.data.currentWeekStart
      const colors = this.data.courseColors

      // 为不同的 parentId 分配颜色
      const parentIds = [...new Set(scheduleRes.map(c => c.parentId).filter(Boolean))]
      parentIds.sort()
      const parentIdColorMap = {}
      parentIds.forEach((parentId, index) => {
        parentIdColorMap[parentId] = colors[index % colors.length]
      })

      const getCourseColor = (course) => {
        if (course.parentId && parentIdColorMap[course.parentId]) {
          return parentIdColorMap[course.parentId]
        }
        return colors[0]
      }

      scheduleRes.forEach(course => {
        if (course.schedule && course.schedule.date) {
          const dateStr = course.schedule.date
          const dateParts = dateStr.split('-')
          const courseDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])

          const startOfWeek = new Date(weekStart)
          startOfWeek.setHours(0, 0, 0, 0)
          const endOfWeek = new Date(startOfWeek)
          endOfWeek.setDate(startOfWeek.getDate() + 7)

          // 属于当前周
          if (courseDate >= startOfWeek && courseDate < endOfWeek) {
            const dayOfWeek = courseDate.getDay()
            const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // 0为周日，对应索引6

            if (dayIndex >= 0 && dayIndex < 7) {
              const [startHour, startMin] = course.schedule.startTime.split(':').map(Number)
              const [endHour, endMin] = course.schedule.endTime.split(':').map(Number)
              const startMinutes = startHour * 60 + startMin
              const endMinutes = endHour * 60 + endMin
              const durationMinutes = endMinutes - startMinutes

              // 每天以 06:00 开始，每分钟 2rpx 高度
              const top = (startMinutes - 6 * 60) * 2
              const height = Math.max(durationMinutes * 2, 60) // 最小高度

              const color = getCourseColor(course)
              const isCreatedByStudent = course.creatorRole === 'student' || course.createdBy === studentId || course.teacherId === 'custom_teacher'

              weekDays[dayIndex].courses.push({
                ...course,
                name: course.courseName || course.name || '未命名课程',
                top,
                height,
                isCreatedByStudent,
                subscribed: course.subscribers && course.subscribers.includes(studentId),
                bgColor: color.bg,
                textColor: color.text,
                courseKey: `${course._id || course.scheduleId}_${dayIndex}_${Math.random()}`
              })
            }
          }
        }
      })

      this.setData({ weekDays })
    }
  },

  // 格式化时间显示
  formatScheduleStr(schedule) {
    if (!schedule) return '时间待定'
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    if (schedule.date) {
      return `${schedule.date} (${days[new Date(schedule.date).getDay()]}) ${schedule.startTime}-${schedule.endTime}`
    }
    return `${days[schedule.dayOfWeek] || ''} ${schedule.startTime || ''} - ${schedule.endTime || ''}`
  },

  // 周导航
  prevWeek() {
    const start = new Date(this.data.currentWeekStart)
    start.setDate(start.getDate() - 7)
    this.setData({ currentWeekStart: start })
    this.updateWeekLabel()
    this.loadData()
  },

  nextWeek() {
    const start = new Date(this.data.currentWeekStart)
    start.setDate(start.getDate() + 7)
    this.setData({ currentWeekStart: start })
    this.updateWeekLabel()
    this.loadData()
  },

  // 点击课程单元格
  onCourseTap(e) {
    const course = e.currentTarget.dataset.course
    this.setData({ selectedCourse: course })
  },

  // 关闭详情抽屉
  onCloseDetail() {
    this.setData({ selectedCourse: null })
  },

  preventBubble() {},

  // 订阅/取消订阅上课提醒
  async onToggleSubscribe(e) {
    const { scheduleId, subscribed } = e.currentTarget.dataset
    const studentId = app.globalData.openid

    wx.showLoading({ title: '正在处理...' })
    try {
      let res
      if (subscribed) {
        res = await api.unsubscribeCourse(scheduleId, studentId)
      } else {
        res = await api.subscribeCourse(scheduleId, studentId)
      }

      if (res) {
        wx.showToast({
          title: subscribed ? '已取消订阅' : '订阅成功',
          icon: 'success'
        })

        // 更新弹窗状态
        if (this.data.selectedCourse && this.data.selectedCourse.scheduleId === scheduleId) {
          this.setData({
            'selectedCourse.subscribed': !subscribed
          })
        }

        // 重新加载日程
        this.loadScheduleData()
      }
    } catch (err) {
      console.error('订阅操作失败:', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 自建课程编辑跳转
  goToEditCourse() {
    const course = this.data.selectedCourse
    if (!course) return
    
    const courseId = course.parentId || course._id
    this.onCloseDetail()
    wx.navigateTo({
      url: `/pages/student/courses/detail?id=${courseId}`
    })
  },

  // 删除自建课程
  async onDeleteCourse() {
    const course = this.data.selectedCourse
    if (!course) return

    const courseId = course.parentId || course._id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这门课程吗？此操作将同时删除所有上课日程。',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' })
          try {
            const result = await api.deleteCourse(courseId, app.globalData.openid)
            if (result) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              this.onCloseDetail()
              this.loadData()
            }
          } catch (err) {
            console.error('删除自建课程失败:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  // 跳转到添加课程页
  onAddCourse() {
    wx.navigateTo({
      url: '/pages/student/courses/add'
    })
  },

  // 课程列表项目点击跳转到只读或编辑详情
  goToCourseDetail(e) {
    const courseId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/student/courses/detail?id=${courseId}`
    })
  }
})