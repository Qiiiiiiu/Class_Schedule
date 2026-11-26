const app = getApp()
const checkRole = require('../../../../utils/checkRole.js')
const api = require('../../../../utils/api.js')

Page({
  data: {
    theme: 'dark',
    studentId: '',
    student: {},
    studentDetail: {
      nativePlace: '',
      grade: '',
      subject: '',
      remark: ''
    },
    editing: false,
    logs: [],
    enrolledClasses: [],
    oneOnOneClasses: [],
    groupClasses: [],
    dialog: {
      show: false,
      type: '',
      title: '',
      desc: '',
      placeholder: '',
      value: ''
    }
  },

  onLoad(options) {
    if (!checkRole.checkTeacher()) {
      return
    }
    if (options.studentId) {
      this.setData({
        studentId: options.studentId
      })
    } else {
      wx.showToast({
        title: '学生 ID 缺失',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)
    this.loadDetail()
  },

  formatLogTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },

  async loadDetail() {
    if (!this.data.studentId) return

    wx.showLoading({ title: '加载中...' })
    try {
      const teacherId = app.globalData.openid
      const [detail, studentCourses] = await Promise.all([
        api.getStudentDetail(teacherId, this.data.studentId),
        api.getStudentCourses(this.data.studentId, teacherId).catch(() => [])
      ])

      const enrolledClasses = (studentCourses || []).map(c => {
        const classType = (c.classType === 'one_on_one' || c.classType === 'group')
          ? c.classType
          : (Array.isArray(c.students) && c.students.length > 1 ? 'group' : 'one_on_one')
        return {
          _id: c._id,
          name: c.name || '未命名班级',
          classType,
          classTypeLabel: classType === 'group' ? '大班课' : '一对一',
          status: c.status || 'available',
          studentCount: Array.isArray(c.students) ? c.students.length : (c.studentCount || 0)
        }
      })
      const oneOnOneClasses = enrolledClasses.filter(c => c.classType === 'one_on_one')
      const groupClasses = enrolledClasses.filter(c => c.classType === 'group')

      if (detail) {
        const rawLogs = detail.hourLogs || []
        const sortedLogs = [...rawLogs].reverse()
        const logs = sortedLogs.map(log => {
          let typeStr = ''
          let amountStr = ''
          let classStr = ''
          if (log.type === 'purchase') {
            typeStr = '购买课时'
            amountStr = `+${log.amount}`
            classStr = 'buy'
          } else if (log.type === 'adjust') {
            typeStr = '调整课时'
            amountStr = log.amount > 0 ? `+${log.amount}` : `${log.amount}`
            classStr = 'adjust'
          } else if (log.type === 'refund') {
            typeStr = '退费'
            amountStr = `-${log.amount}`
            classStr = 'refund'
          }
          return {
            ...log,
            typeStr,
            amountStr,
            classStr,
            timeStr: this.formatLogTime(log.createTime)
          }
        })

        this.setData({
          student: {
            studentName: detail.studentName,
            studentPhone: detail.studentPhone,
            avatar: detail.avatar,
            status: detail.status,
            statusStr: detail.statusStr,
            purchasedHours: detail.purchasedHours || 0,
            remainingHours: detail.remainingHours || 0
          },
          studentDetail: {
            nativePlace: detail.nativePlace || '',
            grade: detail.grade || '',
            subject: detail.subject || '',
            remark: detail.remark || ''
          },
          logs: logs,
          enrolledClasses,
          oneOnOneClasses,
          groupClasses
        })
      }
    } catch (err) {
      console.error('加载学生详情失败:', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  toggleEditMode() {
    this.setData({
      editing: !this.data.editing
    })
  },

  onNativePlaceInput(e) {
    this.setData({
      'studentDetail.nativePlace': e.detail.value
    })
  },

  onGradeInput(e) {
    this.setData({
      'studentDetail.grade': e.detail.value
    })
  },

  onSubjectInput(e) {
    this.setData({
      'studentDetail.subject': e.detail.value
    })
  },

  onRemarkInput(e) {
    this.setData({
      'studentDetail.remark': e.detail.value
    })
  },

  async onSaveDetail() {
    const { studentId, studentDetail } = this.data
    const teacherId = app.globalData.openid

    wx.showLoading({ title: '保存中...' })
    try {
      const result = await api.saveStudentDetail(teacherId, studentId, studentDetail)
      if (result) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        this.setData({ editing: false })
        this.loadDetail()
      }
    } catch (err) {
      console.error('保存失败:', err)
    } finally {
      wx.hideLoading()
    }
  },

  /* 课时操作 Dialog */
  createRequestId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },

  onShowBuyDialog() {
    this._dialogRequestId = this.createRequestId('buy')
    this.setData({
      dialog: {
        show: true,
        type: 'buy',
        title: '购买课时',
        desc: '请输入本次购买课时数：',
        placeholder: '例如: 10',
        value: ''
      }
    })
  },

  onShowAdjustDialog() {
    this._dialogRequestId = this.createRequestId('adjust')
    this.setData({
      dialog: {
        show: true,
        type: 'adjust',
        title: '调整课时',
        desc: '调整未上课时，输入正数增加，负数减少：',
        placeholder: '例如: 2 或 -2',
        value: ''
      }
    })
  },

  onShowRefundDialog() {
    this._dialogRequestId = this.createRequestId('refund')
    this.setData({
      dialog: {
        show: true,
        type: 'refund',
        title: '课时退费',
        desc: '请输入本次退费课时数（不能大于未上课时）：',
        placeholder: '例如: 5',
        value: ''
      }
    })
  },

  onCloseDialog() {
    if (this._submitting) return
    this._dialogRequestId = ''
    this.setData({
      'dialog.show': false
    })
  },

  onDialogInput(e) {
    this.setData({
      'dialog.value': e.detail.value
    })
  },

  async onConfirmDialog() {
    if (this._submitting) return

    const { type, value } = this.data.dialog
    const amount = parseFloat(value)

    if (!Number.isFinite(amount)) {
      wx.showToast({
        title: '请输入有效数字',
        icon: 'none'
      })
      return
    }

    const teacherId = app.globalData.openid
    const studentId = this.data.studentId
    const requestId = this._dialogRequestId || this.createRequestId(type || 'hours')
    let result = null

    if (type === 'buy') {
      if (amount <= 0) {
        wx.showToast({ title: '课时数需大于0', icon: 'none' })
        return
      }
    } else if (type === 'adjust') {
      if (amount === 0) {
        wx.showToast({ title: '课时数不能为0', icon: 'none' })
        return
      }
      const currentRemaining = this.data.student.remainingHours || 0
      if (currentRemaining + amount < 0) {
        wx.showToast({ title: '调整后未上课时不能为负数', icon: 'none' })
        return
      }
    } else if (type === 'refund') {
      if (amount <= 0) {
        wx.showToast({ title: '课时数需大于0', icon: 'none' })
        return
      }
      const currentRemaining = this.data.student.remainingHours || 0
      if (amount > currentRemaining) {
        wx.showToast({ title: '退费数不能大于未上课时', icon: 'none' })
        return
      }
    }

    this._submitting = true
    wx.showLoading({ title: '提交中...', mask: true })

    try {
      if (type === 'buy') {
        result = await api.purchaseStudentHours(teacherId, studentId, amount, requestId)
      } else if (type === 'adjust') {
        result = await api.adjustStudentHours(teacherId, studentId, amount, requestId)
      } else if (type === 'refund') {
        result = await api.refundStudentHours(teacherId, studentId, amount, requestId)
      }

      if (result) {
        wx.showToast({
          title: '操作成功',
          icon: 'success'
        })
        this._dialogRequestId = ''
        this.setData({ 'dialog.show': false })
        this.loadDetail()
      }
    } catch (err) {
      console.error('课时修改失败:', err)
    } finally {
      this._submitting = false
      wx.hideLoading()
    }
  },

  onOpenClassDetail(e) {
    const classId = e.currentTarget.dataset.id
    if (!classId) return
    wx.navigateTo({
      url: `/pages/teacher/courses/detail?id=${classId}`
    })
  },

  stopPropagation() {}
})
