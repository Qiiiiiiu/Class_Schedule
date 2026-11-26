const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')

Page({
  data: {
    theme: 'dark',
    classId: '',
    currentTab: 'schedules',
    loading: false,
    classInfo: null,
    schedules: [],
    upcomingCount: 0,
    finishedCount: 0,
    earnedAmount: 0,
    totalAmount: 0,
    members: [],
    allTeacherStudents: [],
    classApplications: [],

    // 单节改期弹窗
    showEditScheduleModal: false,
    editingScheduleId: '',
    editDate: '',
    editStartTime: '',
    editEndTime: '',
    editClassroom: '',

    // 学员管理弹窗
    showMemberModal: false,
    memberSearchKey: '',
    selectableStudents: [],
    filteredSelectableStudents: [],
    savingMembers: false
  },

  onLoad(options = {}) {
    if (!checkRole.checkTeacher()) return
    if (!options.id) {
      wx.showToast({ title: '班级ID缺失', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({ classId: options.id })
  },

  onShow() {
    if (!checkRole.checkTeacher()) return
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)
    if (this.data.classId) {
      this.loadAll()
    }
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh())
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab && tab !== this.data.currentTab) {
      this.setData({ currentTab: tab })
    }
  },

  async loadAll() {
    const { classId } = this.data
    const teacherId = app.globalData.openid
    if (!classId || !teacherId) return

    this.setData({ loading: true })
    try {
      const [allCoursesRes, schedulesRes, studentsRes, appsRes] = await Promise.all([
        api.getCourses(teacherId).catch(() => []),
        api.getCourseSchedules(classId).catch(() => []),
        api.getStudents(teacherId).catch(() => []),
        api.getPendingApplications(teacherId).catch(() => [])
      ])

      let courseRes = (allCoursesRes || []).find(c => c._id === classId) || null
      if (!courseRes) {
        const cachedList = app.globalData.coursesCache && app.globalData.coursesCache.data
        if (Array.isArray(cachedList)) {
          courseRes = cachedList.find(c => c._id === classId) || null
        }
      }

      if (!courseRes) {
        this.setData({ classInfo: null })
        return
      }

      const studentIds = Array.isArray(courseRes.students) ? courseRes.students.map(String) : []
      const classType = (courseRes.classType === 'one_on_one' || courseRes.classType === 'group')
        ? courseRes.classType
        : (studentIds.length > 1 ? 'group' : 'one_on_one')
      const capacity = typeof courseRes.capacity === 'number'
        ? courseRes.capacity
        : (classType === 'one_on_one' ? 1 : 0)
      const billingMode = classType === 'group' && courseRes.billingMode === 'per_student'
        ? 'per_student'
        : 'per_session'

      const classInfo = {
        ...courseRes,
        classType,
        classTypeLabel: classType === 'group' ? '大班课' : '一对一',
        capacity,
        capacityLabel: capacity > 0 ? `${studentIds.length}/${capacity}人` : `${studentIds.length}人`,
        billingMode,
        billingLabel: billingMode === 'per_student' ? '按人头计费' : '按班次计费',
        studentCount: studentIds.length
      }

      wx.setNavigationBarTitle({ title: classInfo.name || '班级详情' })

      // 处理下属课时排程与金额统计
      const now = new Date()
      const pricePerHour = classInfo.price || 0
      let finishedCount = 0
      let upcomingCount = 0
      let totalAmount = 0
      let earnedAmount = 0

      const formattedSchedules = (schedulesRes || []).map(item => {
        const sch = item.schedule || {}
        const dateStr = sch.date || ''
        const startTime = sch.startTime || ''
        const endTime = sch.endTime || ''
        let isFinished = false

        if (dateStr && startTime) {
          const dt = new Date(`${dateStr}T${startTime}:00`)
          isFinished = !isNaN(dt.getTime()) && dt < now
        }
        if (isFinished) finishedCount++
        else upcomingCount++

        if (startTime && endTime) {
          const [sh, sm] = startTime.split(':').map(Number)
          const [eh, em] = endTime.split(':').map(Number)
          const hours = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
          const sCount = (Array.isArray(item.students) && item.students.length > 0)
            ? item.students.length
            : studentIds.length
          const multiplier = billingMode === 'per_student' ? sCount : 1
          const amt = hours * (item.price || pricePerHour) * multiplier
          totalAmount += amt
          if (isFinished) earnedAmount += amt
        }

        return {
          ...item,
          dateStr,
          timeRange: startTime && endTime ? `${startTime} - ${endTime}` : '时间待定',
          classroom: sch.classroom || '未设置地点',
          isFinished
        }
      }).sort((a, b) => {
        // 待上课在前按时间升序，已结束在后按时间降序
        if (a.isFinished !== b.isFinished) return a.isFinished ? 1 : -1
        const keyA = `${a.dateStr} ${a.schedule && a.schedule.startTime || ''}`
        const keyB = `${b.dateStr} ${b.schedule && b.schedule.startTime || ''}`
        return a.isFinished ? keyB.localeCompare(keyA) : keyA.localeCompare(keyB)
      })

      // 处理在读学员列表
      const studentMap = {}
      ;(studentsRes || []).forEach(s => {
        studentMap[String(s.studentId)] = s
      })

      const members = studentIds.map(sid => {
        const info = studentMap[sid] || {}
        return {
          studentId: sid,
          studentName: info.studentName || '未命名学生',
          status: info.status || 'approved',
          statusStr: info.status === 'approved' ? '已绑定' : info.status === 'unbound' ? '教师录入' : '待确认',
          remainingHours: info.remainingHours !== undefined ? info.remainingHours : null
        }
      })

      // 筛选本班待审批入班申请
      const classApplications = (appsRes || [])
        .filter(a => a.courseId === classId)
        .map(a => ({
          ...a,
          applyTimeStr: this.formatTime(a.applyTime)
        }))

      this.setData({
        classInfo,
        schedules: formattedSchedules,
        finishedCount,
        upcomingCount,
        earnedAmount: Math.round(earnedAmount * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        members,
        allTeacherStudents: studentsRes || [],
        classApplications
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  // 跳转到排课页为本班追加课时（单次多选 / 重复排课）
  onAddSchedule() {
    const { classInfo } = this.data
    if (!classInfo) return
    const courseData = encodeURIComponent(JSON.stringify(classInfo))
    wx.navigateTo({
      url: `/pages/teacher/courses/add?mode=edit&courseId=${classInfo._id}&courseData=${courseData}`
    })
  },

  // 切换大班计费方式（按班次计费 <-> 按人头计费）
  onToggleBillingMode() {
    const { classInfo } = this.data
    if (!classInfo || classInfo.classType !== 'group') return
    const nextMode = classInfo.billingMode === 'per_student' ? 'per_session' : 'per_student'
    const nextLabel = nextMode === 'per_student' ? '按人头计费（时长 × 单价 × 学生人数）' : '按班次计费（时长 × 单价）'

    wx.showModal({
      title: '切换计费方式',
      content: `确定将大班课「${classInfo.name}」切换为${nextLabel}吗？`,
      success: async (res) => {
        if (!res.confirm) return
        const result = await api.editCourse({
          courseId: classInfo._id,
          name: classInfo.name,
          price: classInfo.price || 0,
          teacherId: classInfo.teacherId || app.globalData.openid,
          teacherName: classInfo.teacherName || '',
          schedule: classInfo.schedule || {},
          students: classInfo.students || [],
          classType: 'group',
          billingMode: nextMode
        })
        if (result !== null) {
          app.clearCache()
          app.globalData.refreshSchedule = true
          wx.showToast({ title: '已切换计费方式', icon: 'success' })
          this.loadAll()
        }
      }
    })
  },

  // 切换停课 / 复课
  onToggleStatus() {
    const { classInfo } = this.data
    if (!classInfo) return
    const nextStatus = classInfo.status === 'available' ? 'unavailable' : 'available'
    const actionText = nextStatus === 'available' ? '恢复开班' : '停课'

    wx.showModal({
      title: `确认${actionText}`,
      content: `确定要将班级「${classInfo.name}」设为${nextStatus === 'available' ? '进行中' : '已停课'}吗？`,
      success: async (res) => {
        if (!res.confirm) return
        const result = await api.updateCourseStatus(classInfo._id, nextStatus)
        if (result !== null) {
          app.clearCache()
          app.globalData.refreshSchedule = true
          wx.showToast({ title: `已${actionText}`, icon: 'success' })
          this.loadAll()
        }
      }
    })
  },

  // 发送本班上课提醒
  async onSendReminder() {
    const { classInfo } = this.data
    if (!classInfo) return
    const result = await api.sendReminder(classInfo._id, app.globalData.openid)
    if (!result) return

    if (result.teacherSuccess) {
      wx.showToast({ title: result.message || '提醒已发送', icon: 'success' })
    } else {
      wx.showModal({
        title: '发送未成功',
        content: result.message || '请前往班级列表页点击「重新开启上课提醒」获取额度后重试。',
        showCancel: false
      })
    }
  },

  // 删除整个班级
  onDeleteClass() {
    const { classInfo } = this.data
    if (!classInfo) return
    wx.showModal({
      title: '确认删除班级',
      content: '删除班级将同时移除下属全部排课记录，此操作不可恢复。',
      success: async (res) => {
        if (!res.confirm) return
        const result = await api.deleteCourse(classInfo._id, app.globalData.openid)
        if (result) {
          app.clearCache()
          app.globalData.refreshSchedule = true
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1000)
        }
      }
    })
  },

  // ===== 单节课时改期与删除 =====
  onOpenEditSchedule(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item._id) return
    const sch = item.schedule || {}
    this.setData({
      showEditScheduleModal: true,
      editingScheduleId: item._id,
      editDate: sch.date || '',
      editStartTime: sch.startTime || '09:00',
      editEndTime: sch.endTime || '10:00',
      editClassroom: sch.classroom || ''
    })
  },

  onCloseEditSchedule() {
    this.setData({ showEditScheduleModal: false })
  },

  onEditDateChange(e) { this.setData({ editDate: e.detail.value }) },
  onEditStartTimeChange(e) { this.setData({ editStartTime: e.detail.value }) },
  onEditEndTimeChange(e) { this.setData({ editEndTime: e.detail.value }) },
  onEditClassroomInput(e) { this.setData({ editClassroom: e.detail.value }) },

  async onSaveScheduleEdit() {
    const { editingScheduleId, editDate, editStartTime, editEndTime, editClassroom } = this.data
    if (!editDate || !editStartTime || !editEndTime) {
      wx.showToast({ title: '请填写完整日期与时间', icon: 'none' })
      return
    }
    if (editStartTime >= editEndTime) {
      wx.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' })
      return
    }

    const res = await api.editCourseSchedule(editingScheduleId, {
      date: editDate,
      startTime: editStartTime,
      endTime: editEndTime,
      classroom: editClassroom
    })
    if (res) {
      app.clearCache()
      app.globalData.refreshSchedule = true
      wx.showToast({ title: '改期成功', icon: 'success' })
      this.setData({ showEditScheduleModal: false })
      this.loadAll()
    }
  },

  onDeleteSchedule(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除单节课时',
      content: '确定删除这节排课吗？',
      success: async (res) => {
        if (!res.confirm) return
        const result = await api.deleteCourseSchedule(id)
        if (result) {
          app.clearCache()
          app.globalData.refreshSchedule = true
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadAll()
        }
      }
    })
  },

  // ===== 班级学员管理（支持跨班并行，仅同步未来排课） =====
  onOpenMemberModal() {
    const { classInfo, allTeacherStudents } = this.data
    if (!classInfo) return
    const currentSet = new Set((classInfo.students || []).map(String))
    const list = (allTeacherStudents || [])
      .filter(s => s.status === 'approved' || s.status === 'unbound')
      .map(s => ({
        studentId: String(s.studentId),
        studentName: s.studentName || '未命名学生',
        statusStr: s.status === 'approved' ? '已绑定' : '教师录入',
        selected: currentSet.has(String(s.studentId))
      }))

    this.setData({
      showMemberModal: true,
      memberSearchKey: '',
      selectableStudents: list,
      filteredSelectableStudents: list
    })
  },

  onCloseMemberModal() {
    this.setData({ showMemberModal: false })
  },

  onMemberSearchInput(e) {
    const key = (e.detail.value || '').trim().toLowerCase()
    const filtered = key
      ? this.data.selectableStudents.filter(s => s.studentName.toLowerCase().includes(key))
      : this.data.selectableStudents
    this.setData({
      memberSearchKey: e.detail.value,
      filteredSelectableStudents: filtered
    })
  },

  onToggleSelectMember(e) {
    const targetId = String(e.currentTarget.dataset.studentId)
    const { classInfo, selectableStudents } = this.data
    const isOneOnOne = classInfo && classInfo.classType === 'one_on_one'
    const currentItem = selectableStudents.find(s => s.studentId === targetId)
    const willSelect = currentItem ? !currentItem.selected : true

    if (!isOneOnOne && willSelect && classInfo.capacity > 0) {
      const selectedCount = selectableStudents.filter(s => s.selected).length
      if (selectedCount >= classInfo.capacity) {
        wx.showToast({ title: `已达人数上限（${classInfo.capacity}人）`, icon: 'none' })
        return
      }
    }

    const updated = selectableStudents.map(s => {
      if (isOneOnOne) {
        return { ...s, selected: s.studentId === targetId ? willSelect : false }
      }
      return s.studentId === targetId ? { ...s, selected: !s.selected } : s
    })

    const key = (this.data.memberSearchKey || '').trim().toLowerCase()
    const filtered = key
      ? updated.filter(s => s.studentName.toLowerCase().includes(key))
      : updated

    this.setData({
      selectableStudents: updated,
      filteredSelectableStudents: filtered
    })
  },

  async onSaveMembers() {
    if (this.data.savingMembers) return
    const selectedIds = this.data.selectableStudents
      .filter(s => s.selected)
      .map(s => s.studentId)

    this.setData({ savingMembers: true })
    try {
      let res = await api.updateClassMembers(this.data.classId, selectedIds, { silent: true })
      // 若 updateClassMembers 尚未部署，降级走已部署的 editCourse 仅更新父班级学员名单（不传 selectedDates 避免重建子课）
      if (!res && this.data.classInfo) {
        const c = this.data.classInfo
        const fallback = await api.editCourse({
          courseId: this.data.classId,
          name: c.name,
          price: c.price || 0,
          teacherId: c.teacherId || app.globalData.openid,
          teacherName: c.teacherName || (app.globalData.userInfo && app.globalData.userInfo.name) || '',
          schedule: c.schedule || {},
          students: selectedIds
        })
        // 旧版 editCourse 成功时可能未返回 data（undefined），只要未返回 null 即视为成功
        if (fallback !== null) {
          res = { success: true }
        }
      }
      if (res) {
        app.clearCache()
        app.globalData.refreshSchedule = true
        wx.showToast({ title: '学员已更新', icon: 'success' })
        this.setData({ showMemberModal: false })
        this.loadAll()
      }
    } finally {
      this.setData({ savingMembers: false })
    }
  },

  onOpenStudentDetail(e) {
    const studentId = e.currentTarget.dataset.studentId
    if (!studentId) return
    wx.navigateTo({
      url: `/pages/teacher/students/detail/index?studentId=${studentId}`
    })
  },

  // ===== 本班待审入班申请 =====
  async onApproveApp(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item._id) return
    const res = await api.approveCourse(item._id, app.globalData.openid)
    if (res) {
      app.clearCache()
      app.globalData.refreshSchedule = true
      wx.showToast({ title: '已通过入班', icon: 'success' })
      this.loadAll()
    }
  },

  onRejectApp(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item._id) return
    wx.showModal({
      title: `拒绝 ${item.studentName || '学生'} 的入班申请`,
      content: '',
      editable: true,
      placeholderText: '请输入拒绝原因（选填）',
      success: async (res) => {
        if (!res.confirm) return
        const result = await api.rejectCourse(item._id, app.globalData.openid, (res.content || '').trim())
        if (result) {
          app.clearCache()
          wx.showToast({ title: '已拒绝', icon: 'success' })
          this.loadAll()
        }
      }
    })
  },

  stopPropagation() {}
})
