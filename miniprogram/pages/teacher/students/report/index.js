const app = getApp()
const checkRole = require('../../../../utils/checkRole.js')
const api = require('../../../../utils/api.js')
const reportCanvas = require('../../../../utils/reportCanvas.js')

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateTimeStr(d) {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDateStr(d)} ${hh}:${mm}`
}

function addDaysStr(baseDateStr, offsetDays) {
  const parts = String(baseDateStr).split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return baseDateStr
  const d = new Date(parts[0], parts[1] - 1, parts[2] + offsetDays)
  return formatDateStr(d)
}

function calcDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return 0
  const [sh, sm] = String(startTime).split(':').map(Number)
  const [eh, em] = String(endTime).split(':').map(Number)
  if ([sh, sm, eh, em].some(isNaN)) return 0
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

function isScheduleFinished(dateStr, startTime, status, now) {
  if (status === 'finished') return true
  if (!dateStr || !startTime) return false
  const dp = String(dateStr).split('-').map(Number)
  const tp = String(startTime).split(':').map(Number)
  if (dp.length !== 3 || tp.length < 2 || dp.some(isNaN) || tp.some(isNaN)) return false
  const dt = new Date(dp[0], dp[1] - 1, dp[2], tp[0], tp[1], 0)
  return !isNaN(dt.getTime()) && dt < now
}

function formatMonthDayAndWeek(dateStr) {
  const parts = String(dateStr || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) {
    return { monthDay: '--', weekdayStr: '' }
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return {
    monthDay: `${String(parts[1]).padStart(2, '0')}/${String(parts[2]).padStart(2, '0')}`,
    weekdayStr: WEEK_NAMES[d.getDay()] || ''
  }
}

Page({
  data: {
    theme: 'dark',
    studentId: '',
    initialCourseId: '',
    loading: true,
    rendering: false,
    canvasHeight: 1200,
    posterPath: '',

    student: {},
    coursesSummary: [],
    scores: [],
    scoreStats: null,

    // 报告配置项
    courseScope: 'all', // 'all' | 'single' | 'none'
    selectedCourseId: '',
    activePreset: 'upcoming', // 'upcoming' | 'recent30' | 'all' | 'custom'
    startDate: '',
    endDate: '',
    includesPast: false,
    selectedRangeCount: 0,

    showScores: true,
    showHours: true,
    showFee: false
  },

  onLoad(options) {
    if (!checkRole.checkTeacher()) return
    const studentId = options.studentId || ''
    const courseId = options.courseId || ''
    if (!studentId) {
      wx.showToast({ title: '缺少学生 ID', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this._scheduleMap = {}
    this._renderSeq = 0

    const theme = app.globalData.theme || 'dark'
    app.applyThemeToSystem(theme)

    this.setData({
      theme,
      studentId,
      initialCourseId: courseId,
      courseScope: courseId ? 'single' : 'all'
    })

    this.loadReportData()
  },

  computeScoreStats(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return { count: 0, latest: '--', max: '--', avg: '--', deltaStr: '', deltaClass: '' }
    }
    const nums = records.map(r => r.score)
    const latest = records[records.length - 1].score
    const max = Math.round(Math.max(...nums) * 100) / 100
    const avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
    let deltaStr = ''
    let deltaClass = ''
    if (records.length >= 2) {
      const diff = Math.round((latest - records[records.length - 2].score) * 100) / 100
      if (diff > 0) {
        deltaStr = `+${diff}`
        deltaClass = 'up'
      } else if (diff < 0) {
        deltaStr = `${diff}`
        deltaClass = 'down'
      } else {
        deltaStr = '持平'
        deltaClass = 'flat'
      }
    }
    return { count: records.length, latest, max, avg, deltaStr, deltaClass }
  },

  async loadReportData() {
    const { studentId, initialCourseId } = this.data
    const teacherId = app.globalData.openid
    if (!studentId || !teacherId) return

    this.setData({ loading: true })
    try {
      const [detail, rawCourses] = await Promise.all([
        api.getStudentDetail(teacherId, studentId),
        api.getStudentCourses(studentId, teacherId).catch(() => [])
      ])

      if (!detail) {
        wx.showToast({ title: '加载学生信息失败', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      const courses = Array.isArray(rawCourses) ? rawCourses : []
      // 并行拉取每门课的子排课，确保精确统计已上/待上节数与单门课排课明细
      const scheduleLists = await Promise.all(
        courses.map(c => api.getCourseSchedules(c._id).catch(() => []))
      )

      const now = new Date()
      const scheduleMap = {}
      const coursesSummary = courses.map((c, idx) => {
        const classType = (c.classType === 'one_on_one' || c.classType === 'group')
          ? c.classType
          : (Array.isArray(c.students) && c.students.length > 1 ? 'group' : 'one_on_one')
        const billingMode = classType === 'group' && c.billingMode === 'per_student'
          ? 'per_student'
          : (classType === 'group' ? 'per_session' : 'one_on_one')
        const price = Number(c.price) || 0

        const rawList = Array.isArray(scheduleLists[idx]) ? scheduleLists[idx] : []
        const formatted = rawList
          .filter(item => {
            // 如果该子课记录了具体 students 数组且非空，确保包含当前学生（兼容历史老数据无 students 字段）
            if (Array.isArray(item.students) && item.students.length > 0) {
              return item.students.map(String).includes(String(studentId))
            }
            return true
          })
          .map(item => {
            const sch = item.schedule || {}
            const dateStr = sch.date || ''
            const startTime = sch.startTime || ''
            const endTime = sch.endTime || ''
            const isFinished = isScheduleFinished(dateStr, startTime, item.status, now)
            const hours = calcDurationHours(startTime, endTime)
            const { monthDay, weekdayStr } = formatMonthDayAndWeek(dateStr)
            const itemPrice = Number(item.price) || price
            // 面向单个学生的费用：一对一 或 大班按人头计费 才算单人费用
            const canCalcStudentFee = (classType === 'one_on_one') || (billingMode === 'per_student')
            const studentFee = canCalcStudentFee ? Math.round(hours * itemPrice * 100) / 100 : null

            return {
              _id: item._id,
              dateStr,
              monthDay,
              weekdayStr,
              startTime,
              endTime,
              timeRange: startTime && endTime ? `${startTime}-${endTime}` : '待定',
              classroom: sch.classroom || '未设地点',
              hours,
              isFinished,
              studentFee
            }
          })
          .sort((a, b) => {
            const ka = `${a.dateStr} ${a.startTime}`
            const kb = `${b.dateStr} ${b.startTime}`
            return ka.localeCompare(kb)
          })

        scheduleMap[c._id] = formatted

        const finishedList = formatted.filter(s => s.isFinished)
        const upcomingList = formatted.filter(s => !s.isFinished)
        const nextItem = upcomingList[0] || null
        const canCalcStudentFee = (classType === 'one_on_one') || (billingMode === 'per_student')
        const studentEarnedFee = canCalcStudentFee
          ? Math.round(finishedList.reduce((sum, s) => sum + (s.studentFee || 0), 0) * 100) / 100
          : null
        const studentTotalFee = canCalcStudentFee
          ? Math.round(formatted.reduce((sum, s) => sum + (s.studentFee || 0), 0) * 100) / 100
          : null

        return {
          _id: c._id,
          name: c.name || '未命名课程',
          classType,
          classTypeLabel: classType === 'group' ? '大班课' : '一对一',
          billingMode,
          price,
          status: c.status || 'available',
          totalCount: formatted.length,
          finishedCount: finishedList.length,
          upcomingCount: upcomingList.length,
          nextScheduleStr: nextItem ? `${nextItem.monthDay} ${nextItem.startTime}` : '',
          studentEarnedFee,
          studentTotalFee
        }
      })

      this._scheduleMap = scheduleMap

      const rawScores = Array.isArray(detail.scoreRecords) ? detail.scoreRecords : []
      const scores = rawScores
        .filter(s => s && s.date && Number.isFinite(Number(s.score)))
        .map(s => ({
          ...s,
          score: Math.round(Number(s.score) * 100) / 100
        }))
        .sort((a, b) => {
          if (a.date !== b.date) return String(a.date).localeCompare(String(b.date))
          return (a.createTime || 0) - (b.createTime || 0)
        })

      const scoreStats = this.computeScoreStats(scores)

      // 决定默认选中的单门课程
      let selectedCourseId = ''
      if (initialCourseId && coursesSummary.some(c => c._id === initialCourseId)) {
        selectedCourseId = initialCourseId
      } else if (coursesSummary.length > 0) {
        selectedCourseId = coursesSummary[0]._id
      }

      const defaultRange = this.getDefaultRangeForCourse(selectedCourseId, 'auto')
      const todayStr = formatDateStr(new Date())

      this.setData({
        loading: false,
        student: {
          studentName: detail.studentName || '',
          avatar: detail.avatar || '',
          grade: detail.grade || '',
          subject: detail.subject || '',
          purchasedHours: detail.purchasedHours || 0,
          remainingHours: detail.remainingHours || 0
        },
        coursesSummary,
        scores,
        scoreStats,
        selectedCourseId,
        startDate: defaultRange.startDate,
        endDate: defaultRange.endDate,
        activePreset: defaultRange.preset,
        includesPast: defaultRange.startDate < todayStr
      }, () => {
        this.regeneratePoster()
      })
    } catch (err) {
      console.error('加载报告数据失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 为指定课程计算默认或快捷时间范围
   */
  getDefaultRangeForCourse(courseId, preset = 'auto') {
    const todayStr = formatDateStr(new Date())
    const list = (this._scheduleMap && this._scheduleMap[courseId]) || []
    const validDates = list.map(s => s.dateStr).filter(Boolean).sort()
    const minDate = validDates[0] || todayStr
    const maxDate = validDates[validDates.length - 1] || addDaysStr(todayStr, 30)
    const hasUpcoming = list.some(s => !s.isFinished)

    if (preset === 'all') {
      return {
        startDate: minDate,
        endDate: maxDate >= minDate ? maxDate : minDate,
        preset: 'all'
      }
    }

    if (preset === 'recent30') {
      const start = addDaysStr(todayStr, -30)
      const end = maxDate >= todayStr ? maxDate : todayStr
      return { startDate: start, endDate: end, preset: 'recent30' }
    }

    if (preset === 'upcoming' || (preset === 'auto' && hasUpcoming)) {
      const end = maxDate >= todayStr ? maxDate : addDaysStr(todayStr, 30)
      return { startDate: todayStr, endDate: end, preset: 'upcoming' }
    }

    // auto 且全部课已结束时，自动覆盖全部历史课次避免空列表
    return {
      startDate: minDate,
      endDate: maxDate >= minDate ? maxDate : todayStr,
      preset: 'all'
    }
  },

  /**
   * 组装单门课程数据（严格执行规则：起始日期早于今天时包含已上完的课程；否则仅展示未上课程）
   */
  buildSelectedCourseData() {
    const { coursesSummary, selectedCourseId, startDate, endDate } = this.data
    const course = coursesSummary.find(c => c._id === selectedCourseId)
    if (!course) return null

    const todayStr = formatDateStr(new Date())
    const includesPast = Boolean(startDate && startDate < todayStr)
    const allSchedules = (this._scheduleMap && this._scheduleMap[selectedCourseId]) || []

    const filteredSchedules = allSchedules.filter(item => {
      if (!item.dateStr) return false
      if (startDate && item.dateStr < startDate) return false
      if (endDate && item.dateStr > endDate) return false
      // 起始日期早于今天：展示全部（含已结束和待上课）；起始日期 >= 今天：只展示未上课程
      if (!includesPast && item.isFinished) return false
      return true
    })

    const rangeFinished = filteredSchedules.filter(s => s.isFinished).length
    const rangeUpcoming = filteredSchedules.length - rangeFinished

    const canCalcStudentFee = (course.classType === 'one_on_one') || (course.billingMode === 'per_student')
    const feeDisplayTotal = canCalcStudentFee
      ? Math.round(filteredSchedules.reduce((sum, s) => sum + (s.studentFee || 0), 0) * 100) / 100
      : null
    const feeUnitLabel = course.classType === 'group' ? '元/小时/人' : '元/小时'

    return {
      ...course,
      startDate,
      endDate,
      includesPast,
      filteredSchedules,
      rangeFinished,
      rangeUpcoming,
      feeDisplayTotal,
      feeUnitLabel
    }
  },

  // ===== 交互配置变更 =====
  onSelectScope(e) {
    const scope = e.currentTarget.dataset.scope
    if (!scope || scope === this.data.courseScope) return
    this.setData({ courseScope: scope }, () => this.regeneratePoster())
  },

  onSelectCourse(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.selectedCourseId) return
    const range = this.getDefaultRangeForCourse(id, 'auto')
    const todayStr = formatDateStr(new Date())
    this.setData({
      selectedCourseId: id,
      startDate: range.startDate,
      endDate: range.endDate,
      activePreset: range.preset,
      includesPast: range.startDate < todayStr
    }, () => this.regeneratePoster())
  },

  onApplyPreset(e) {
    const preset = e.currentTarget.dataset.preset
    if (!preset) return
    const range = this.getDefaultRangeForCourse(this.data.selectedCourseId, preset)
    const todayStr = formatDateStr(new Date())
    this.setData({
      startDate: range.startDate,
      endDate: range.endDate,
      activePreset: range.preset,
      includesPast: range.startDate < todayStr
    }, () => this.regeneratePoster())
  },

  onStartDateChange(e) {
    const nextStart = e.detail.value
    if (!nextStart) return
    let nextEnd = this.data.endDate
    if (nextEnd && nextStart > nextEnd) {
      nextEnd = nextStart
    }
    const todayStr = formatDateStr(new Date())
    this.setData({
      startDate: nextStart,
      endDate: nextEnd,
      activePreset: 'custom',
      includesPast: nextStart < todayStr
    }, () => this.regeneratePoster())
  },

  onEndDateChange(e) {
    const nextEnd = e.detail.value
    if (!nextEnd) return
    let nextStart = this.data.startDate
    if (nextStart && nextEnd < nextStart) {
      nextStart = nextEnd
    }
    const todayStr = formatDateStr(new Date())
    this.setData({
      startDate: nextStart,
      endDate: nextEnd,
      activePreset: 'custom',
      includesPast: nextStart < todayStr
    }, () => this.regeneratePoster())
  },

  onToggleScores(e) {
    this.setData({ showScores: e.detail.value }, () => this.regeneratePoster())
  },

  onToggleHours(e) {
    this.setData({ showHours: e.detail.value }, () => this.regeneratePoster())
  },

  onToggleFee(e) {
    this.setData({ showFee: e.detail.value }, () => this.regeneratePoster())
  },

  // ===== 生成高清报告图片 =====
  regeneratePoster() {
    const {
      courseScope,
      coursesSummary,
      showScores,
      showHours,
      showFee,
      student,
      scores,
      scoreStats
    } = this.data

    const selectedCourse = courseScope === 'single' ? this.buildSelectedCourseData() : null
    const selectedRangeCount = selectedCourse ? selectedCourse.filteredSchedules.length : 0

    // 防止全部关闭时生成空白报告
    const hasAnyContent = courseScope !== 'none' || showScores || showHours
    if (!hasAnyContent) {
      this.setData({ posterPath: '', rendering: false, selectedRangeCount })
      return
    }

    const now = new Date()
    const teacherName = (app.globalData.userInfo && app.globalData.userInfo.name) || ''

    const reportData = {
      student,
      teacherName,
      generatedDate: formatDateStr(now),
      generatedDateTime: formatDateTimeStr(now),
      coursesSummary,
      selectedCourse,
      scores,
      scoreStats,
      options: {
        courseScope,
        showScores,
        showHours,
        showFee
      }
    }

    const layout = reportCanvas.calculateLayout(reportData)
    const seq = ++this._renderSeq

    this.setData({
      rendering: true,
      canvasHeight: layout.totalHeight,
      selectedRangeCount
    }, () => {
      // 等待 Canvas 高度样式更新后绘制
      setTimeout(() => {
        if (seq !== this._renderSeq) return
        const query = wx.createSelectorQuery().in(this)
        query.select('#reportCanvas').fields({ node: true, size: true }).exec(async res => {
          if (seq !== this._renderSeq) return
          if (!res || !res[0] || !res[0].node) {
            this.setData({ rendering: false })
            return
          }
          try {
            const result = await reportCanvas.renderReportToFile(res[0].node, reportData)
            if (seq !== this._renderSeq) return
            this.setData({
              posterPath: result.tempFilePath,
              rendering: false
            })
          } catch (err) {
            console.error('生成报告图片失败:', err)
            if (seq !== this._renderSeq) return
            this.setData({ rendering: false })
            wx.showToast({ title: '生成图片失败，请重试', icon: 'none' })
          }
        })
      }, 80)
    })
  },

  // 点击全屏放大查看（长按也可直接转发）
  onPreviewPoster() {
    const { posterPath } = this.data
    if (!posterPath) return
    wx.previewImage({
      urls: [posterPath],
      current: posterPath
    })
  },

  // 拉起微信原生图片转发面板（直接发送到群聊或指定好友）
  onShareImage() {
    const { posterPath } = this.data
    if (!posterPath) return

    if (typeof wx.showShareImageMenu === 'function') {
      wx.showShareImageMenu({
        path: posterPath,
        fail: err => {
          if (err && err.errMsg && err.errMsg.includes('cancel')) return
          // 降级为全屏预览（用户可长按转发给好友或群聊）
          wx.previewImage({
            urls: [posterPath],
            current: posterPath
          })
        }
      })
    } else {
      wx.previewImage({
        urls: [posterPath],
        current: posterPath
      })
    }
  },

  // 保存图片到手机相册
  onSaveAlbum() {
    const { posterPath } = this.data
    if (!posterPath) return

    wx.saveImageToPhotosAlbum({
      filePath: posterPath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: err => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return
        if (err && err.errMsg && (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize'))) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启「保存到相册」权限后再试',
            confirmText: '去设置',
            success: res => {
              if (res.confirm) wx.openSetting()
            }
          })
        } else {
          wx.showToast({ title: '保存失败，可点击预览长按保存', icon: 'none' })
        }
      }
    })
  }
})
