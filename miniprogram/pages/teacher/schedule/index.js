const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    weekLabel: '',
    currentWeekStart: null,
    weekDays: [],
    timeSlots: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'],
    selectedCourse: null,
    studentList: [],
    selectedStudentId: null,
    selectedStudentName: '全部学生',
    allCourses: [],
    courseColors: [
      { bg: '#002FA7', text: '#fff' },
      { bg: '#1e4dc8', text: '#fff' },
      { bg: '#4b7be5', text: '#fff' },
      { bg: '#6b8fe8', text: '#fff' },
      { bg: '#059669', text: '#fff' },
      { bg: '#d97706', text: '#fff' },
      { bg: '#7c3aed', text: '#fff' },
      { bg: '#dc2626', text: '#fff' },
      { bg: '#0891b2', text: '#fff' },
      { bg: '#4f46e5', text: '#fff' },
      { bg: '#b45309', text: '#fff' },
      { bg: '#be185d', text: '#fff' }
    ]
  },

  onLoad(options) {
    if (!checkRole.checkTeacher()) {
      return
    }
    this.initWeek(options)
    this.loadSchedule()
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }
    
    if (app.globalData.navigateWeekStart) {
      const weekStartDate = new Date(app.globalData.navigateWeekStart)
      if (!isNaN(weekStartDate.getTime())) {
        this.setData({ currentWeekStart: weekStartDate })
        this.updateWeekLabel()
        this.generateWeekDays()
      }
      app.globalData.navigateWeekStart = null
      app.globalData.navigateDate = null
    }
    
    this.loadSchedule()
  },

  initWeek(options = {}) {
    let weekStart
    
    if (options && options.weekStart) {
      const weekStartDate = new Date(decodeURIComponent(options.weekStart))
      if (!isNaN(weekStartDate.getTime())) {
        weekStart = weekStartDate
      }
    }
    
    if (!weekStart) {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      weekStart = new Date(today)
      weekStart.setDate(today.getDate() - offset)
    }

    this.setData({ currentWeekStart: weekStart })
    this.updateWeekLabel()
    this.generateWeekDays()
  },

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

  getParentCourseColor(parentId) {
    const colors = this.data.courseColors
    if (!parentId) {
      return colors[0]
    }
    
    let hash = 5381
    for (let i = 0; i < parentId.length; i++) {
      hash = (hash << 5) + hash + parentId.charCodeAt(i)
    }
    const index = Math.abs(hash) % colors.length
    return colors[index]
  },

  async loadSchedule() {
    const teacherId = app.globalData.openid
    
    const [scheduleRes, studentsRes] = await Promise.all([
      api.getSchedule(teacherId),
      api.getStudents(teacherId)
    ])

    if (scheduleRes) {
      const studentList = [{ studentId: null, name: '全部学生' }]
      
      if (studentsRes && studentsRes.length > 0) {
        studentsRes.forEach(student => {
          studentList.push({
            studentId: student._id,
            name: student.name || student.studentName || '未知学生'
          })
        })
      }

      const { selectedStudentId, selectedStudentName } = this.data
      let filteredCourses = scheduleRes
      
      if (selectedStudentId) {
        const targetId = String(selectedStudentId)
        const targetName = selectedStudentName
        
        filteredCourses = scheduleRes.filter(course => {
          if (!course.students || !Array.isArray(course.students)) {
            return false
          }
          return course.students.some(s => {
            if (typeof s === 'string') {
              return String(s) === targetId
            }
            if (typeof s === 'object') {
              const idFields = ['studentId', '_id', 'openid', 'studentOpenid', 'id']
              const idMatch = idFields.some(field => {
                const fieldValue = s[field]
                if (fieldValue !== undefined && fieldValue !== null) {
                  return String(fieldValue) === targetId
                }
                return false
              })
              
              if (idMatch) return true
              
              const nameFields = ['name', 'studentName']
              const nameMatch = nameFields.some(field => {
                const fieldValue = s[field]
                if (typeof fieldValue === 'string') {
                  return fieldValue === targetName || fieldValue.includes(targetName)
                }
                return false
              })
              
              return nameMatch
            }
            return false
          })
        })
      }

      const weekDays = [...this.data.weekDays]
      const weekStart = this.data.currentWeekStart

      filteredCourses.forEach(course => {
        if (course.schedule && course.schedule.date) {
          const courseDate = new Date(course.schedule.date)
          const startOfWeek = new Date(weekStart)
          startOfWeek.setHours(0, 0, 0, 0)
          const endOfWeek = new Date(startOfWeek)
          endOfWeek.setDate(startOfWeek.getDate() + 7)

          if (courseDate >= startOfWeek && courseDate < endOfWeek) {
            const dayOfWeek = courseDate.getDay()
            const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
            if (dayIndex >= 0 && dayIndex < 7) {
              const [startHour, startMin] = course.schedule.startTime.split(':').map(Number)
              const [endHour, endMin] = course.schedule.endTime.split(':').map(Number)
              const startMinutes = startHour * 60 + startMin
              const endMinutes = endHour * 60 + endMin
              const durationMinutes = endMinutes - startMinutes
              const top = (startMinutes - 6 * 60) * 2
              const height = Math.max(durationMinutes * 2, 60)

              const identifier = course.parentId || course.name || course._id
              const color = this.getParentCourseColor(identifier)

              weekDays[dayIndex].courses.push({
                ...course,
                top,
                height,
                scheduleStr: this.formatSchedule(course.schedule),
                courseKey: `${course._id}_${dayIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                bgColor: color.bg,
                textColor: color.text
              })
            }
          }
        }
      })

      this.setData({ 
        weekDays,
        allCourses: scheduleRes,
        studentList
      })
    }
  },

  onStudentFilterChange(e) {
    const index = e.detail.value
    const selectedStudent = this.data.studentList[index]
    const selectedStudentId = selectedStudent.studentId
    const selectedStudentName = selectedStudent.name

    this.setData({
      selectedStudentId,
      selectedStudentName
    })

    this.generateWeekDays()
    this.loadSchedule()
  },

  formatSchedule(schedule) {
    if (schedule.date) {
      const date = new Date(schedule.date)
      const month = date.getMonth() + 1
      const day = date.getDate()
      return `${month}/${day} ${schedule.startTime}-${schedule.endTime}`
    }
    return `${schedule.startTime}-${schedule.endTime}`
  },

  prevWeek() {
    const start = new Date(this.data.currentWeekStart)
    start.setDate(start.getDate() - 7)
    this.setData({ currentWeekStart: start })
    this.updateWeekLabel()
    this.generateWeekDays()
    this.loadSchedule()
  },

  nextWeek() {
    const start = new Date(this.data.currentWeekStart)
    start.setDate(start.getDate() + 7)
    this.setData({ currentWeekStart: start })
    this.updateWeekLabel()
    this.generateWeekDays()
    this.loadSchedule()
  },

  onCourseTap(e) {
    const course = e.currentTarget.dataset.course
    this.setData({ selectedCourse: course })
  },

  onCloseDetail() {
    this.setData({ selectedCourse: null })
  },

  preventBubble() {},

  async onSendReminder() {
    const course = this.data.selectedCourse
    if (!course) return

    const result = await api.sendReminder(course._id, app.globalData.openid)
    if (result) {
      wx.showToast({
        title: '提醒已发送',
        icon: 'success'
      })
    }
  },

  onEditCourse() {
    const course = this.data.selectedCourse
    if (!course) return

    wx.navigateTo({
      url: `/pages/teacher/courses/add?mode=edit&courseId=${course._id}&courseData=${JSON.stringify(course)}`
    })
    this.onCloseDetail()
  }
})