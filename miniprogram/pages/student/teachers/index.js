const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    theme: 'dark',
    boundTeachers: [],
    bindCode: '',
    expandedTeacherId: '',
    teacherCoursesMap: {},
    loadingCoursesFor: '',
    enrolledCourseIds: {},
    pendingCourseIds: {}
  },

  onLoad() {
    if (!checkRole.checkStudent()) {
      return
    }
  },

  onShow() {
    if (!checkRole.checkStudent()) {
      return
    }
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)
    this.loadData()
  },

  async loadData() {
    await Promise.all([
      this.loadBoundTeachers(),
      this.loadStudentCourseStates()
    ])
    if (this.data.expandedTeacherId) {
      await this.loadTeacherCourses(this.data.expandedTeacherId)
    }
  },

  async loadStudentCourseStates() {
    const studentId = app.globalData.openid
    const [myCourses, myApps] = await Promise.all([
      api.getMyCourses(studentId).catch(() => []),
      api.getMyApplications(studentId).catch(() => [])
    ])
    const enrolledCourseIds = {}
    ;(myCourses || []).forEach(c => {
      if (c && c._id) enrolledCourseIds[c._id] = true
    })
    const pendingCourseIds = {}
    ;(myApps || []).forEach(a => {
      if (a && a.courseId && a.status === 'pending') {
        pendingCourseIds[a.courseId] = true
      }
    })
    this.setData({ enrolledCourseIds, pendingCourseIds })
  },

  async loadBoundTeachers() {
    const studentId = app.globalData.openid
    const res = await api.getTeachers(studentId)

    if (res) {
      const boundTeachers = res.filter(t => t.bindingStatus === 'approved')
      const teachers = boundTeachers.map(item => ({
        _id: item._id,
        teacherId: item.teacherId || item.openid,
        teacherName: item.teacherName || item.name,
        teacherAvatar: item.teacherAvatar || '',
        phone: item.phone || '',
        subject: item.subject || ''
      }))

      this.setData({
        boundTeachers: teachers
      })
    }
  },

  async onToggleTeacher(e) {
    const teacherId = e.currentTarget.dataset.teacherId
    if (!teacherId) return
    if (this.data.expandedTeacherId === teacherId) {
      this.setData({ expandedTeacherId: '' })
      return
    }
    this.setData({ expandedTeacherId: teacherId })
    await this.loadTeacherCourses(teacherId)
  },

  async loadTeacherCourses(teacherId) {
    this.setData({ loadingCoursesFor: teacherId })
    try {
      const res = await api.getCourses(teacherId)
      const { enrolledCourseIds, pendingCourseIds } = this.data
      const courses = (res || [])
        .filter(c => {
          if (c.status !== 'available') return false
          const sCount = Array.isArray(c.students) ? c.students.length : 0
          const cType = (c.classType === 'one_on_one' || c.classType === 'group')
            ? c.classType
            : (sCount > 1 ? 'group' : 'one_on_one')
          const allowApply = typeof c.allowApply === 'boolean' ? c.allowApply : (cType === 'group')
          // 已在班内或开放自主申请的班级（默认大班课）对学生可见，一对一私教班不对他人暴露
          return enrolledCourseIds[c._id] || allowApply
        })
        .map(c => {
          const sch = c.schedule || {}
          const sCount = Array.isArray(c.students) ? c.students.length : 0
          const cType = (c.classType === 'one_on_one' || c.classType === 'group')
            ? c.classType
            : (sCount > 1 ? 'group' : 'one_on_one')
          const cap = typeof c.capacity === 'number' ? c.capacity : (cType === 'one_on_one' ? 1 : 0)
          const isFull = cap > 0 && sCount >= cap
          const timeStr = sch.startTime ? `${sch.startTime}-${sch.endTime || ''}` : '时间待定'
          const roomStr = sch.classroom ? ` · ${sch.classroom}` : ''
          const typeStr = cType === 'group' ? (cap > 0 ? `大班课(${sCount}/${cap}人)` : `大班课(${sCount}人)`) : '一对一'
          return {
            ...c,
            scheduleSummary: `${typeStr} · ${timeStr}${roomStr}`,
            applyState: enrolledCourseIds[c._id]
              ? 'enrolled'
              : pendingCourseIds[c._id]
                ? 'pending'
                : isFull
                  ? 'full'
                  : 'canApply'
          }
        })
      this.setData({
        [`teacherCoursesMap.${teacherId}`]: courses
      })
    } finally {
      this.setData({ loadingCoursesFor: '' })
    }
  },

  async onApplyCourse(e) {
    const { courseId, courseName, teacherId, teacherName } = e.currentTarget.dataset
    if (!courseId || !teacherId) return

    wx.showModal({
      title: '确认申请课程',
      content: `确定向 ${teacherName || '教师'} 申请加入「${courseName || '该课程'}」吗？`,
      success: async (res) => {
        if (!res.confirm) return
        const studentId = app.globalData.openid
        const studentName = app.globalData.userInfo ? app.globalData.userInfo.name : ''
        const result = await api.applyCourse(studentId, courseId, {
          teacherId,
          studentName,
          courseName,
          teacherName
        })
        if (result !== null) {
          wx.showToast({
            title: '申请已提交',
            icon: 'success'
          })
          await this.loadStudentCourseStates()
          await this.loadTeacherCourses(teacherId)
        }
      }
    })
  },

  goToMyApplications() {
    wx.navigateTo({
      url: '/pages/student/applications/index'
    })
  },

  onBindCodeInput(e) {
    this.setData({ bindCode: e.detail.value })
  },

  async onVerifyBindCode() {
    const { bindCode } = this.data

    if (!bindCode || bindCode.length !== 6) {
      wx.showToast({
        title: '请输入6位绑定码',
        icon: 'none'
      })
      return
    }

    const studentId = app.globalData.openid
    const studentName = app.globalData.userInfo ? app.globalData.userInfo.name : ''

    const result = await api.verifyBindCode(studentId, studentName, bindCode)

    if (result) {
      wx.showToast({
        title: '绑定成功',
        icon: 'success'
      })
      this.setData({ bindCode: '' })
      this.loadData()
    }
  }
})
