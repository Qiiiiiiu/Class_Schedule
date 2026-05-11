const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    userInfo: null,
    stats: {
      studentCount: 0,
      courseCount: 0,
      pendingBindings: 0,
      pendingApplications: 0
    },
    scheduleCount: 0,
    recentPending: [],
    calendar: [],
    calendarTitle: '',
    weeklyDays: ['日', '一', '二', '三', '四', '五', '六'],
    monthlyIncome: 0,
    hourlyRate: 0,
    totalHours: 0,
    showAmount: true,
    currentYear: 0,
    currentMonth: 0,
    subscribed: false
  },

  onLoad() {
    if (!checkRole.checkTeacher()) {
      return
    }
    this.setData({
      userInfo: app.globalData.userInfo
    })
    this.loadStats()
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }
    this.setData({
      userInfo: app.globalData.userInfo
    })
    this.loadStats()
  },

  async loadStats() {
    const teacherId = app.globalData.openid

    const [studentsRes, coursesRes, scheduleRes, bindingsRes, applicationsRes] = await Promise.all([
      api.getStudents(teacherId),
      api.getCourses(teacherId),
      api.getSchedule(teacherId),
      api.getPendingBindings(teacherId),
      api.getPendingApplications(teacherId)
    ])

    const calendarData = this.generateCalendar(scheduleRes || [])
    const { income, hours, rate } = this.calculateIncome(scheduleRes || [])

    this.setData({
      stats: {
        studentCount: studentsRes ? studentsRes.length : 0,
        courseCount: coursesRes ? coursesRes.length : 0,
        pendingBindings: bindingsRes ? bindingsRes.length : 0,
        pendingApplications: applicationsRes ? applicationsRes.length : 0
      },
      scheduleCount: scheduleRes ? scheduleRes.length : 0,
      recentPending: [
        ...(bindingsRes || []).slice(0, 2).map(item => ({
          type: 'binding',
          id: item._id,
          name: item.studentName
        })),
        ...(applicationsRes || []).slice(0, 2).map(item => ({
          type: 'application',
          id: item._id,
          name: item.studentName + ' - ' + item.courseName
        }))
      ],
      calendar: calendarData.calendar,
      calendarTitle: calendarData.title,
      currentYear: calendarData.year,
      currentMonth: calendarData.month,
      monthlyIncome: income,
      totalHours: hours,
      hourlyRate: rate
    })
  },

  generateCalendar(courses, customYear, customMonth) {
    const now = new Date()
    const year = customYear !== undefined ? customYear : now.getFullYear()
    const month = customMonth !== undefined ? customMonth : now.getMonth()
    
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()
    
    const dayHours = {}
    
    courses.forEach(course => {
      if (course.schedule && course.schedule.date) {
        const courseDate = new Date(course.schedule.date)
        if (courseDate.getFullYear() === year && courseDate.getMonth() === month) {
          const date = courseDate.getDate()
          const startTime = course.schedule.startTime
          const endTime = course.schedule.endTime
          
          const startHour = parseFloat(startTime.split(':')[0]) + parseFloat(startTime.split(':')[1]) / 60
          const endHour = parseFloat(endTime.split(':')[0]) + parseFloat(endTime.split(':')[1]) / 60
          const duration = endHour - startHour
          
          if (!dayHours[date]) {
            dayHours[date] = 0
          }
          dayHours[date] += duration
        }
      }
    })
    
    const calendar = []
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    
    for (let i = 0; i < startDayOfWeek; i++) {
      calendar.push({ empty: true })
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const hours = dayHours[i] || 0
      const clampedHours = Math.min(hours, 12)
      const intensity = clampedHours / 12
      const isToday = i === now.getDate()
      const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      
      calendar.push({
        date: i,
        fullDate,
        hours: hours.toFixed(1),
        intensity: intensity,
        bgColor: this.getBgColor(intensity),
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

  prevMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth--
    if (currentMonth < 0) {
      currentMonth = 11
      currentYear--
    }
    this.updateCalendar(currentYear, currentMonth)
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth++
    if (currentMonth > 11) {
      currentMonth = 0
      currentYear++
    }
    this.updateCalendar(currentYear, currentMonth)
  },

  async updateCalendar(year, month) {
    const scheduleRes = await api.getSchedule(app.globalData.openid)
    const calendarData = this.generateCalendar(scheduleRes || [], year, month)
    
    this.setData({
      calendar: calendarData.calendar,
      calendarTitle: calendarData.title,
      currentYear: calendarData.year,
      currentMonth: calendarData.month
    })
  },

  getBgColor(intensity) {
    const hourColors = [
      'rgba(255, 255, 255, 0.9)',
      'rgba(230, 247, 237, 0.9)',
      'rgba(200, 240, 218, 0.9)',
      'rgba(170, 233, 200, 0.9)',
      'rgba(136, 212, 174, 0.9)',
      'rgba(100, 195, 150, 0.9)',
      'rgba(79, 182, 142, 0.9)',
      'rgba(60, 165, 125, 0.9)',
      'rgba(46, 152, 111, 0.9)',
      'rgba(35, 135, 98, 0.9)',
      'rgba(25, 120, 85, 0.9)',
      'rgba(20, 110, 78, 0.92)',
      'rgba(17, 100, 70, 0.95)'
    ]
    const index = Math.round(intensity * 12)
    return hourColors[Math.min(index, 12)]
  },

  calculateIncome(courses) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    
    let totalIncome = 0
    let totalHours = 0
    
    courses.forEach(course => {
      if (!course.schedule) return
      
      const startTime = course.schedule.startTime
      const endTime = course.schedule.endTime
      
      if (!startTime || !endTime) return
      
      const startHour = parseFloat(startTime.split(':')[0]) + parseFloat(startTime.split(':')[1]) / 60
      const endHour = parseFloat(endTime.split(':')[0]) + parseFloat(endTime.split(':')[1]) / 60
      const duration = endHour - startHour
      
      const price = course.price || 0
      
      if (course.schedule.date) {
        const courseDate = new Date(course.schedule.date)
        if (courseDate.getFullYear() === year && courseDate.getMonth() === month) {
          totalIncome += duration * price
          totalHours += duration
        }
      } else if (course.isRepeat && course.weekdays && course.weekdays.length > 0) {
        const weekdays = course.weekdays
        const repeatCount = course.repeatCount || 1
        
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const daysInMonth = lastDay.getDate()
        
        let actualCount = 0
        for (let i = 1; i <= daysInMonth; i++) {
          const date = new Date(year, month, i)
          const dayOfWeek = date.getDay()
          if (weekdays.includes(dayOfWeek)) {
            actualCount++
          }
        }
        
        const effectiveCount = Math.min(actualCount, repeatCount)
        totalIncome += duration * price * effectiveCount
        totalHours += duration * effectiveCount
      }
    })
    
    const hourlyRate = totalHours > 0 ? totalIncome / totalHours : 0
    
    return {
      income: totalIncome.toFixed(2),
      hours: totalHours.toFixed(1),
      rate: hourlyRate.toFixed(2)
    }
  },

  toggleAmount() {
    this.setData({
      showAmount: !this.data.showAmount
    })
  },

  onCalendarDayTap(e) {
    const fullDate = e.currentTarget.dataset.date
    if (!fullDate) {
      return
    }

    const date = new Date(fullDate)
    const dayOfWeek = date.getDay()
    const monday = new Date(date)
    monday.setDate(date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
    
    const mondayDate = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    
    wx.navigateTo({
      url: `/pages/teacher/schedule/index?date=${encodeURIComponent(fullDate)}&weekStart=${encodeURIComponent(mondayDate)}`
    })
  },

  goToStudents() {
    wx.navigateTo({
      url: '/pages/teacher/students/index'
    })
  },

  goToCourses() {
    wx.navigateTo({
      url: '/pages/teacher/courses/index'
    })
  },

  goToBindings() {
    wx.navigateTo({
      url: '/pages/teacher/bindings/index'
    })
  },

  goToApplications() {
    wx.navigateTo({
      url: '/pages/teacher/courses/index?tab=applications'
    })
  },

  goToSchedule() {
    wx.navigateTo({
      url: '/pages/teacher/schedule/index'
    })
  },

  async subscribeReminder() {
    try {
      const res = await wx.requestSubscribeMessage({
        tmplIds: ['w223WKtyfXebjCpkNc2TbtczBuGuR4SUk2IRbMcRreU']
      })

      if (res['w223WKtyfXebjCpkNc2TbtczBuGuR4SUk2IRbMcRreU'] === 'accept') {
        this.setData({ subscribed: true })
        wx.showToast({
          title: '订阅成功，将在课程开始前提醒您',
          icon: 'success'
        })
      } else {
        wx.showToast({
          title: '订阅失败',
          icon: 'none'
        })
      }
    } catch (err) {
      console.error('订阅失败:', err)
      wx.showToast({
        title: '订阅失败',
        icon: 'none'
      })
    }
  },

  onPendingTap(e) {
    const item = e.currentTarget.dataset.item
    if (item.type === 'binding') {
      this.goToBindings()
    } else {
      this.goToApplications()
    }
  }
})
