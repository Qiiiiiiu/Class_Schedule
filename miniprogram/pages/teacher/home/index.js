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
    scheduleData: [],
    studentsData: null,
    bindingsData: null,
    applicationsData: null
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
    if (app.globalData.refreshSchedule) {
      app.globalData.refreshSchedule = false
      this.setData({
        coursesData: [],
        scheduleData: [],
        studentsData: null,
        bindingsData: null,
        applicationsData: null
      })
    }
    this.loadStats()
  },

  async loadStats() {
    const teacherId = app.globalData.openid

    const year = this.data.currentYear || new Date().getFullYear()
    const month = this.data.currentMonth !== undefined ? this.data.currentMonth : new Date().getMonth()
    const startDate = this.formatDateStr(new Date(year, month , 1))
    const endDate = this.formatDateStr(new Date(year, month + 1, 0))

    const coursesRes = this.data.coursesData && this.data.coursesData.length > 0
      ? this.data.coursesData
      : await this.fetchCourses(teacherId)

    const studentsRes = this.data.studentsData && this.data.studentsData.length > 0
      ? this.data.studentsData
      : await this.fetchStudents(teacherId)

    const bindingsRes = this.data.bindingsData
      ? this.data.bindingsData
      : await this.fetchBindings(teacherId)

    const applicationsRes = this.data.applicationsData
      ? this.data.applicationsData
      : await this.fetchApplications(teacherId)

    const scheduleRes = await this.fetchSchedule(teacherId, startDate, endDate)

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
      studentsData: studentsRes,
      bindingsData: bindingsRes,
      applicationsData: applicationsRes,
      scheduleData: scheduleRes
    })
  },

  async fetchStudents(teacherId) {
    try {
      return await api.callFunction('getStudents', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getStudents failed:', err)
      return []
    }
  },

  async fetchCourses(teacherId) {
    try {
      return await api.callFunction('getCourses', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getCourses failed:', err)
      return []
    }
  },

  async fetchBindings(teacherId) {
    try {
      return await api.callFunction('getPendingBindings', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getPendingBindings failed:', err)
      return []
    }
  },

  async fetchApplications(teacherId) {
    try {
      return await api.callFunction('getPendingApplications', { teacherId }, { silent: true }) || []
    } catch (err) {
      console.error('getPendingApplications failed:', err)
      return []
    }
  },

  async fetchSchedule(teacherId, startDate, endDate) {
    try {
      return await api.callFunction('getSchedule', { teacherId, startDate, endDate }, { silent: true }) || []
    } catch (err) {
      console.error('getSchedule failed:', err)
      return []
    }
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
