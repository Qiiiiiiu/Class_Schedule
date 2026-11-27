const app = getApp()
const checkRole = require('../../../utils/checkRole.js')
const api = require('../../../utils/api.js')
const statsHelper = require('../../../utils/statsHelper.js')

Page({
  data: {
    theme: 'dark',
    year: 2026,
    month: 1,
    monthPickerVal: '',
    isCurrentMonth: true,
    chartMetric: 'revenue', // 'revenue' | 'hours'
    loading: false,
    stats: {
      totalRevenueStr: '0',
      earnedRevenueStr: '0',
      upcomingRevenueStr: '0',
      totalLessons: 0,
      finishedLessons: 0,
      upcomingLessons: 0,
      totalHours: 0,
      finishedHours: 0,
      activeDays: 0,
      oneOnOne: { revenueStr: '0', lessons: 0, hours: 0, ratioPct: 50 },
      group: { revenueStr: '0', lessons: 0, hours: 0, ratioPct: 50 },
      dailySeries: [],
      classBreakdown: []
    }
  },

  onLoad() {
    if (!checkRole.checkTeacher()) return
    const now = new Date()
    this.setMonth(now.getFullYear(), now.getMonth() + 1, false)
  },

  onShow() {
    if (!checkRole.checkTeacher()) return
    const theme = app.globalData.theme || 'dark'
    this.setData({ theme })
    app.applyThemeToSystem(theme)
    this.loadMonthData()
  },

  onPullDownRefresh() {
    this.loadMonthData().finally(() => wx.stopPullDownRefresh())
  },

  setMonth(year, month, reload = true) {
    const now = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1)
    const monthPickerVal = `${year}-${String(month).padStart(2, '0')}`
    this.setData({ year, month, monthPickerVal, isCurrentMonth }, () => {
      if (reload) this.loadMonthData()
    })
  },

  onPrevMonth() {
    let { year, month } = this.data
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    this.setMonth(year, month, true)
  },

  onNextMonth() {
    let { year, month } = this.data
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    this.setMonth(year, month, true)
  },

  onBackCurrentMonth() {
    const now = new Date()
    this.setMonth(now.getFullYear(), now.getMonth() + 1, true)
  },

  onMonthPick(e) {
    const val = e.detail.value // YYYY-MM
    if (!val) return
    const [y, m] = val.split('-').map(Number)
    if (!isNaN(y) && !isNaN(m)) {
      this.setMonth(y, m, true)
    }
  },

  onSwitchChartMetric(e) {
    const metric = e.currentTarget.dataset.metric
    if (!metric || metric === this.data.chartMetric) return
    this.setData({ chartMetric: metric }, () => {
      this.drawDailyBarChart()
    })
  },

  async loadMonthData() {
    const teacherId = app.globalData.openid
    if (!teacherId) return
    const { year, month } = this.data
    const { startDate, endDate } = statsHelper.getMonthRange(year, month)

    this.setData({ loading: true })
    wx.showNavigationBarLoading()

    try {
      const [courses, schedules] = await Promise.all([
        api.getCourses(teacherId).catch(() => []),
        api.getSchedule(teacherId, { startDate, endDate }).catch(() => [])
      ])

      const stats = statsHelper.computeMonthlyStats(courses, schedules, year, month, new Date())
      this.setData({ stats, loading: false }, () => {
        if (stats.totalLessons > 0) {
          this.drawDailyBarChart()
        }
      })
    } catch (err) {
      console.error('加载月度统计失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载统计失败', icon: 'none' })
    } finally {
      wx.hideNavigationBarLoading()
    }
  },

  drawDailyBarChart(retryCount = 0) {
    const { stats, chartMetric, theme } = this.data
    const series = (stats && stats.dailySeries) || []
    if (series.length === 0 || stats.totalLessons === 0) return

    const query = wx.createSelectorQuery().in(this)
    query.select('#dailyBarChart').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node || !res[0].width) {
        if (retryCount < 3) {
          setTimeout(() => this.drawDailyBarChart(retryCount + 1), 120)
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

      const isLight = theme === 'light'
      const gridColor = isLight ? 'rgba(100, 116, 139, 0.16)' : 'rgba(148, 163, 184, 0.14)'
      const axisTextColor = isLight ? '#64748b' : '#94a3b8'
      const barColor = chartMetric === 'revenue' ? '#3b82f6' : '#10b981'
      const barMutedColor = chartMetric === 'revenue' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(16, 185, 129, 0.35)'

      const values = series.map(d => (chartMetric === 'revenue' ? d.revenue : d.hours))
      const rawMax = Math.max(...values, 0)
      const maxVal = rawMax > 0 ? rawMax * 1.15 : 10

      const padTop = 20
      const padRight = 12
      const padBottom = 26
      const padLeft = maxVal >= 1000 ? 44 : 36
      const plotW = Math.max(10, width - padLeft - padRight)
      const plotH = Math.max(10, height - padTop - padBottom)

      // 横向网格与 Y 轴
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      const ticks = 3
      for (let i = 0; i <= ticks; i++) {
        const ratio = i / ticks
        const y = padTop + plotH * ratio
        const val = maxVal * (1 - ratio)

        ctx.beginPath()
        ctx.strokeStyle = gridColor
        ctx.lineWidth = 1
        ctx.moveTo(padLeft, y)
        ctx.lineTo(padLeft + plotW, y)
        ctx.stroke()

        const label = chartMetric === 'revenue'
          ? (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(Math.round(val)))
          : `${Math.round(val * 10) / 10}h`
        ctx.fillStyle = axisTextColor
        ctx.fillText(label, padLeft - 6, y)
      }

      // 柱状条
      const n = series.length
      const slotW = plotW / n
      const barW = Math.max(3, Math.min(10, slotW * 0.62))

      series.forEach((d, idx) => {
        const v = values[idx]
        if (v <= 0) return
        const barH = Math.max(3, (v / maxVal) * plotH)
        const bx = padLeft + idx * slotW + (slotW - barW) / 2
        const by = padTop + plotH - barH

        ctx.fillStyle = chartMetric === 'revenue' && d.earnedRevenue < d.revenue && d.earnedRevenue === 0
          ? barMutedColor
          : barColor
        ctx.fillRect(bx, by, barW, barH)

        // 若当日既有已获又有待上，在底部叠一层亮色代表已获
        if (chartMetric === 'revenue' && d.earnedRevenue > 0 && d.earnedRevenue < d.revenue) {
          const earnedH = Math.max(2, (d.earnedRevenue / maxVal) * plotH)
          ctx.fillStyle = barMutedColor
          ctx.fillRect(bx, by, barW, barH)
          ctx.fillStyle = barColor
          ctx.fillRect(bx, padTop + plotH - earnedH, barW, earnedH)
        }
      })

      // X 轴日期标签（1, 5, 10, 15, 20, 25, 末日）
      const labelDays = new Set([1, 5, 10, 15, 20, 25, n])
      ctx.font = '10px sans-serif'
      ctx.fillStyle = axisTextColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      series.forEach((d, idx) => {
        if (!labelDays.has(d.day)) return
        const cx = padLeft + idx * slotW + slotW / 2
        ctx.fillText(`${d.day}日`, cx, padTop + plotH + 7)
      })
    })
  },

  onOpenClassDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: `/pages/teacher/courses/detail?id=${id}`
    })
  }
})
