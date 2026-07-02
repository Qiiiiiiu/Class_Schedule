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
    isEditing: false,
    editDate: '',
    editStartTime: '',
    editEndTime: '',
    editClassroom: '',
    courseColors: [
      { bg: '#dc2626', text: '#fff' },
      { bg: '#ea580c', text: '#fff' },
      { bg: '#ca8a04', text: '#fff' },
      { bg: '#059669', text: '#fff' },
      { bg: '#0891b2', text: '#fff' },
      { bg: '#2563eb', text: '#fff' },
      { bg: '#7c3aed', text: '#fff' },
      { bg: '#db2777', text: '#fff' },
      { bg: '#991b1b', text: '#fff' },
      { bg: '#4d7c0f', text: '#fff' },
      { bg: '#1e40af', text: '#fff' },
      { bg: '#8b5cf6', text: '#fff' }
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
    
    if (app.globalData.refreshSchedule) {
      app.globalData.refreshSchedule = false
      this.generateWeekDays()
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

  async loadSchedule() {
    const teacherId = app.globalData.openid
    
    const weekStart = this.data.currentWeekStart
    const startDate = this.formatDateStr(weekStart)
    const endDate = this.formatDateStr(new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000))
    
    const [scheduleRes, studentsRes] = await Promise.all([
      api.getSchedule(teacherId, { startDate, endDate }),
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

      this.generateWeekDays()
      const weekDays = [...this.data.weekDays]
      const weekStart = this.data.currentWeekStart
      const colors = this.data.courseColors

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
        const identifier = course.name || course._id || ''
        let hash = 5381
        for (let i = 0; i < identifier.length; i++) {
          hash = (hash << 5) + hash + identifier.charCodeAt(i)
        }
        return colors[Math.abs(hash) % colors.length]
      }

      filteredCourses.forEach(course => {
        if (course.schedule && course.schedule.date) {
          const dateStr = course.schedule.date
          const dateParts = dateStr.split('-')
          const courseDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
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

              const color = getCourseColor(course)

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

  formatDateStr(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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

    const schedule = course.schedule || {}
    let dateStr = schedule.date || ''
    if (dateStr && !dateStr.includes('-')) {
      const date = new Date(dateStr)
      dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    this.setData({
      isEditing: true,
      editDate: dateStr,
      editStartTime: schedule.startTime || '',
      editEndTime: schedule.endTime || '',
      editClassroom: schedule.classroom || ''
    })
  },

  onEditDateChange(e) {
    this.setData({ editDate: e.detail.value })
  },

  onEditStartTimeChange(e) {
    this.setData({ editStartTime: e.detail.value })
  },

  onEditEndTimeChange(e) {
    this.setData({ editEndTime: e.detail.value })
  },

  onEditClassroomInput(e) {
    this.setData({ editClassroom: e.detail.value })
  },

  onCancelEdit() {
    this.setData({ isEditing: false })
  },

  async onSaveEdit() {
    const course = this.data.selectedCourse
    if (!course) return

    const { editDate, editStartTime, editEndTime, editClassroom } = this.data

    if (!editDate || !editStartTime || !editEndTime) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      })
      return
    }

    const updateData = {}
    if (editDate) updateData.date = editDate
    if (editStartTime) updateData.startTime = editStartTime
    if (editEndTime) updateData.endTime = editEndTime
    if (editClassroom !== undefined) updateData.classroom = editClassroom

    console.log('editCourseSchedule called:', {
      courseId: course._id,
      updateData: updateData
    })

    const result = await api.editCourseSchedule(course._id, updateData)

    console.log('editCourseSchedule result:', result)

    if (result) {
      wx.showToast({
        title: '修改成功',
        icon: 'success'
      })
      this.setData({ isEditing: false })
      this.loadSchedule()
    } else {
      wx.showToast({
        title: '修改失败',
        icon: 'none'
      })
    }
  }
})