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
    coursesData: [],
    scheduleData: []
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
    this.setData({
      userInfo: app.globalData.userInfo,
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth()
    })
    this.loadStats()
  },

  async loadStats() {
    const teacherId = app.globalData.openid

    let studentsRes = []
    let coursesRes = []
    let bindingsRes = []
    let applicationsRes = []
    let scheduleRes = []

    try {
      studentsRes = await api.callFunction('getStudents', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getStudents failed:', err)
    }

    try {
      coursesRes = await api.callFunction('getCourses', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getCourses failed:', err)
    }

    try {
      bindingsRes = await api.callFunction('getPendingBindings', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getPendingBindings failed:', err)
    }

    try {
      applicationsRes = await api.callFunction('getPendingApplications', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getPendingApplications failed:', err)
    }

    try {
      scheduleRes = await api.callFunction('getSchedule', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getSchedule failed:', err)
    }

    const calendarData = this.generateCalendar(scheduleRes)
    const { income, hours, rate } = this.calculateIncome(coursesRes, scheduleRes)

    this.setData({
      stats: {
        studentCount: studentsRes.length,
        courseCount: coursesRes.length,
        pendingBindings: bindingsRes.length,
        pendingApplications: applicationsRes.length
      },
      scheduleCount: scheduleRes.length,
      recentPending: [
        ...bindingsRes.slice(0, 2).map(item => ({
          type: 'binding',
          id: item._id,
          name: item.studentName
        })),
        ...applicationsRes.slice(0, 2).map(item => ({
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
      coursesData: coursesRes,
      scheduleData: scheduleRes
    })
  },

  refreshCalendar() {
    const calendarData = this.generateCalendar(this.data.scheduleData)
    const { income, hours, rate } = this.calculateIncome(this.data.coursesData, this.data.scheduleData)

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
      if (item.date) {
        const courseDate = new Date(item.date)
        if (!isNaN(courseDate.getTime())) {
          if (courseDate.getFullYear() === year && courseDate.getMonth() === month) {
            const date = courseDate.getDate()
            if (!dayCourseCount[date]) {
              dayCourseCount[date] = 0
            }
            dayCourseCount[date] += 1
          }
        } else {
          console.log(`课程${index}: 日期格式无效`, item.date)
        }
      } else if (item.schedule && item.schedule.date) {
        const courseDate = new Date(item.schedule.date)
        if (!isNaN(courseDate.getTime())) {
          if (courseDate.getFullYear() === year && courseDate.getMonth() === month) {
            const date = courseDate.getDate()
            if (!dayCourseCount[date]) {
              dayCourseCount[date] = 0
            }
            dayCourseCount[date] += 1
          }
        }
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
      const { bgColor, textColor } = this.getDayColors(count)
      
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

  getDayColors(count) {
    if (count === 0) {
      return { bgColor: 'rgba(47, 59, 80, 1)', textColor: 'rgba(255, 255, 255, 1)' }
    } else if (count === 1) {
      return { bgColor: 'rgba(200, 240, 200, 0.9)', textColor: 'rgba(0, 100, 0, 0.85)' }
    } else if (count === 2) {
      return { bgColor: 'rgba(150, 220, 150, 0.9)', textColor: 'rgba(0, 100, 0, 0.85)' }
    } else if (count === 3) {
      return { bgColor: 'rgba(100, 190, 100, 0.9)', textColor: 'rgba(255, 255, 255, 0.9)' }
    } else if (count === 4) {
      return { bgColor: 'rgba(50, 150, 50, 0.9)', textColor: 'rgba(255, 255, 255, 0.95)' }
    } else {
      return { bgColor: 'rgba(20, 120, 20, 0.95)', textColor: 'rgba(255, 255, 255, 0.98)' }
    }
  },

  calculateIncome(courses, scheduleList) {
    const now = new Date()
    const year = this.data.currentYear || now.getFullYear()
    const month = this.data.currentMonth !== undefined ? this.data.currentMonth : now.getMonth()
    
    let totalIncome = 0
    let totalHours = 0
    
    const coursePriceMap = {}
    courses.forEach(course => {
      coursePriceMap[course._id] = course.price || course.pricePerHour || 0
    })
    
    scheduleList.forEach(item => {
      let price = item.price || item.coursePrice || 0
      
      if (!price && item.parentId && coursePriceMap[item.parentId]) {
        price = coursePriceMap[item.parentId]
      }
      
      if (!price && item.courseId && coursePriceMap[item.courseId]) {
        price = coursePriceMap[item.courseId]
      }
      
      let courseDate
      let startTime
      let endTime
      
      if (item.date) {
        courseDate = new Date(item.date)
        startTime = item.startTime
        endTime = item.endTime
      } else if (item.schedule && item.schedule.date) {
        courseDate = new Date(item.schedule.date)
        startTime = item.schedule.startTime
        endTime = item.schedule.endTime
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
    
    app.globalData.navigateDate = fullDate
    app.globalData.navigateWeekStart = mondayDate
    
    wx.switchTab({
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
    this.refreshCalendar()
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
    this.refreshCalendar()
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

  onPendingTap(e) {
    const item = e.currentTarget.dataset.item
    if (item.type === 'binding') {
      this.goToBindings()
    } else {
      this.goToApplications()
    }
  }
})
