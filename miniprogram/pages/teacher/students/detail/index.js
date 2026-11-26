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
    scoreRecords: [],
    scoreStats: {
      latest: '--',
      max: '--',
      avg: '--',
      deltaStr: '',
      deltaClass: '',
      latestExam: '',
      latestDate: ''
    },
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

        const rawScores = Array.isArray(detail.scoreRecords) ? detail.scoreRecords : []
        const scoreRecords = [...rawScores]
          .filter(s => s && s.date && Number.isFinite(Number(s.score)))
          .map(s => ({
            ...s,
            score: Math.round(Number(s.score) * 100) / 100
          }))
          .sort((a, b) => {
            if (a.date !== b.date) return String(a.date).localeCompare(String(b.date))
            return (a.createTime || 0) - (b.createTime || 0)
          })

        const scoreStats = this.computeScoreStats(scoreRecords)

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
          scoreRecords,
          scoreStats,
          enrolledClasses,
          oneOnOneClasses,
          groupClasses
        }, () => {
          if (scoreRecords.length > 0) {
            this.drawScoreChart()
          }
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

  computeScoreStats(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return {
        latest: '--',
        max: '--',
        avg: '--',
        deltaStr: '',
        deltaClass: '',
        latestExam: '',
        latestDate: ''
      }
    }
    const nums = records.map(r => r.score)
    const latestItem = records[records.length - 1]
    const max = Math.round(Math.max(...nums) * 100) / 100
    const avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
    let deltaStr = ''
    let deltaClass = ''
    if (records.length >= 2) {
      const prev = records[records.length - 2].score
      const diff = Math.round((latestItem.score - prev) * 100) / 100
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
    return {
      latest: latestItem.score,
      max,
      avg,
      deltaStr,
      deltaClass,
      latestExam: latestItem.examName || '日常测验',
      latestDate: latestItem.date
    }
  },

  drawScoreChart(retryCount = 0) {
    const records = this.data.scoreRecords || []
    if (records.length === 0) return

    const query = wx.createSelectorQuery().in(this)
    query.select('#scoreChart').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node || !res[0].width) {
        if (retryCount < 3) {
          setTimeout(() => this.drawScoreChart(retryCount + 1), 120)
        }
        return
      }

      const canvas = res[0].node
      const width = res[0].width
      const height = res[0].height
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const isLight = this.data.theme === 'light'
      const gridColor = isLight ? 'rgba(100, 116, 139, 0.16)' : 'rgba(148, 163, 184, 0.14)'
      const axisTextColor = isLight ? '#64748b' : '#94a3b8'
      const valueTextColor = isLight ? '#1e293b' : '#f1f5f9'
      const dotCenterColor = isLight ? '#ffffff' : '#1e2433'
      const lineColor = '#3b82f6'

      // 计算纵坐标范围（4 等分刻度）
      const scores = records.map(r => r.score)
      const minVal = Math.min(...scores)
      const maxVal = Math.max(...scores)
      const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000]
      let yMin = 0
      let yMax = 100

      if (maxVal === minVal) {
        if (maxVal === 0) {
          yMin = 0
          yMax = 100
        } else {
          const pad = Math.max(10, Math.ceil(maxVal * 0.15))
          yMin = Math.max(0, Math.floor((maxVal - pad) / 5) * 5)
          yMax = Math.ceil((maxVal + pad) / 5) * 5
          if (maxVal <= 100 && yMax > 100) yMax = 100
          if (yMax <= yMin) yMax = yMin + 20
        }
      } else {
        const span = maxVal - minVal
        const rawStep = span / 4
        const step = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep / 100) * 100
        yMin = Math.max(0, Math.floor((minVal - step * 0.4) / step) * step)
        yMax = Math.ceil((maxVal + step * 0.4) / step) * step
        if (maxVal <= 100 && yMax > 100 && (yMax - step) >= maxVal) {
          yMax = 100
        }
        if (yMax <= yMin) yMax = yMin + step * 4
      }

      const padTop = 26
      const padRight = 18
      const padBottom = 28
      const padLeft = yMax >= 1000 ? 44 : 36
      const plotW = Math.max(10, width - padLeft - padRight)
      const plotH = Math.max(10, height - padTop - padBottom)
      const yRange = yMax - yMin || 1

      // 绘制横向网格线与 Y 轴刻度
      const tickCount = 4
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let i = 0; i <= tickCount; i++) {
        const ratio = i / tickCount
        const val = yMin + yRange * (1 - ratio)
        const y = padTop + plotH * ratio

        ctx.beginPath()
        ctx.strokeStyle = gridColor
        ctx.lineWidth = 1
        ctx.moveTo(padLeft, y)
        ctx.lineTo(padLeft + plotW, y)
        ctx.stroke()

        const label = Number.isInteger(val) ? String(val) : String(Math.round(val * 10) / 10)
        ctx.fillStyle = axisTextColor
        ctx.fillText(label, padLeft - 6, y)
      }

      // 计算各数据点坐标
      const n = records.length
      const innerPadX = n === 1 ? plotW / 2 : Math.min(20, plotW / (n * 2))
      const usableW = Math.max(1, plotW - innerPadX * 2)
      const points = records.map((rec, idx) => {
        const x = n === 1 ? padLeft + plotW / 2 : padLeft + innerPadX + (usableW * idx) / (n - 1)
        const y = padTop + plotH * (1 - (rec.score - yMin) / yRange)
        return { x, y, rec }
      })

      // 绘制折线下方面积渐变
      if (points.length >= 2) {
        const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotH)
        gradient.addColorStop(0, isLight ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.26)')
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.01)')

        ctx.beginPath()
        ctx.moveTo(points[0].x, padTop + plotH)
        points.forEach(p => ctx.lineTo(p.x, p.y))
        ctx.lineTo(points[points.length - 1].x, padTop + plotH)
        ctx.closePath()
        ctx.fillStyle = gradient
        ctx.fill()

        // 绘制主折线
        ctx.beginPath()
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 2.5
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        })
        ctx.stroke()
      }

      // 判断需要展示数值标签的点（数据过多时避免文字重叠）
      const showValSet = new Set()
      if (n <= 8) {
        for (let i = 0; i < n; i++) showValSet.add(i)
      } else {
        showValSet.add(0)
        showValSet.add(n - 1)
        let maxIdx = 0
        let minIdx = 0
        for (let i = 1; i < n; i++) {
          if (records[i].score >= records[maxIdx].score) maxIdx = i
          if (records[i].score <= records[minIdx].score) minIdx = i
        }
        showValSet.add(maxIdx)
        showValSet.add(minIdx)
      }

      // 绘制数据点与数值标签
      points.forEach((p, idx) => {
        const isLast = idx === n - 1
        if (isLast) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 8, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, isLast ? 4.5 : 3.8, 0, Math.PI * 2)
        ctx.fillStyle = lineColor
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, isLast ? 2.2 : 1.8, 0, Math.PI * 2)
        ctx.fillStyle = dotCenterColor
        ctx.fill()

        if (showValSet.has(idx)) {
          ctx.font = isLast ? 'bold 11px sans-serif' : '10px sans-serif'
          ctx.fillStyle = isLast ? lineColor : valueTextColor
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          const textY = Math.max(12, p.y - 7)
          ctx.fillText(String(p.rec.score), p.x, textY)
        }
      })

      // 绘制 X 轴时间刻度（最多 5 个刻度防重叠）
      const xLabelIndices = new Set()
      if (n <= 5) {
        for (let i = 0; i < n; i++) xLabelIndices.add(i)
      } else {
        xLabelIndices.add(0)
        xLabelIndices.add(n - 1)
        const stepIdx = (n - 1) / 4
        for (let k = 1; k < 4; k++) {
          xLabelIndices.add(Math.round(stepIdx * k))
        }
      }

      const years = new Set(records.map(r => String(r.date).slice(0, 4)))
      const multiYear = years.size > 1
      ctx.font = '10px sans-serif'
      ctx.fillStyle = axisTextColor
      ctx.textBaseline = 'top'

      Array.from(xLabelIndices).sort((a, b) => a - b).forEach(idx => {
        const p = points[idx]
        const rawDate = String(p.rec.date || '')
        const parts = rawDate.split('-')
        let label = rawDate
        if (parts.length === 3) {
          label = multiYear ? `${parts[0].slice(2)}/${parts[1]}/${parts[2]}` : `${parts[1]}/${parts[2]}`
        }
        if (n > 1 && idx === 0) {
          ctx.textAlign = 'left'
        } else if (n > 1 && idx === n - 1) {
          ctx.textAlign = 'right'
        } else {
          ctx.textAlign = 'center'
        }
        ctx.fillText(label, p.x, padTop + plotH + 8)
      })
    })
  },

  onOpenScorePage() {
    const { studentId, student } = this.data
    if (!studentId) return
    const name = encodeURIComponent((student && student.studentName) || '')
    wx.navigateTo({
      url: `/pages/teacher/students/scores/index?studentId=${studentId}&studentName=${name}`
    })
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
