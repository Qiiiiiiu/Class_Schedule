const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    userInfo: null,
    
    // 今日焦点与列表
    todayCourses: [],
    focusCourse: null,
    currentTime: '',
    
    // 未来三天日程
    upcomingDays: [],
    
    // 月历组件
    calendar: [],
    calendarTitle: '',
    weeklyDays: ['日', '一', '二', '三', '四', '五', '六'],
    currentYear: 0,
    currentMonth: 0,
    scheduleData: [] // 所有的课程表数据
  },

  onLoad() {
    if (!checkRole.checkStudent()) {
      return
    }
    this.setData({
      userInfo: app.globalData.userInfo,
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth()
    })
  },

  onShow() {
    if (!checkRole.checkStudent()) {
      return
    }
    this.setData({
      userInfo: app.globalData.userInfo
    })
    this.updateCurrentTime()
    this.loadStats()
  },

  // 获取当前时间 HH:mm
  updateCurrentTime() {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    this.setData({
      currentTime: `${hh}:${mm}`
    })
  },

  // 加载主数据
  async loadStats() {
    const studentId = app.globalData.openid
    const year = this.data.currentYear || new Date().getFullYear()
    const month = this.data.currentMonth !== undefined ? this.data.currentMonth : new Date().getMonth()

    wx.showNavigationBarLoading()
    try {
      const scheduleRes = await api.getStudentSchedules(studentId)

      // 保存完整的 scheduleRes
      const rawSchedules = scheduleRes || []

      // 1. 处理今日课程
      const todayStr = this.formatDateStr(new Date())
      const todayCourses = this.processTodayCourses(rawSchedules, todayStr)
      const focusCourse = this.calculateFocusCourse(todayCourses)

      // 2. 处理未来三天日程快览
      const upcomingDays = this.processUpcomingDays(rawSchedules)

      // 3. 处理月历概览
      const calendarData = this.generateCalendar(rawSchedules, year, month)

      this.setData({
        todayCourses,
        focusCourse,
        upcomingDays,
        calendar: calendarData.calendar,
        calendarTitle: calendarData.title,
        currentYear: calendarData.year,
        currentMonth: calendarData.month,
        scheduleData: rawSchedules
      })
    } catch (err) {
      console.error('加载学生首页数据失败:', err)
    } finally {
      wx.hideNavigationBarLoading()
    }
  },

  // 处理今日课程数据，计算状态
  processTodayCourses(schedules, todayStr) {
    const currentOpenid = app.globalData.openid
    const currentTime = this.data.currentTime

    return schedules.filter(item => {
      return item.schedule && item.schedule.date === todayStr
    }).map(item => {
      const isCreatedByStudent = item.creatorRole === 'student' || item.createdBy === currentOpenid || item.teacherId === 'custom_teacher'
      const startTime = item.schedule.startTime
      const endTime = item.schedule.endTime
      
      let status = 'upcoming' // 待上课
      let statusText = '待上课'
      if (currentTime >= startTime && currentTime <= endTime) {
        status = 'in-progress' // 进行中
        statusText = '上课中'
      } else if (currentTime > endTime) {
        status = 'finished' // 已结束
        statusText = '已结束'
      }

      return {
        ...item,
        name: item.courseName || item.name || '未命名课程',
        isCreatedByStudent,
        status,
        statusText
      }
    }).sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime))
  },

  // 计算焦点课程 (即下一门要上的课，或正在上的课)
  calculateFocusCourse(todayCourses) {
    if (todayCourses.length === 0) return null

    // 优先返回进行中的课程
    const inProgress = todayCourses.find(c => c.status === 'in-progress')
    if (inProgress) return inProgress

    // 其次返回今天还未开始的、最早的一门课程
    const upcoming = todayCourses.find(c => c.status === 'upcoming')
    if (upcoming) return upcoming

    // 如果都结束了，返回最后一门课程
    return todayCourses[todayCourses.length - 1]
  },

  // 整理未来三天的课程快览
  processUpcomingDays(schedules) {
    const upcomingDays = []
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const currentOpenid = app.globalData.openid

    for (let i = 1; i <= 3; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)
      const dateStr = this.formatDateStr(date)
      const label = i === 1 ? '明天' : (i === 2 ? '后天' : `${date.getMonth() + 1}/${date.getDate()}`)
      const dayOfWeekStr = dayNames[date.getDay()]

      const courses = schedules.filter(item => {
        return item.schedule && item.schedule.date === dateStr
      }).map(item => {
        const isCreatedByStudent = item.creatorRole === 'student' || item.createdBy === currentOpenid || item.teacherId === 'custom_teacher'
        return {
          ...item,
          name: item.courseName || item.name || '未命名课程',
          isCreatedByStudent
        }
      }).sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime))

      upcomingDays.push({
        dateStr,
        label: `${label} (${dayOfWeekStr})`,
        courses
      })
    }

    return upcomingDays
  },

  // 生成月历数据结构
  generateCalendar(schedules, year, month) {
    const now = new Date()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    
    // 计算当月第一天是星期几
    const startDayOfWeek = firstDay.getDay()
    
    // 统计每天的课程数量
    const dayCourseCount = {}
    schedules.forEach(item => {
      let dateStr = ''
      if (item.schedule && item.schedule.date) {
        dateStr = item.schedule.date
      }
      
      if (dateStr) {
        const parts = dateStr.split('-')
        if (parts.length === 3) {
          const cYear = parseInt(parts[0])
          const cMonth = parseInt(parts[1]) - 1
          const cDay = parseInt(parts[2])
          
          if (cYear === year && cMonth === month) {
            dayCourseCount[cDay] = (dayCourseCount[cDay] || 0) + 1
          }
        }
      }
    })

    const calendar = []
    
    // 填充第一天之前的空白
    for (let i = 0; i < startDayOfWeek; i++) {
      calendar.push({ empty: true })
    }
    
    // 填充当月日期
    for (let i = 1; i <= daysInMonth; i++) {
      const count = dayCourseCount[i] || 0
      const isToday = i === now.getDate() && year === now.getFullYear() && month === now.getMonth()
      const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      const { bgColor, textColor } = this.getDayColors(count, isToday)
      
      calendar.push({
        date: i,
        fullDate,
        count,
        bgColor,
        textColor,
        isToday
      })
    }
    
    return {
      calendar,
      title: `${year}年${month + 1}月`,
      year,
      month
    }
  },

  // 月历日期色彩阶梯
  getDayColors(count, isToday) {
    if (isToday) {
      return { bgColor: 'rgba(59, 130, 246, 0.25)', textColor: '#3b82f6' }
    }
    if (count === 0) {
      return { bgColor: 'rgba(255, 255, 255, 0.03)', textColor: '#94a3b8' }
    } else if (count === 1) {
      return { bgColor: 'rgba(59, 130, 246, 0.15)', textColor: '#60a5fa' }
    } else if (count === 2) {
      return { bgColor: 'rgba(59, 130, 246, 0.3)', textColor: '#93c5fd' }
    } else {
      return { bgColor: 'rgba(59, 130, 246, 0.5)', textColor: '#ffffff' }
    }
  },

  // 格式化日期 YYYY-MM-DD
  formatDateStr(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  // 月历前后切换
  prevMonth() {
    let year = this.data.currentYear
    let month = this.data.currentMonth
    month -= 1
    if (month < 0) {
      month = 11
      year -= 1
    }
    this.setData({ currentYear: year, currentMonth: month })
    this.loadStats()
  },

  nextMonth() {
    let year = this.data.currentYear
    let month = this.data.currentMonth
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    this.setData({ currentYear: year, currentMonth: month })
    this.loadStats()
  },

  // 点击月历中的某一天，直接跳转至课程安排 Tab，并定位到对应的周
  onCalendarDayTap(e) {
    const fullDate = e.currentTarget.dataset.date
    if (!fullDate) return

    const date = new Date(fullDate)
    const dayOfWeek = date.getDay()
    const monday = new Date(date)
    // 计算星期一
    monday.setDate(date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
    
    const mondayDate = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    
    app.globalData.navigateWeekStart = mondayDate
    
    wx.switchTab({
      url: '/pages/student/my-courses/index',
      fail: () => {
        wx.reLaunch({
          url: '/pages/student/my-courses/index'
        })
      }
    })
  },

  // 快捷跳转
  goToMyCourses() {
    wx.switchTab({
      url: '/pages/student/my-courses/index',
      fail: () => {
        wx.reLaunch({
          url: '/pages/student/my-courses/index'
        })
      }
    })
  }
})
