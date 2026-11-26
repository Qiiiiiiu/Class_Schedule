const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')
const config = require('../../../config.js')

const VALID_TABS = ['all', 'one_on_one', 'group', 'applications']

Page({
  data: {
    theme: 'dark',
    currentTab: 'all',
    allCourses: [],
    filteredCourses: [],
    oneOnOneCount: 0,
    groupCount: 0,
    applications: [],
    pendingApplicationsCount: 0,
    reminderQuota: 0
  },

  onLoad(options = {}) {
    if (!checkRole.checkTeacher()) {
      return
    }
    if (options && options.tab) {
      const targetTab = options.tab === 'courses' ? 'all' : options.tab
      if (VALID_TABS.includes(targetTab)) {
        this.setData({ currentTab: targetTab })
      }
    }
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)

    this.loadCourses()
    this.loadApplications()
    this.loadUserInfo()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.currentTab) return
    this.setData({ currentTab: tab }, () => {
      this.applyTabFilter()
    })
    if (tab === 'applications') {
      this.loadApplications()
    }
  },

  applyTabFilter() {
    const { allCourses, currentTab } = this.data
    let filtered = allCourses
    if (currentTab === 'one_on_one') {
      filtered = allCourses.filter(c => c.classType === 'one_on_one')
    } else if (currentTab === 'group') {
      filtered = allCourses.filter(c => c.classType === 'group')
    }
    this.setData({ filteredCourses: filtered })
  },

  normalizeCourse(item) {
    const studentCount = item.studentCount !== undefined
      ? item.studentCount
      : (Array.isArray(item.students) ? item.students.length : 0)
    const classType = (item.classType === 'one_on_one' || item.classType === 'group')
      ? item.classType
      : (studentCount > 1 ? 'group' : 'one_on_one')
    const capacity = typeof item.capacity === 'number'
      ? item.capacity
      : (classType === 'one_on_one' ? 1 : 0)
    const billingMode = classType === 'group' && item.billingMode === 'per_student'
      ? 'per_student'
      : 'per_session'

    return {
      ...item,
      classType,
      classTypeLabel: classType === 'group' ? '大班课' : '一对一',
      capacity,
      capacityLabel: capacity > 0 ? `${studentCount}/${capacity}人` : `${studentCount}人`,
      billingMode,
      billingLabel: billingMode === 'per_student' ? '按人头' : '按班次',
      studentCount,
      scheduleStr: this.formatSchedule(item)
    }
  },

  async loadUserInfo() {
    try {
      const openid = app.globalData.openid
      const userRes = await api.getUserInfo(openid)
      if (userRes) {
        app.globalData.userInfo = userRes
        this.setData({
          reminderQuota: Math.max(0, Number(userRes.reminderQuota) || 0)
        })
      }
    } catch (err) {
      console.error('获取用户信息失败:', err)
    }
  },

  async loadApplications() {
    try {
      const teacherId = app.globalData.openid
      const res = await api.getPendingApplications(teacherId)
      const list = (res || []).map(item => ({
        ...item,
        applyTimeStr: this.formatApplyTime(item.applyTime)
      }))
      this.setData({
        applications: list,
        pendingApplicationsCount: list.length
      })
    } catch (err) {
      console.error('加载入班申请失败:', err)
    }
  },

  formatApplyTime(ts) {
    if (!ts) return ''
    const date = new Date(ts)
    if (isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },

  async onApproveApplication(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item._id) return

    const result = await api.approveCourse(item._id, app.globalData.openid)
    if (result) {
      wx.showToast({
        title: '已通过入班申请',
        icon: 'success'
      })
      app.globalData.coursesCache = null
      app.globalData.dashboardCache = null
      app.globalData.refreshSchedule = true
      this.loadApplications()
      this.loadCourses()
    }
  },

  onRejectApplication(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item._id) return

    wx.showModal({
      title: `拒绝 ${item.studentName || '学生'} 的入班申请`,
      content: '',
      editable: true,
      placeholderText: '请输入拒绝原因（选填）',
      success: async (res) => {
        if (!res.confirm) return
        const remark = (res.content || '').trim()
        const result = await api.rejectCourse(item._id, app.globalData.openid, remark)
        if (result) {
          wx.showToast({
            title: '已拒绝申请',
            icon: 'success'
          })
          app.globalData.dashboardCache = null
          this.loadApplications()
        }
      }
    })
  },

  async loadCourses() {
    const now = Date.now()
    const cache = app.globalData.coursesCache

    if (cache && now - cache.timestamp < 30000) {
      this.setCoursesState(cache.data)
      return
    }

    try {
      const teacherId = app.globalData.openid

      let res = null
      try {
        res = await api.getCoursesWithStats(teacherId)
      } catch (err) {
        console.error('getCoursesWithStats 失败，使用降级方案:', err)
      }

      if (!res) {
        res = await api.getCourses(teacherId)
      }

      if (res && res.length > 0) {
        const nowDate = new Date()

        const coursesWithAmount = await Promise.all(res.map(async (item) => {
          if (item.totalAmount !== undefined && item.earnedAmount !== undefined) {
            return this.normalizeCourse(item)
          }

          let childCourses = []
          try {
            childCourses = await api.getCourseSchedules(item._id) || []
          } catch (err) {
            console.error('获取子课程失败:', err)
          }

          const normalized = this.normalizeCourse(item)
          const pricePerHour = item.price || 0
          let totalAmount = 0
          let earnedAmount = 0
          let finishedCourseCount = 0

          childCourses.forEach(child => {
            if (child.schedule && child.schedule.startTime && child.schedule.endTime) {
              const [startH, startM] = child.schedule.startTime.split(':').map(Number)
              const [endH, endM] = child.schedule.endTime.split(':').map(Number)
              const hours = Math.max(0, (endH * 60 + endM - startH * 60 - startM) / 60)
              const childStudents = (Array.isArray(child.students) && child.students.length > 0)
                ? child.students.length
                : normalized.studentCount
              const multiplier = normalized.billingMode === 'per_student' ? childStudents : 1
              const sessionAmt = hours * pricePerHour * multiplier

              totalAmount += sessionAmt
              if (child.schedule.date) {
                const courseDateTime = new Date(`${child.schedule.date}T${child.schedule.startTime}:00`)
                if (courseDateTime < nowDate) {
                  earnedAmount += sessionAmt
                  finishedCourseCount += 1
                }
              }
            }
          })

          return {
            ...normalized,
            childCourseCount: childCourses.length,
            finishedCourseCount,
            totalAmount: Math.round(totalAmount * 100) / 100,
            earnedAmount: Math.round(earnedAmount * 100) / 100
          }
        }))

        app.globalData.coursesCache = {
          data: coursesWithAmount,
          timestamp: Date.now()
        }

        this.setCoursesState(coursesWithAmount)
      } else {
        app.globalData.coursesCache = null
        this.setCoursesState([])
      }
    } catch (err) {
      console.error('loadCourses 失败:', err)
    }
  },

  setCoursesState(list) {
    const allCourses = list || []
    const oneOnOneCount = allCourses.filter(c => c.classType === 'one_on_one').length
    const groupCount = allCourses.filter(c => c.classType === 'group').length
    this.setData({
      allCourses,
      oneOnOneCount,
      groupCount
    }, () => {
      this.applyTabFilter()
    })
  },

  formatSchedule(course) {
    if (!course.schedule) return '未安排'
    const { schedule } = course
    const startTime = schedule.startTime || ''
    const endTime = schedule.endTime || ''
    const classroom = schedule.classroom || ''
    return `${startTime} - ${endTime} ${classroom}`.trim()
  },

  onAddCourse() {
    const defaultType = this.data.currentTab === 'group' ? 'group' : 'one_on_one'
    wx.navigateTo({
      url: `/pages/teacher/courses/add?classType=${defaultType}`
    })
  },

  onOpenClassDetail(e) {
    const course = e.currentTarget.dataset.course
    if (!course || !course._id) return
    wx.navigateTo({
      url: `/pages/teacher/courses/detail?id=${course._id}`
    })
  },

  onEditCourse(e) {
    const course = e.currentTarget.dataset.course
    if (!course || !course._id) return
    wx.navigateTo({
      url: `/pages/teacher/courses/detail?id=${course._id}`
    })
  },

  async onDeleteCourse(e) {
    const courseId = e.currentTarget.dataset.courseId

    wx.showModal({
      title: '确认删除班级',
      content: '删除班级将同时删除该班级下的全部排课记录，确定继续吗？',
      success: async (res) => {
        if (res.confirm) {
          const result = await api.deleteCourse(courseId, app.globalData.openid)
          if (result) {
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })
            app.globalData.coursesCache = null
            app.globalData.dashboardCache = null
            app.globalData.refreshSchedule = true
            this.loadCourses()
          }
        }
      }
    })
  },

  async onToggleCourseStatus(e) {
    const course = e.currentTarget.dataset.course
    if (!course || !course._id) return
    const nextStatus = course.status === 'available' ? 'unavailable' : 'available'
    const actionText = nextStatus === 'available' ? '恢复开班' : '停课'

    wx.showModal({
      title: `确认${actionText}`,
      content: `确定要将班级「${course.name}」设为${nextStatus === 'available' ? '进行中' : '已停课'}吗？`,
      success: async (res) => {
        if (!res.confirm) return
        const result = await api.updateCourseStatus(course._id, nextStatus)
        if (result !== null) {
          wx.showToast({
            title: `已${actionText}`,
            icon: 'success'
          })
          app.globalData.coursesCache = null
          app.globalData.dashboardCache = null
          app.globalData.refreshSchedule = true
          this.loadCourses()
        }
      }
    })
  },

  async onSendReminder(e) {
    const courseId = e.currentTarget.dataset.courseId
    const result = await api.sendReminder(courseId, app.globalData.openid)
    if (!result) return

    this.loadUserInfo()
    if (result.teacherSuccess) {
      wx.showToast({
        title: result.message || '提醒已发送',
        icon: 'success'
      })
    } else {
      wx.showModal({
        title: '发送未成功',
        content: result.message || '教师端订阅消息授权已过期或暂无待提醒课程，请点击上方「重新开启上课提醒」重新授权。',
        confirmText: '重新订阅',
        cancelText: '知道了',
        success: (modalRes) => {
          if (modalRes.confirm) {
            this.onReopenReminder()
          }
        }
      })
    }
  },

  async onReopenReminder() {
    try {
      const templateId = config.REMINDER_TEMPLATE_ID
      const authResult = await new Promise((resolve) => {
        wx.requestSubscribeMessage({
          tmplIds: [templateId],
          success: (res) => {
            resolve(res[templateId] === 'accept')
          },
          fail: () => {
            resolve(false)
          }
        })
      })

      if (!authResult) {
        wx.showModal({
          title: '订阅失败',
          content: '请同意订阅消息，以获得提醒额度',
          showCancel: false
        })
        return
      }

      wx.showLoading({ title: '同步订阅中...' })
      const result = await api.clearTeacherReminderMarks(app.globalData.openid)
      wx.hideLoading()

      if (result) {
        const newQuota = result.reminderQuota !== undefined ? result.reminderQuota : this.data.reminderQuota
        this.setData({ reminderQuota: newQuota })

        wx.showToast({
          title: result.message || '订阅成功',
          icon: 'success',
          duration: 2000
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('订阅消息失败:', err)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  onShowReminderInfo() {
    wx.showModal({
      title: '使用说明',
      content: '课程提醒为一次性订阅功能，每次点击订阅会增加 1 次提醒额度（上限 20）。为了避免漏提醒，建议在密集上课期间按需补充额度。',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
