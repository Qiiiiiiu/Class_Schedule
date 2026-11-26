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
    coursePriceMap: {},
    scheduleData: [],
    greeting: '',
    greetingEmoji: ''
  },

  onLoad() {
    if (!checkRole.checkTeacher()) {
      return
    }
    this.setData({
      userInfo: app.globalData.userInfo
    })
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }
    const theme = app.globalData.theme || 'dark'
    const now = new Date()
    const targetYear = this.data.currentYear || now.getFullYear()
    const targetMonth = this.data.currentYear ? this.data.currentMonth : now.getMonth()
    this.setData({
      theme: theme,
      userInfo: app.globalData.userInfo,
      currentYear: targetYear,
      currentMonth: targetMonth
    })
    this.updateGreeting()
    app.applyThemeToSystem(theme)
    if (app.globalData.refreshSchedule) {
      app.globalData.refreshSchedule = false
      app.globalData.dashboardCache = null
    }
    this.loadStats()
  },

  updateGreeting() {
    const hour = new Date().getHours()
    let greeting = ''
    let greetingEmoji = ''
    
    if (hour >= 5 && hour < 9) {
      greeting = '早上好'
      greetingEmoji = '🌅'
    } else if (hour >= 9 && hour < 12) {
      greeting = '上午好'
      greetingEmoji = '☀️'
    } else if (hour >= 12 && hour < 18) {
      greeting = '下午好'
      greetingEmoji = '☕'
    } else if (hour >= 18 && hour < 22) {
      greeting = '晚上好'
      greetingEmoji = '🌆'
    } else {
      greeting = '夜深了'
      greetingEmoji = '🌙'
    }
    
    this.setData({
      greeting,
      greetingEmoji
    })
  },

  async loadStats() {
    const teacherId = app.globalData.openid
    if (!teacherId) return

    const year = this.data.currentYear || new Date().getFullYear()
    const month = this.data.currentMonth !== undefined ? this.data.currentMonth : new Date().getMonth()
    const startDate = this.formatDateStr(new Date(year, month, 1))
    const endDate = this.formatDateStr(new Date(year, month + 1, 0))
    const cacheKey = `${teacherId}_${startDate}_${endDate}`

    const cached = app.globalData.dashboardCache
    let dashboard = null
    if (cached && cached.key === cacheKey && Date.now() - cached.timestamp < 30000) {
      dashboard = cached.data
    } else {
      dashboard = await api.getTeacherDashboard(teacherId, { startDate, endDate })
      if (dashboard) {
        app.globalData.dashboardCache = {
          key: cacheKey,
          data: dashboard,
          timestamp: Date.now()
        }
      }
    }

    if (!dashboard) return

    const scheduleRes = dashboard.schedules || []
    const coursePriceMap = dashboard.coursePriceMap || {}
    const pendingBindings = dashboard.pendingBindings || []
    const pendingApplications = dashboard.pendingApplications || []

    const calendarData = this.generateCalendar(scheduleRes)
    const { income, hours, rate } = this.calculateIncome(coursePriceMap, scheduleRes)

    this.setData({
      stats: {
        studentCount: dashboard.studentCount || 0,
        courseCount: dashboard.courseCount || 0,
        pendingBindings: dashboard.pendingBindingsCount || 0,
        pendingApplications: dashboard.pendingApplicationsCount || 0
      },
      scheduleCount: dashboard.scheduleCount || scheduleRes.length,
      recentPending: [
        ...pendingBindings.slice(0, 2).map(item => ({
          type: 'binding',
          id: item._id,
          name: item.studentName
        })),
        ...pendingApplications.slice(0, 2).map(item => ({
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
      hourlyRate: rate,
      coursePriceMap,
      scheduleData: scheduleRes
    })
  },

  refreshCalendar() {
    const calendarData = this.generateCalendar(this.data.scheduleData)
    const { income, hours, rate } = this.calculateIncome(this.data.coursePriceMap, this.data.scheduleData)

    this.setData({
      calendar: calendarData.calendar,
      calendarTitle: calendarData.title,
      currentYear: calendarData.year,
      currentMonth: calendarData.month,
      monthlyIncome: income,
      totalHours: hours,
      hourlyRate: rate
    })
  },

  generateCalendar(courses) {
    const now = new Date()
    const year = this.data.currentYear || now.getFullYear()
    const month = this.data.currentMonth !== undefined ? this.data.currentMonth : now.getMonth()
        
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()
    
    const dayCourseCount = {}
    
    courses.forEach((item, index) => {
      let courseDate = null
      let dateStr = ''
      
      if (item.date) {
        dateStr = item.date
      } else if (item.schedule && item.schedule.date) {
        dateStr = item.schedule.date
      }
      
      if (dateStr) {
        const dateParts = dateStr.split('-')
        if (dateParts.length === 3) {
          courseDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]))
        } else {
          courseDate = new Date(dateStr)
        }
      }
      
      if (courseDate && !isNaN(courseDate.getTime())) {
        if (courseDate.getFullYear() === year && courseDate.getMonth() === month) {
          const date = courseDate.getDate()
          if (!dayCourseCount[date]) {
            dayCourseCount[date] = 0
          }
          dayCourseCount[date] += 1
        }
      } else if (dateStr) {
        console.log(`课程${index}: 日期格式无效`, dateStr)
      }
    })
            
    const calendar = []
    
    for (let i = 0; i < startDayOfWeek; i++) {
      calendar.push({ empty: true })
    }
    
    for (let i = 1; i <= daysInMonth; i++) {

      const count = dayCourseCount[i] || 0
      const isToday = i === now.getDate() && year === now.getFullYear() && month === now.getMonth()
      const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      const { bgColor, textColor } = this.getDayColors(count, this.data.theme || 'dark')
      
      calendar.push({
        date: i,
        fullDate,
        count: count,
        bgColor: bgColor,
        textColor: textColor,
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

  getDayColors(count, theme) {
    const isLight = theme === 'light'
    if (count === 0) {
      return { 
        bgColor: isLight ? '#f1f5f9' : 'rgba(47, 59, 80, 1)', 
        textColor: isLight ? '#64748b' : 'rgba(255, 255, 255, 1)' 
      }
    } else if (count === 1) {
      return { bgColor: isLight ? 'rgba(187, 247, 208, 0.8)' : 'rgba(200, 240, 200, 0.9)', textColor: 'rgba(0, 100, 0, 0.85)' }
    } else if (count === 2) {
      return { bgColor: isLight ? 'rgba(134, 239, 172, 0.8)' : 'rgba(150, 220, 150, 0.9)', textColor: 'rgba(0, 100, 0, 0.85)' }
    } else if (count === 3) {
      return { bgColor: isLight ? 'rgba(74, 222, 128, 0.85)' : 'rgba(100, 190, 100, 0.9)', textColor: 'rgba(255, 255, 255, 0.9)' }
    } else if (count === 4) {
      return { bgColor: isLight ? 'rgba(34, 197, 94, 0.9)' : 'rgba(50, 150, 50, 0.9)', textColor: 'rgba(255, 255, 255, 0.95)' }
    } else {
      return { bgColor: isLight ? 'rgba(22, 163, 74, 0.95)' : 'rgba(20, 120, 20, 0.95)', textColor: 'rgba(255, 255, 255, 0.98)' }
    }
  },

  calculateIncome(coursePriceSource, scheduleList) {
    const now = new Date()
    const year = this.data.currentYear || now.getFullYear()
    const month = this.data.currentMonth !== undefined ? this.data.currentMonth : now.getMonth()
    
    let totalIncome = 0
    let totalHours = 0
    
    const coursePriceMap = {}
    if (Array.isArray(coursePriceSource)) {
      coursePriceSource.forEach(course => {
        coursePriceMap[course._id] = course.price || course.pricePerHour || 0
      })
    } else if (coursePriceSource && typeof coursePriceSource === 'object') {
      Object.assign(coursePriceMap, coursePriceSource)
    }
    
    scheduleList.forEach(item => {
      let price = item.price || item.coursePrice || 0
      
      if (!price && item.parentId && coursePriceMap[item.parentId]) {
        price = coursePriceMap[item.parentId]
      }
      
      if (!price && item.courseId && coursePriceMap[item.courseId]) {
        price = coursePriceMap[item.courseId]
      }
      
      let courseDate = null
      let startTime = null
      let endTime = null
      let dateStr = ''
      
      if (item.date) {
        dateStr = item.date
        startTime = item.startTime
        endTime = item.endTime
      } else if (item.schedule && item.schedule.date) {
        dateStr = item.schedule.date
        startTime = item.schedule.startTime
        endTime = item.schedule.endTime
      }
      
      if (dateStr) {
        const dateParts = dateStr.split('-')
        if (dateParts.length === 3) {
          courseDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]))
        } else {
          courseDate = new Date(dateStr)
        }
      }
      
      if (courseDate && !isNaN(courseDate.getTime())) {
        if (courseDate.getFullYear() === year && courseDate.getMonth() === month) {
          if (startTime && endTime) {
            const startHour = parseFloat(startTime.split(':')[0]) + parseFloat(startTime.split(':')[1]) / 60
            const endHour = parseFloat(endTime.split(':')[0]) + parseFloat(endTime.split(':')[1]) / 60
            const duration = endHour - startHour
            
            totalIncome += duration * price
            totalHours += duration
          }
        }
      }
    })
    
    const hourlyRate = totalHours > 0 ? totalIncome / totalHours : 0
    
    return {
      income: totalIncome.toFixed(2),
      hours: totalHours.toFixed(1),
      rate: hourlyRate.toFixed(2)
    }
  },

  formatDateStr(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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

    const parts = String(fullDate).split('-').map(Number)
    if (parts.length !== 3 || parts.some(isNaN)) return
    const date = new Date(parts[0], parts[1] - 1, parts[2])
    const dayOfWeek = date.getDay()
    const monday = new Date(date)
    monday.setDate(date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
    
    const mondayDate = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    
    app.globalData.navigateDate = fullDate
    app.globalData.navigateWeekStart = mondayDate
    
    wx.navigateTo({
      url: '/pages/teacher/schedule/index'
    })
  },

  prevMonth() {
    let year = this.data.currentYear || new Date().getFullYear()
    let month = this.data.currentMonth !== undefined ? this.data.currentMonth : new Date().getMonth()
    
    month -= 1
    if (month < 0) {
      month = 11
      year -= 1
    }
    
    this.setData({ currentYear: year, currentMonth: month })
    this.loadStats()
  },

  nextMonth() {
    let year = this.data.currentYear || new Date().getFullYear()
    let month = this.data.currentMonth !== undefined ? this.data.currentMonth : new Date().getMonth()
    
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    
    this.setData({ currentYear: year, currentMonth: month })
    this.loadStats()
  },

  onPendingTap(e) {
    const item = e.currentTarget.dataset.item
    if (item.type === 'binding') {
      wx.navigateTo({
        url: '/pages/teacher/bindings/index'
      })
    } else {
      wx.navigateTo({
        url: '/pages/teacher/courses/index?tab=applications'
      })
    }
  }
})
