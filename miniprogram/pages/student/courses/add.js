const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    loading: false,
    courseName: '',
    teacherName: '',
    price: '',
    classroom: '',
    startTime: '09:00',
    endTime: '10:00',
    isRepeat: false,

    // 重复课程
    repeatStartDate: '',
    repeatCount: 1,
    weekdayOptions: [
      { label: '一', value: 1, selected: false },
      { label: '二', value: 2, selected: false },
      { label: '三', value: 3, selected: false },
      { label: '四', value: 4, selected: false },
      { label: '五', value: 5, selected: false },
      { label: '六', value: 6, selected: false },
      { label: '日', value: 0, selected: false }
    ],

    // 月历点选
    selectedDates: [],
    selectCalendarMonthStart: null,
    selectCalendarMonthTitle: '',
    selectCalendarDays: []
  },

  onLoad() {
    if (!checkRole.checkStudent()) {
      return
    }

    const now = new Date()
    const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    this.setData({
      repeatStartDate: defaultDate,
      selectedDates: [defaultDate]
    })

    this.buildSelectCalendarMonth(now.getFullYear(), now.getMonth())
  },

  onCourseNameInput(e) {
    this.setData({ courseName: e.detail.value })
  },

  onTeacherNameInput(e) {
    this.setData({ teacherName: e.detail.value })
  },

  onPriceInput(e) {
    this.setData({ price: e.detail.value })
  },

  onClassroomInput(e) {
    this.setData({ classroom: e.detail.value })
  },

  onRepeatChange(e) {
    this.setData({ isRepeat: e.detail.value })
  },

  onStartTimeChange(e) {
    this.setData({ startTime: e.detail.value })
  },

  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value })
  },

  onRepeatStartDateChange(e) {
    this.setData({ repeatStartDate: e.detail.value })
  },

  onRepeatCountInput(e) {
    this.setData({ repeatCount: e.detail.value })
  },

  onRepeatCountFocus() {
    this.cachedRepeatCount = this.data.repeatCount
    this.setData({ repeatCount: '' })
  },

  onRepeatCountBlur() {
    const val = this.data.repeatCount
    if (val === '') {
      this.setData({ repeatCount: this.cachedRepeatCount || 1 })
    } else {
      const parsed = parseInt(val)
      if (isNaN(parsed) || parsed < 1) {
        wx.showToast({
          title: '重复次数必须是大于等于1的整数',
          icon: 'none'
        })
        this.setData({ repeatCount: this.cachedRepeatCount || 1 })
      } else {
        this.setData({ repeatCount: parsed })
      }
    }
  },

  onWeekdayTap(e) {
    const value = parseInt(e.currentTarget.dataset.value)
    const weekdayOptions = this.data.weekdayOptions.map(item => {
      if (item.value === value) {
        return { ...item, selected: !item.selected }
      }
      return item
    })
    this.setData({ weekdayOptions })
  },

  // 月历逻辑
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
            isSelected: selectedDates.includes(dateStr)
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
            isSelected: selectedDates.includes(dateStr)
          })
          currentDay++
        } else {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`
          row.push({
            day: currentDay,
            date: dateStr,
            isOtherMonth: false,
            isToday: dateStr === todayStr,
            isSelected: selectedDates.includes(dateStr)
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
  },

  async onSave() {
    const { courseName, teacherName, price, classroom, startTime, endTime, isRepeat, selectedDates, repeatStartDate, repeatCount } = this.data

    if (!courseName.trim()) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' })
      return
    }

    if (!teacherName.trim()) {
      wx.showToast({ title: '请输入教师姓名', icon: 'none' })
      return
    }

    const teacherId = 'custom_teacher'

    if (startTime >= endTime) {
      wx.showToast({ title: '开始时间必须早于结束时间', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      let result = null

      if (isRepeat) {
        const selectedWeekdays = this.data.weekdayOptions.filter(w => w.selected).map(w => w.value)
        if (selectedWeekdays.length === 0) {
          wx.showToast({ title: '请选择重复星期', icon: 'none' })
          this.setData({ loading: false })
          return
        }

        const courseData = {
          name: courseName,
          price: parseFloat(price) || 0,
          teacherId,
          teacherName: teacherName.trim(),
          schedule: {
            date: null,
            startTime,
            endTime,
            classroom
          },
          reminderTime: 0,
          status: 'available',
          students: [app.globalData.openid],
          isRepeat: true,
          weekdays: selectedWeekdays,
          repeatCount: parseInt(repeatCount) || 1,
          repeatStartDate,
          createdBy: app.globalData.openid,
          creatorRole: 'student'
        }

        result = await api.addCourse(courseData)
      } else {
        if (selectedDates.length === 0) {
          wx.showToast({ title: '请选择上课日期', icon: 'none' })
          this.setData({ loading: false })
          return
        }

        const sortedDates = [...selectedDates].sort()
        const courseData = {
          name: courseName,
          price: parseFloat(price) || 0,
          teacherId,
          teacherName: teacherName.trim(),
          schedule: {
            date: sortedDates[0],
            startTime,
            endTime,
            classroom
          },
          reminderTime: 0,
          status: 'available',
          students: [app.globalData.openid],
          isRepeat: false,
          createdBy: app.globalData.openid,
          creatorRole: 'student'
        }

        const firstResult = await api.addCourse(courseData)
        if (firstResult && firstResult.parentId) {
          const parentId = firstResult.parentId
          const otherDates = sortedDates.slice(1)

          if (otherDates.length > 0) {
            const promises = otherDates.map(date => {
              return api.addCourseSchedule({
                name: courseName,
                price: parseFloat(price) || 0,
                teacherId,
                teacherName: teacherName.trim(),
                parentId: parentId,
                schedule: {
                  date,
                  startTime,
                  endTime,
                  classroom
                },
                reminderTime: 0,
                status: 'available',
                students: [app.globalData.openid],
                isRepeat: false,
                createdBy: app.globalData.openid,
                creatorRole: 'student'
              })
            })
            await Promise.all(promises)
          }
          result = firstResult
        }
      }

      if (result) {
        wx.showToast({ title: '添加课程成功', icon: 'success' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    } catch (err) {
      console.error('添加课程失败:', err)
      wx.showToast({ title: err.message || '添加失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
