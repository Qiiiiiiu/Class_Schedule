const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    students: [],
    totalStudents: 0,
    searchKey: '',
    showDetailModal: false,
    showAddModal: false,
    showMergeModal: false,
    currentStudent: null,
    studentDetail: {
      nativePlace: '',
      grade: '',
      subject: '',
      remark: ''
    },
    addStudentForm: {
      name: '',
      nativePlace: '',
      grade: '',
      subject: '',
      remark: ''
    },
    mergeSourceStudent: null,
    mergeTargetStudent: null,
    boundStudents: [],
    currentVerifyCode: '',
    expireTimeStr: '',
    addingStudent: false,
    editingDetail: false
  },

  onLoad() {
    if (!checkRole.checkTeacher()) {
      return
    }
  },

  onShow() {
    if (!checkRole.checkTeacher()) {
      return
    }
    this.loadStudents()
  },

  async loadStudents() {
    const teacherId = app.globalData.openid
    const res = await api.getStudents(teacherId)

    if (res) {
      const students = res.map(item => ({
        ...item,
        applyTimeStr: this.formatTime(item.applyTime),
        statusStr: item.status === 'approved' ? '已绑定' : item.status === 'pending' ? '待审核' : item.status === 'unbound' ? '未绑定' : '已拒绝'
      }))

      this.setData({
        students: students,
        totalStudents: students.filter(s => s.status === 'approved').length,
        boundStudents: students.filter(s => s.status === 'approved')
      })
    }
  },

  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  onSearchInput(e) {
    const key = e.detail.value
    this.setData({ searchKey: key })
    this.filterStudents(key)
  },

  onClearSearch() {
    this.setData({ searchKey: '' })
    this.loadStudents()
  },

  filterStudents(key) {
    if (!key) {
      this.loadStudents()
      return
    }

    const allStudents = this.data.students
    const filtered = allStudents.filter(s =>
      s.studentName.toLowerCase().includes(key.toLowerCase())
    )
    this.setData({ students: filtered })
  },

  async onGenerateCode() {
    const teacherName = app.globalData.userInfo ? app.globalData.userInfo.name : ''

    const result = await api.generateBindCode(
      app.globalData.openid,
      teacherName
    )

    if (result) {
      const expireDate = new Date(result.expireTime)
      const expireTimeStr = `${expireDate.getFullYear()}-${String(expireDate.getMonth() + 1).padStart(2, '0')}-${String(expireDate.getDate()).padStart(2, '0')} ${String(expireDate.getHours()).padStart(2, '0')}:${String(expireDate.getMinutes()).padStart(2, '0')}`

      this.setData({
        currentVerifyCode: result.verifyCode,
        expireTimeStr: expireTimeStr
      })

      wx.showToast({
        title: '绑定码已生成',
        icon: 'success'
      })
    }
  },

  onShowAddModal() {
    this.setData({
      showAddModal: true,
      addStudentForm: {
        name: '',
        nativePlace: '',
        grade: '',
        subject: '',
        remark: ''
      }
    })
  },

  onCloseAddModal() {
    this.setData({ showAddModal: false })
  },

  onAddNameInput(e) {
    this.setData({
      'addStudentForm.name': e.detail.value
    })
  },

  onAddNativePlaceInput(e) {
    this.setData({
      'addStudentForm.nativePlace': e.detail.value
    })
  },

  onAddGradeInput(e) {
    this.setData({
      'addStudentForm.grade': e.detail.value
    })
  },

  onAddSubjectInput(e) {
    this.setData({
      'addStudentForm.subject': e.detail.value
    })
  },

  onAddRemarkInput(e) {
    this.setData({
      'addStudentForm.remark': e.detail.value
    })
  },

  async onAddStudent() {
    if (this.data.addingStudent) {
      return
    }

    const { addStudentForm } = this.data

    if (!addStudentForm.name.trim()) {
      wx.showToast({
        title: '请输入学生姓名',
        icon: 'none'
      })
      return
    }

    this.setData({ addingStudent: true })

    try {
      const result = await api.addStudentByTeacher(
        app.globalData.openid,
        addStudentForm.name,
        addStudentForm.nativePlace,
        addStudentForm.grade,
        addStudentForm.subject,
        addStudentForm.remark
      )

      if (result) {
        wx.showToast({
          title: '添加成功',
          icon: 'success'
        })
        this.setData({ showAddModal: false })
        this.loadStudents()
      }
    } finally {
      this.setData({ addingStudent: false })
    }
  },

  onShowMergeModal(e) {
    const student = e.currentTarget.dataset.student
    this.setData({
      showMergeModal: true,
      mergeSourceStudent: student,
      mergeTargetStudent: null
    })
  },

  onCloseMergeModal() {
    this.setData({
      showMergeModal: false,
      mergeSourceStudent: null,
      mergeTargetStudent: null
    })
  },

  onSelectMergeTarget(e) {
    const student = e.currentTarget.dataset.student
    this.setData({ mergeTargetStudent: student })
  },

  async onMergeStudents() {
    const { mergeSourceStudent, mergeTargetStudent } = this.data

    if (!mergeSourceStudent || !mergeTargetStudent) {
      wx.showToast({
        title: '请选择目标学生',
        icon: 'none'
      })
      return
    }

    if (mergeSourceStudent.studentId === mergeTargetStudent.studentId) {
      wx.showToast({
        title: '不能与自己合并',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认合并',
      content: `确定将 "${mergeSourceStudent.studentName}" 合并到 "${mergeTargetStudent.studentName}" 吗？合并后将转移课程并删除源学生。`,
      success: async (res) => {
        if (res.confirm) {
          const result = await api.mergeStudents(
            app.globalData.openid,
            mergeSourceStudent.studentId,
            mergeTargetStudent.studentId
          )

          if (result) {
            wx.showToast({
              title: '合并成功',
              icon: 'success'
            })
            this.setData({
              showMergeModal: false,
              mergeSourceStudent: null,
              mergeTargetStudent: null
            })
            this.loadStudents()
          }
        }
      }
    })
  },

  async onViewDetail(e) {
    const student = e.currentTarget.dataset.student
    const studentId = student.studentId

    const detail = await api.getStudentDetail(app.globalData.openid, studentId)

    this.setData({
      showDetailModal: true,
      currentStudent: student,
      editingDetail: false,
      studentDetail: {
        nativePlace: detail ? (detail.nativePlace || '') : '',
        grade: detail ? (detail.grade || '') : '',
        subject: detail ? (detail.subject || '') : '',
        remark: detail ? (detail.remark || '') : ''
      }
    })
  },

  onStartEditDetail() {
    this.setData({ editingDetail: true })
  },

  onCloseDetailModal() {
    this.setData({ showDetailModal: false })
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
    const { currentStudent, studentDetail } = this.data
    const studentId = currentStudent.studentId

    const result = await api.saveStudentDetail(
      app.globalData.openid,
      studentId,
      studentDetail
    )

    if (result) {
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
      this.setData({ showDetailModal: false })
    }
  },

  stopPropagation() {

  },

  async onDeleteStudent(e) {
    const student = e.currentTarget.dataset.student

    wx.showModal({
      title: '删除学生',
      content: `确定要删除学生"${student.studentName}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          const courses = await api.getStudentCourses(student.studentId, app.globalData.openid)

          if (courses && courses.length > 0) {
            wx.showToast({
              title: '该学生名下有本老师的课，请删除课程后再删除学生',
              icon: 'none',
              duration: 3000
            })
            return
          }

          const result = await api.deleteStudent(
            app.globalData.openid,
            student.studentId
          )

          if (result) {
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })
            this.loadStudents()
          }
        }
      }
    })
  }
})
