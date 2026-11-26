const app = getApp()
const checkRole = require('../../../../utils/checkRole.js')
const api = require('../../../../utils/api.js')

function getTodayStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

Page({
  data: {
    theme: 'dark',
    studentId: '',
    studentName: '',
    formDate: getTodayStr(),
    formScore: '',
    formExamName: '',
    editingId: '',
    submitting: false,
    scoreList: [],
    maxScore: '--',
    avgScore: '--'
  },

  onLoad(options) {
    if (!checkRole.checkTeacher()) return
    const studentId = options.studentId || ''
    const studentName = options.studentName ? decodeURIComponent(options.studentName) : ''
    if (!studentId) {
      wx.showToast({ title: '缺少学生信息', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({ studentId, studentName })
    if (studentName) {
      wx.setNavigationBarTitle({ title: `${studentName} · 成绩录入` })
    }
  },

  onShow() {
    if (!checkRole.checkTeacher()) return
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)
    this.loadScores()
  },

  applyScoreList(records) {
    const valid = (Array.isArray(records) ? records : []).filter(item => item && item.date)
    // 列表按考试时间倒序展示（最新在最上面）
    const descList = [...valid].sort((a, b) => {
      if (a.date !== b.date) return String(b.date).localeCompare(String(a.date))
      return (b.createTime || 0) - (a.createTime || 0)
    })

    let maxScore = '--'
    let avgScore = '--'
    if (descList.length > 0) {
      const nums = descList.map(item => Number(item.score)).filter(n => Number.isFinite(n))
      if (nums.length > 0) {
        maxScore = Math.round(Math.max(...nums) * 100) / 100
        const sum = nums.reduce((acc, n) => acc + n, 0)
        avgScore = Math.round((sum / nums.length) * 10) / 10
      }
    }

    this.setData({
      scoreList: descList,
      maxScore,
      avgScore
    })
  },

  async loadScores() {
    const { studentId } = this.data
    const teacherId = app.globalData.openid
    if (!studentId || !teacherId) return

    wx.showLoading({ title: '加载中...' })
    try {
      const detail = await api.getStudentDetail(teacherId, studentId)
      if (detail) {
        if (!this.data.studentName && detail.studentName) {
          this.setData({ studentName: detail.studentName })
          wx.setNavigationBarTitle({ title: `${detail.studentName} · 成绩录入` })
        }
        this.applyScoreList(detail.scoreRecords || [])
      }
    } catch (err) {
      console.error('加载学生成绩失败:', err)
    } finally {
      wx.hideLoading()
    }
  },

  onDateChange(e) {
    this.setData({ formDate: e.detail.value })
  },

  onScoreInput(e) {
    this.setData({ formScore: e.detail.value })
  },

  onExamNameInput(e) {
    this.setData({ formExamName: e.detail.value })
  },

  onStartEdit(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.id) return
    this._submitRequestId = ''
    this.setData({
      editingId: item.id,
      formDate: item.date || getTodayStr(),
      formScore: String(item.score),
      formExamName: item.examName || ''
    })
    wx.pageScrollTo({ scrollTop: 0, duration: 250 })
  },

  onCancelEdit() {
    this._submitRequestId = ''
    this.setData({
      editingId: '',
      formDate: getTodayStr(),
      formScore: '',
      formExamName: ''
    })
  },

  async onSubmitScore() {
    if (this.data.submitting) return
    const { studentId, formDate, formScore, formExamName, editingId } = this.data
    const teacherId = app.globalData.openid

    if (!formDate) {
      wx.showToast({ title: '请选择考试时间', icon: 'none' })
      return
    }

    const scoreNum = parseFloat(String(formScore).trim())
    if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 10000) {
      wx.showToast({ title: '请输入有效成绩', icon: 'none' })
      return
    }

    const payload = {
      date: formDate,
      score: Math.round(scoreNum * 100) / 100,
      examName: String(formExamName || '').trim()
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中...', mask: true })

    try {
      let res = null
      if (editingId) {
        res = await api.updateStudentScore(teacherId, studentId, editingId, payload)
      } else {
        if (!this._submitRequestId) {
          this._submitRequestId = `score_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
        }
        res = await api.addStudentScore(teacherId, studentId, payload, this._submitRequestId)
      }

      if (res) {
        this._submitRequestId = ''
        wx.showToast({
          title: editingId ? '修改成功' : '录入成功',
          icon: 'success'
        })
        this.setData({
          editingId: '',
          formScore: '',
          formExamName: ''
        })
        if (Array.isArray(res.scoreRecords)) {
          this.applyScoreList(res.scoreRecords)
        } else {
          this.loadScores()
        }
      }
    } catch (err) {
      console.error('保存成绩失败:', err)
    } finally {
      this.setData({ submitting: false })
      wx.hideLoading()
    }
  },

  onDeleteScore(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.id) return
    const teacherId = app.globalData.openid
    const { studentId } = this.data

    wx.showModal({
      title: '删除成绩记录',
      content: `确定删除「${item.examName || '日常测验'}（${item.date}，${item.score}分）」吗？`,
      confirmColor: '#ef4444',
      success: async (modalRes) => {
        if (!modalRes.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        try {
          const res = await api.deleteStudentScore(teacherId, studentId, item.id)
          if (res) {
            wx.showToast({ title: '已删除', icon: 'success' })
            if (this.data.editingId === item.id) {
              this.onCancelEdit()
            }
            if (Array.isArray(res.scoreRecords)) {
              this.applyScoreList(res.scoreRecords)
            } else {
              this.loadScores()
            }
          }
        } catch (err) {
          console.error('删除成绩失败:', err)
        } finally {
          wx.hideLoading()
        }
      }
    })
  }
})
