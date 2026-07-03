const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    loading: false,
    courseId: '',
    course: null,
    isCreatedByStudent: false,
    isEditMode: false,

    // 编辑字段
    editName: '',
    editPrice: '',
    editClassroom: '',
    editStartTime: '09:00',
    editEndTime: '10:00',

    // 教师选择
    teacherOptions: [],
    teacherIndex: -1,
    isCustomTeacher: false,
    customTeacherName: '',

    // 日程排课点选
    selectedDates: [],
    selectCalendarMonthStart: null,
    selectCalendarMonthTitle: '',
    selectCalendarDays: []
  },

  onLoad(options) {
    if (!checkRole.checkStudent()) {
      return
    }

    if (options.id) {
      this.setData({ courseId: options.id })
    }
  },

  onShow() {
    if (this.data.courseId) {
      this.loadCourseDetail()
    }
  },

  async loadCourseDetail() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('courses').doc(this.data.courseId).get()
      const course = res.data

      if (course) {
        const schedules = await api.getCourseSchedules(this.data.courseId) || []
        const selectedDates = schedules.map(s => s.schedule.date).filter(Boolean)

        const isCreatedByStudent = course.creatorRole === 'student' || course.createdBy === app.globalData.openid

        this.setData({
          course,
          isCreatedByStudent,
          selectedDates,
          editName: course.name || '',
          editPrice: course.price || '',
          editClassroom: course.schedule.classroom || '',
          editStartTime: course.schedule.startTime || '09:00',
          editEndTime: course.schedule.endTime || '10:00'
        })

        // 初始化月历展示
        const now = new Date()
        this.buildSelectCalendarMonth(now.getFullYear(), now.getMonth())
      }
    } catch (err) {
      console.error('获取课程详情失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadBoundTeachers() {
    const studentId = app.globalData.openid
    const res = await api.getTeachers(studentId)
    const options = [
      { name: '手动输入 (非系统绑定教师)', id: 'custom', isCustom: true }
    ]
    if (res) {
      const bound = res.filter(t => t.bindingStatus === 'approved')
      bound.forEach(item => {
        options.push({
          name: `${item.teacherName} (学课教师)`,
          id: item.teacherId || item.openid,
          realName: item.teacherName,
          isCustom: false
        })
      })
    }

    let teacherIndex = 0
    let isCustomTeacher = true
    const currentTeacherId = this.data.course ? this.data.course.teacherId : ''

    if (currentTeacherId) {
      const idx = options.findIndex(o => o.id === currentTeacherId)
      if (idx !== -1) {
        teacherIndex = idx
        isCustomTeacher = false
      } else {
        isCustomTeacher = true
        teacherIndex = 0
      }
    }

    this.setData({
      teacherOptions: options,
      teacherIndex,
      isCustomTeacher,
      customTeacherName: isCustomTeacher ? (this.data.course ? this.data.course.teacherName : '') : ''
    })
  },

  onTeacherChange(e) {
    const index = parseInt(e.detail.value)
    const selected = this.data.teacherOptions[index]
    this.setData({
      teacherIndex: index,
      isCustomTeacher: selected.isCustom
    })
  },

  onEditNameInput(e) {
    this.setData({ editName: e.detail.value })
  },

  onCustomTeacherNameInput(e) {
    this.setData({ customTeacherName: e.detail.value })
  },

  onEditPriceInput(e) {
    this.setData({ editPrice: e.detail.value })
  },

  onClassroomInput(e) {
    this.setData({ editClassroom: e.detail.value })
  },

  onStartTimeChange(e) {
    this.setData({ editStartTime: e.detail.value })
  },

  onEndTimeChange(e) {
    this.setData({ editEndTime: e.detail.value })
  },

  onStartEdit() {
    this.setData({ isEditMode: true })
    this.loadBoundTeachers()
    
    // 强制重绘带点选样式的月历
    const current = this.data.selectCalendarMonthStart || new Date()
    this.buildSelectCalendarMonth(current.getFullYear(), current.getMonth())
  },

  onCancelEdit() {
    this.setData({ isEditMode: false })
    this.loadCourseDetail()
  },

  async onSaveEdit() {
    const { courseId, editName, editPrice, editClassroom, editStartTime, editEndTime, selectedDates, isCustomTeacher, customTeacherName, teacherIndex, teacherOptions } = this.data

    if (!editName.trim()) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' })
      return
    }

    let teacherId = ''
    let teacherName = ''

    if (isCustomTeacher) {
      if (!customTeacherName.trim()) {
        wx.showToast({ title: '请输入教师姓名', icon: 'none' })
        return
      }
      teacherId = 'custom_teacher'
      teacherName = customTeacherName.trim()
    } else {
      const selected = teacherOptions[teacherIndex]
      if (!selected) {
        wx.showToast({ title: '请选择教师', icon: 'none' })
        return
      }
      teacherId = selected.id
      teacherName = selected.realName
    }

    if (editStartTime >= editEndTime) {
      wx.showToast({ title: '开始时间必须早于结束时间', icon: 'none' })
      return
    }

    if (selectedDates.length === 0) {
      wx.showToast({ title: '请至少选择一个上课日期', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      const sortedDates = [...selectedDates].sort()
      const updateData = {
        courseId,
        name: editName.trim(),
        price: parseFloat(editPrice) || 0,
        teacherId,
        teacherName,
        schedule: {
          date: sortedDates[0],
          startTime: editStartTime,
          endTime: editEndTime,
          classroom: editClassroom
        },
        students: [app.globalData.openid],
        selectedDates: sortedDates,
        createdBy: app.globalData.openid,
        creatorRole: 'student'
      }

      const result = await api.editCourse(updateData)
      if (result) {
        wx.showToast({ title: '更新成功', icon: 'success' })
        this.setData({ isEditMode: false })
        this.loadCourseDetail()
      }
    } catch (err) {
      console.error('更新课程失败:', err)
      wx.showToast({ title: err.message || '更新失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onDeleteCourse() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这门课程吗？此操作将同时删除所有具体的单日上课记录。',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ loading: true })
          try {
            const result = await api.deleteCourse(this.data.courseId, app.globalData.openid)
            if (result) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              setTimeout(() => {
                wx.navigateBack()
              }, 1500)
            }
          } catch (err) {
            console.error('删除课程失败:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          } finally {
            this.setData({ loading: false })
          }
        }
      }
    })
  },

  // 月历排程逻辑
  buildSelectCalendarMonth(year, month) {
    const calendarDays = []
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay() === 0 ? 7 : firstDay.getDay()

    const title = `${year}年${month + 1}月`
    const selectedDates = this.data.selectedDates || []

    let currentDay = 1
    for (let i = 0; i < 6; i++) {
      const row = []
      for (let j = 0; j < 7; j++) {
        if (i === 0 && j < startDayOfWeek - 1) {
          const prevMonthLastDay = new Date(year, month, 0).getDate()
          const day = prevMonthLastDay - (startDayOfWeek - 2) + j
          const prevMonthDate = new Date(year, month - 1, day)
          const dateStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(prevMonthDate.getDate()).padStart(2, '0')}`
          row.push({
            day,
            date: dateStr,
            isOtherMonth: true,
            isToday: false,
            isSelected: selectedDates.includes(dateStr),
            hasSchedule: selectedDates.includes(dateStr)
          })
        } else if (currentDay > daysInMonth) {
          const day = currentDay - daysInMonth
          const nextMonthDate = new Date(year, month + 1, day)
          const dateStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(nextMonthDate.getDate()).padStart(2, '0')}`
          row.push({
            day,
            date: dateStr,
            isOtherMonth: true,
            isToday: false,
            isSelected: selectedDates.includes(dateStr),
            hasSchedule: selectedDates.includes(dateStr)
          })
          currentDay++
        } else {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`
          row.push({
            day: currentDay,
            date: dateStr,
            isOtherMonth: false,
            isToday: dateStr === todayStr,
            isSelected: selectedDates.includes(dateStr),
            hasSchedule: selectedDates.includes(dateStr)
          })
          currentDay++
        }
      }
      calendarDays.push(row)
    }

    this.setData({
      selectCalendarMonthStart: new Date(year, month, 1),
      selectCalendarMonthTitle: title,
      selectCalendarDays: calendarDays
    })
  },

  onPrevSelectCalendarMonth() {
    const current = this.data.selectCalendarMonthStart
    if (!current) return

    const prevMonth = new Date(current)
    prevMonth.setMonth(current.getMonth() - 1)
    this.buildSelectCalendarMonth(prevMonth.getFullYear(), prevMonth.getMonth())
  },

  onNextSelectCalendarMonth() {
    const current = this.data.selectCalendarMonthStart
    if (!current) return

    const nextMonth = new Date(current)
    nextMonth.setMonth(current.getMonth() + 1)
    this.buildSelectCalendarMonth(nextMonth.getFullYear(), nextMonth.getMonth())
  },

  onSelectCalendarDayTap(e) {
    const dayItem = e.currentTarget.dataset.day
    if (!dayItem || !dayItem.date) return

    const dateStr = dayItem.date
    let selectedDates = [...(this.data.selectedDates || [])]
    const index = selectedDates.indexOf(dateStr)

    if (index === -1) {
      selectedDates.push(dateStr)
    } else {
      selectedDates.splice(index, 1)
    }

    this.setData({ selectedDates })

    const current = this.data.selectCalendarMonthStart
    if (current) {
      this.buildSelectCalendarMonth(current.getFullYear(), current.getMonth())
    }
  }
})
