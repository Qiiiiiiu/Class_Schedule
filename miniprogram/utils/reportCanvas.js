/**
 * 学生学习报告长图绘制工具（清爽白底风格 · Canvas 2D）
 * 独立于页面，支持：
 *  1. 全部课程总览 / 指定课程时间范围明细（起始日期早于今天时包含已上课程） / 不展示课程
 *  2. 成绩变化折线图 + 最近考试明细表
 *  3. 可选展示课时账户、费用估算
 */

const LOGICAL_WIDTH = 750
const PAD_X = 28
const CONTENT_W = LOGICAL_WIDTH - PAD_X * 2 // 694
const MAX_ALL_COURSES = 12
const MAX_SINGLE_SCHEDULES = 24
const MAX_SCORE_ROWS = 10

const COLORS = {
  pageBg: '#f3f6fb',
  cardBg: '#ffffff',
  cardBorder: '#e2e8f0',
  softBg: '#f8fafc',
  tintBlueBg: '#eff6ff',
  tintBlueBorder: '#bfdbfe',
  primary: '#2563eb',
  primaryLight: '#3b82f6',
  cyan: '#0284c7',
  purple: '#7c3aed',
  purpleBg: '#f5f3ff',
  green: '#059669',
  greenBg: '#ecfdf5',
  red: '#dc2626',
  redBg: '#fef2f2',
  slateBg: '#f1f5f9',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  divider: '#e2e8f0'
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function fillRoundRect(ctx, x, y, w, h, r, fillStyle, strokeStyle, lineWidth = 1) {
  roundRectPath(ctx, x, y, w, h, r)
  if (fillStyle) {
    ctx.fillStyle = fillStyle
    ctx.fill()
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}

function truncateText(ctx, text, maxWidth) {
  const str = String(text || '')
  if (!str) return ''
  if (ctx.measureText(str).width <= maxWidth) return str
  let end = str.length
  while (end > 0 && ctx.measureText(`${str.slice(0, end)}…`).width > maxWidth) {
    end--
  }
  return end > 0 ? `${str.slice(0, end)}…` : '…'
}

function drawPill(ctx, x, y, text, bg, color, fontSize = 20, padX = 14, height = 34) {
  ctx.font = `600 ${fontSize}px sans-serif`
  const tw = ctx.measureText(text).width
  const w = tw + padX * 2
  fillRoundRect(ctx, x, y, w, height, height / 2, bg)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + height / 2 + 1)
  return w
}

function drawSectionHeader(ctx, x, y, w, title, badgeText, rightText) {
  // 左侧蓝条
  fillRoundRect(ctx, x, y + 6, 8, 28, 4, COLORS.primary)
  ctx.font = 'bold 30px sans-serif'
  ctx.fillStyle = COLORS.textPrimary
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, x + 20, y + 20)

  const titleW = ctx.measureText(title).width
  if (badgeText) {
    drawPill(ctx, x + 20 + titleW + 14, y + 4, badgeText, COLORS.tintBlueBg, COLORS.primary, 20, 14, 32)
  }

  if (rightText) {
    ctx.font = '22px sans-serif'
    ctx.fillStyle = COLORS.textSecondary
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(rightText, x + w, y + 20)
  }
}

function formatMoney(num) {
  const n = Number(num)
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '')
}

/**
 * 构建顶部 KPI 概览项（自动适配勾选内容）
 */
function buildOverviewItems(data) {
  const { student, options, coursesSummary, selectedCourse, scoreStats } = data
  const items = []

  if (options.showHours) {
    items.push({
      label: '剩余课时',
      value: `${student.remainingHours || 0}`,
      sub: `共购 ${student.purchasedHours || 0}`,
      highlight: true
    })
  }

  if (options.courseScope === 'all') {
    items.push({
      label: '在读课程',
      value: `${coursesSummary.length}门`,
      sub: `一对一 ${coursesSummary.filter(c => c.classType === 'one_on_one').length} · 大班 ${coursesSummary.filter(c => c.classType === 'group').length}`
    })
  } else if (options.courseScope === 'single' && selectedCourse) {
    items.push({
      label: '时段课次',
      value: `${selectedCourse.filteredSchedules.length}节`,
      sub: `已上 ${selectedCourse.rangeFinished} · 待上 ${selectedCourse.rangeUpcoming}`
    })
  }

  if (options.showScores && scoreStats && scoreStats.count > 0) {
    items.push({
      label: '最新成绩',
      value: `${scoreStats.latest}`,
      sub: scoreStats.deltaStr ? `较上次 ${scoreStats.deltaStr}` : `均分 ${scoreStats.avg}`,
      deltaClass: scoreStats.deltaClass || ''
    })
  }

  if (options.showFee) {
    if (options.courseScope === 'single' && selectedCourse) {
      if (selectedCourse.feeDisplayTotal !== null) {
        items.push({
          label: '时段费用',
          value: `¥${formatMoney(selectedCourse.feeDisplayTotal)}`,
          sub: selectedCourse.feeUnitLabel || ''
        })
      } else {
        items.push({
          label: '课程单价',
          value: `¥${formatMoney(selectedCourse.price || 0)}`,
          sub: '元/小时(按班次)'
        })
      }
    } else if (options.courseScope === 'all') {
      const totalEstimated = coursesSummary.reduce((sum, c) => sum + (c.studentTotalFee || 0), 0)
      const hasPerStudentOr1v1 = coursesSummary.some(c => c.studentTotalFee !== null)
      if (hasPerStudentOr1v1) {
        items.push({
          label: '课程费用',
          value: `¥${formatMoney(totalEstimated)}`,
          sub: '按已排课估算'
        })
      }
    }
  }

  return items.slice(0, 4)
}

/**
 * 预计算总画布高度（确保无溢出、无多余留白）
 */
function calculateLayout(data) {
  const { options, coursesSummary, selectedCourse, scores } = data
  const overviewItems = buildOverviewItems(data)

  let y = 28 // 顶部边距
  const blocks = {}

  // 1. 头部横幅
  blocks.header = { y, h: 196 }
  y += blocks.header.h + 24

  // 2. 概览指标卡（有项时绘制）
  if (overviewItems.length > 0) {
    blocks.overview = { y, h: 144, items: overviewItems }
    y += blocks.overview.h + 24
  }

  // 3. 课程信息模块
  if (options.courseScope === 'all') {
    const shownCount = Math.min(coursesSummary.length, MAX_ALL_COURSES)
    const rowH = options.showFee ? 132 : 104
    const innerH = shownCount === 0
      ? 110
      : shownCount * rowH + Math.max(0, shownCount - 1) * 14 + (coursesSummary.length > MAX_ALL_COURSES ? 40 : 0)
    const cardH = 32 + 40 + 22 + innerH + 28
    blocks.allCourses = { y, h: cardH, rowH, shownCount }
    y += cardH + 24
  } else if (options.courseScope === 'single' && selectedCourse) {
    const list = selectedCourse.filteredSchedules || []
    const shownCount = Math.min(list.length, MAX_SINGLE_SCHEDULES)
    const metaBoxH = options.showFee ? 134 : 102
    const tableHeaderH = shownCount > 0 ? 46 : 0
    const rowH = 56
    const listH = shownCount === 0
      ? 100
      : tableHeaderH + shownCount * rowH + (list.length > MAX_SINGLE_SCHEDULES ? 42 : 0)
    const cardH = 32 + 40 + 20 + metaBoxH + 20 + listH + 28
    blocks.singleCourse = { y, h: cardH, metaBoxH, rowH, shownCount }
    y += cardH + 24
  }

  // 4. 成绩变化模块
  if (options.showScores) {
    const hasScores = Array.isArray(scores) && scores.length > 0
    if (!hasScores) {
      blocks.scores = { y, h: 210, hasScores: false }
    } else {
      const chartH = 290
      const shownRows = Math.min(scores.length, MAX_SCORE_ROWS)
      const tableH = 46 + shownRows * 52 + (scores.length > MAX_SCORE_ROWS ? 40 : 0)
      const cardH = 32 + 40 + 20 + chartH + 24 + tableH + 28
      blocks.scores = { y, h: cardH, hasScores: true, chartH, shownRows }
    }
    y += blocks.scores.h + 24
  }

  // 5. 页脚
  blocks.footer = { y, h: 56 }
  y += blocks.footer.h + 24

  return {
    totalHeight: Math.max(480, y),
    blocks
  }
}

/**
 * 绘制顶部报告横幅
 */
function drawHeader(ctx, block, data, avatarImg) {
  const { student, options, selectedCourse, generatedDate } = data
  const x = PAD_X
  const y = block.y
  const w = CONTENT_W
  const h = block.h

  // 渐变蓝色背景
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, '#2563eb')
  grad.addColorStop(0.6, '#1d4ed8')
  grad.addColorStop(1, '#0284c7')
  fillRoundRect(ctx, x, y, w, h, 24, grad)

  // 装饰光圈（裁剪在圆角矩形内）
  ctx.save()
  roundRectPath(ctx, x, y, w, h, 24)
  ctx.clip()
  ctx.beginPath()
  ctx.arc(x + w - 40, y + 20, 120, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + w - 130, y + h + 20, 90, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
  ctx.fill()
  ctx.restore()

  // 左上角报告标签
  const reportTitle = (options.courseScope === 'single' && selectedCourse)
    ? '课程学习报告'
    : '学员学习报告'
  drawPill(ctx, x + 28, y + 24, reportTitle, 'rgba(255, 255, 255, 0.18)', '#ffffff', 20, 16, 36)

  // 右上角生成日期
  ctx.font = '22px sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(`生成日期 ${generatedDate}`, x + w - 28, y + 42)

  // 学生头像或首字圆形徽章
  const avX = x + 28
  const avY = y + 84
  const avSize = 84
  ctx.save()
  ctx.beginPath()
  ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.fill()
  ctx.clip()
  if (avatarImg) {
    ctx.drawImage(avatarImg, avX, avY, avSize, avSize)
  } else {
    const initial = String(student.studentName || '学').trim().slice(0, 1) || '学'
    ctx.font = 'bold 38px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, avX + avSize / 2, avY + avSize / 2 + 2)
  }
  ctx.restore()

  // 白色描边圆环
  ctx.beginPath()
  ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
  ctx.lineWidth = 3
  ctx.stroke()

  // 学生姓名与副标题
  const textX = avX + avSize + 22
  const maxNameW = w - (textX - x) - 28
  ctx.font = 'bold 36px sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(truncateText(ctx, student.studentName || '未命名学生', maxNameW), textX, avY + 26)

  const subParts = []
  if (student.grade) subParts.push(student.grade)
  if (student.subject) subParts.push(student.subject)
  if (options.courseScope === 'single' && selectedCourse) {
    subParts.push(selectedCourse.name)
  }
  const subText = subParts.length > 0 ? subParts.join(' · ') : '个人学习进度与成长记录'
  ctx.font = '24px sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
  ctx.fillText(truncateText(ctx, subText, maxNameW), textX, avY + 64)
}

/**
 * 绘制核心概览 KPI 卡片
 */
function drawOverview(ctx, block) {
  const x = PAD_X
  const y = block.y
  const w = CONTENT_W
  const h = block.h
  const items = block.items || []

  fillRoundRect(ctx, x, y, w, h, 20, COLORS.cardBg, COLORS.cardBorder, 1.5)

  const colW = w / items.length
  items.forEach((item, idx) => {
    const cx = x + colW * idx + colW / 2

    if (idx > 0) {
      ctx.beginPath()
      ctx.strokeStyle = COLORS.divider
      ctx.lineWidth = 1
      ctx.moveTo(x + colW * idx, y + 28)
      ctx.lineTo(x + colW * idx, y + h - 28)
      ctx.stroke()
    }

    ctx.font = '22px sans-serif'
    ctx.fillStyle = COLORS.textSecondary
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.label, cx, y + 34)

    ctx.font = 'bold 34px sans-serif'
    ctx.fillStyle = item.highlight ? COLORS.primary : COLORS.textPrimary
    ctx.fillText(truncateText(ctx, item.value, colW - 18), cx, y + 76)

    if (item.sub) {
      ctx.font = '20px sans-serif'
      ctx.fillStyle = item.deltaClass === 'up'
        ? COLORS.green
        : item.deltaClass === 'down'
          ? COLORS.red
          : COLORS.textMuted
      ctx.fillText(truncateText(ctx, item.sub, colW - 16), cx, y + 114)
    }
  })
}

/**
 * 绘制全部课程总览卡片
 */
function drawAllCourses(ctx, block, data) {
  const { coursesSummary, options } = data
  const x = PAD_X
  const y = block.y
  const w = CONTENT_W
  const h = block.h

  fillRoundRect(ctx, x, y, w, h, 20, COLORS.cardBg, COLORS.cardBorder, 1.5)
  drawSectionHeader(ctx, x + 28, y + 28, w - 56, '在读课程总览', `共 ${coursesSummary.length} 门`)

  let curY = y + 28 + 40 + 22
  if (coursesSummary.length === 0) {
    fillRoundRect(ctx, x + 28, curY, w - 56, 100, 14, COLORS.softBg, COLORS.cardBorder, 1)
    ctx.font = '24px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂未加入任何课程', x + w / 2, curY + 50)
    return
  }

  const innerW = w - 56
  const list = coursesSummary.slice(0, MAX_ALL_COURSES)
  list.forEach(course => {
    fillRoundRect(ctx, x + 28, curY, innerW, block.rowH, 14, COLORS.softBg, COLORS.cardBorder, 1)

    const isGroup = course.classType === 'group'
    const pillBg = isGroup ? COLORS.purpleBg : COLORS.tintBlueBg
    const pillColor = isGroup ? COLORS.purple : COLORS.primary
    const pillW = drawPill(ctx, x + 46, curY + 18, course.classTypeLabel, pillBg, pillColor, 20, 12, 32)

    // 右侧状态
    const isAvail = course.status === 'available'
    const statusText = isAvail ? '进行中' : '已停课'
    ctx.font = '600 20px sans-serif'
    const stW = ctx.measureText(statusText).width + 24
    drawPill(
      ctx,
      x + 28 + innerW - 18 - stW,
      curY + 18,
      statusText,
      isAvail ? COLORS.greenBg : COLORS.slateBg,
      isAvail ? COLORS.green : COLORS.textMuted,
      20,
      12,
      32
    )

    // 课程名
    const nameX = x + 46 + pillW + 12
    const nameMaxW = innerW - (nameX - (x + 28)) - stW - 30
    ctx.font = 'bold 28px sans-serif'
    ctx.fillStyle = COLORS.textPrimary
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(truncateText(ctx, course.name, nameMaxW), nameX, curY + 34)

    // 进度与下节课
    const nextTip = course.nextScheduleStr ? `下节：${course.nextScheduleStr}` : '暂无后续排课'
    const line2 = `已上 ${course.finishedCount} / 共 ${course.totalCount} 节   ·   ${nextTip}`
    ctx.font = '22px sans-serif'
    ctx.fillStyle = COLORS.textSecondary
    ctx.fillText(truncateText(ctx, line2, innerW - 36), x + 46, curY + 74)

    // 可选费用行
    if (options.showFee) {
      let feeText = ''
      if (isGroup && course.billingMode !== 'per_student') {
        feeText = `课程单价：¥${formatMoney(course.price)}/小时（按班次计费）`
      } else {
        const unit = isGroup ? '元/小时/人' : '元/小时'
        feeText = `单价 ¥${formatMoney(course.price)} ${unit}   ·   已上 ¥${formatMoney(course.studentEarnedFee)}   ·   预计 ¥${formatMoney(course.studentTotalFee)}`
      }
      ctx.font = '21px sans-serif'
      ctx.fillStyle = COLORS.primary
      ctx.fillText(truncateText(ctx, feeText, innerW - 36), x + 46, curY + 106)
    }

    curY += block.rowH + 14
  })

  if (coursesSummary.length > MAX_ALL_COURSES) {
    ctx.font = '21px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`共 ${coursesSummary.length} 门课程，已展示前 ${MAX_ALL_COURSES} 门`, x + w / 2, curY + 14)
  }
}

/**
 * 绘制指定单门课程详情 + 时间范围课次表
 */
function drawSingleCourse(ctx, block, data) {
  const { selectedCourse, options } = data
  const x = PAD_X
  const y = block.y
  const w = CONTENT_W
  const h = block.h
  const innerX = x + 28
  const innerW = w - 56

  fillRoundRect(ctx, x, y, w, h, 20, COLORS.cardBg, COLORS.cardBorder, 1.5)
  drawSectionHeader(
    ctx,
    innerX,
    y + 28,
    innerW,
    '课程排课明细',
    selectedCourse.classTypeLabel,
    `${selectedCourse.startDate} 至 ${selectedCourse.endDate}`
  )

  let curY = y + 28 + 40 + 20

  // 课程概况浅蓝框
  fillRoundRect(ctx, innerX, curY, innerW, block.metaBoxH, 14, COLORS.tintBlueBg, COLORS.tintBlueBorder, 1)
  ctx.font = 'bold 28px sans-serif'
  ctx.fillStyle = COLORS.textPrimary
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const modeTag = selectedCourse.includesPast ? '含已上课程' : '仅未来排课'
  ctx.font = '600 20px sans-serif'
  const tagW = ctx.measureText(modeTag).width + 24
  drawPill(
    ctx,
    innerX + innerW - 18 - tagW,
    curY + 18,
    modeTag,
    selectedCourse.includesPast ? '#dbeafe' : COLORS.greenBg,
    selectedCourse.includesPast ? COLORS.primary : COLORS.green,
    20,
    12,
    32
  )

  ctx.font = 'bold 28px sans-serif'
  ctx.fillStyle = COLORS.textPrimary
  ctx.fillText(truncateText(ctx, selectedCourse.name, innerW - tagW - 50), innerX + 20, curY + 34)

  const summaryLine = `该时段共 ${selectedCourse.filteredSchedules.length} 节（已上 ${selectedCourse.rangeFinished} 节 · 待上 ${selectedCourse.rangeUpcoming} 节）`
  ctx.font = '22px sans-serif'
  ctx.fillStyle = COLORS.textSecondary
  ctx.fillText(truncateText(ctx, summaryLine, innerW - 40), innerX + 20, curY + 74)

  if (options.showFee) {
    let feeLine = ''
    if (selectedCourse.feeDisplayTotal !== null) {
      feeLine = `单价 ¥${formatMoney(selectedCourse.price)} ${selectedCourse.feeUnitLabel}   ·   本时段费用 ¥${formatMoney(selectedCourse.feeDisplayTotal)}`
    } else {
      feeLine = `课程单价：¥${formatMoney(selectedCourse.price)}/小时（按班次计费）`
    }
    ctx.font = '600 22px sans-serif'
    ctx.fillStyle = COLORS.primary
    ctx.fillText(truncateText(ctx, feeLine, innerW - 40), innerX + 20, curY + 108)
  }

  curY += block.metaBoxH + 20

  const list = selectedCourse.filteredSchedules || []
  if (list.length === 0) {
    fillRoundRect(ctx, innerX, curY, innerW, 96, 14, COLORS.softBg, COLORS.cardBorder, 1)
    ctx.font = '24px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('所选时间范围内暂无排课记录', innerX + innerW / 2, curY + 48)
    return
  }

  // 是否在表格显示单节费用列
  const showRowFee = options.showFee && selectedCourse.feeDisplayTotal !== null

  // 表头
  fillRoundRect(ctx, innerX, curY, innerW, 46, 10, COLORS.slateBg)
  ctx.font = '600 21px sans-serif'
  ctx.fillStyle = COLORS.textSecondary
  ctx.textBaseline = 'middle'

  const colDate = innerX + 16
  const colTime = innerX + 160
  const colRoom = showRowFee ? innerX + 322 : innerX + 338
  const colFee = innerX + 498
  const colStatus = innerX + innerW - 16

  ctx.textAlign = 'left'
  ctx.fillText('上课日期', colDate, curY + 23)
  ctx.fillText('时间段', colTime, curY + 23)
  ctx.fillText('地点', colRoom, curY + 23)
  if (showRowFee) {
    ctx.textAlign = 'right'
    ctx.fillText('费用', colFee, curY + 23)
  }
  ctx.textAlign = 'right'
  ctx.fillText('状态', colStatus, curY + 23)

  curY += 46

  const shown = list.slice(0, MAX_SINGLE_SCHEDULES)
  shown.forEach((item, idx) => {
    if (idx % 2 === 1) {
      fillRoundRect(ctx, innerX, curY, innerW, block.rowH, 8, COLORS.softBg)
    }

    const midY = curY + block.rowH / 2
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    ctx.font = '600 22px sans-serif'
    ctx.fillStyle = item.isFinished ? COLORS.textSecondary : COLORS.textPrimary
    ctx.fillText(`${item.monthDay} ${item.weekdayStr}`, colDate, midY)

    ctx.font = '22px sans-serif'
    ctx.fillStyle = COLORS.textSecondary
    ctx.fillText(item.timeRange, colTime, midY)

    const roomMaxW = showRowFee ? 120 : 185
    ctx.fillText(truncateText(ctx, item.classroom || '未设地点', roomMaxW), colRoom, midY)

    if (showRowFee) {
      ctx.textAlign = 'right'
      ctx.font = '600 22px sans-serif'
      ctx.fillStyle = COLORS.primary
      ctx.fillText(`¥${formatMoney(item.studentFee || 0)}`, colFee, midY)
    }

    // 状态胶囊
    const stText = item.isFinished ? '已结束' : '待上课'
    ctx.font = '600 19px sans-serif'
    const stW = ctx.measureText(stText).width + 20
    drawPill(
      ctx,
      colStatus - stW,
      midY - 15,
      stText,
      item.isFinished ? COLORS.slateBg : COLORS.greenBg,
      item.isFinished ? COLORS.textMuted : COLORS.green,
      19,
      10,
      30
    )

    // 底部细分隔线
    if (idx < shown.length - 1) {
      ctx.beginPath()
      ctx.strokeStyle = '#f1f5f9'
      ctx.lineWidth = 1
      ctx.moveTo(innerX + 8, curY + block.rowH)
      ctx.lineTo(innerX + innerW - 8, curY + block.rowH)
      ctx.stroke()
    }

    curY += block.rowH
  })

  if (list.length > MAX_SINGLE_SCHEDULES) {
    ctx.font = '21px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`该时段共 ${list.length} 节课，已展示前 ${MAX_SINGLE_SCHEDULES} 节`, innerX + innerW / 2, curY + 22)
  }
}

/**
 * 绘制成绩折线图 + 考试明细表
 */
function drawScoresCard(ctx, block, data) {
  const { scores, scoreStats } = data
  const x = PAD_X
  const y = block.y
  const w = CONTENT_W
  const h = block.h
  const innerX = x + 28
  const innerW = w - 56

  fillRoundRect(ctx, x, y, w, h, 20, COLORS.cardBg, COLORS.cardBorder, 1.5)
  const rightSummary = block.hasScores ? `最高 ${scoreStats.max} · 均分 ${scoreStats.avg}` : ''
  drawSectionHeader(
    ctx,
    innerX,
    y + 28,
    innerW,
    '成绩变化趋势',
    block.hasScores ? `${scores.length} 次记录` : '',
    rightSummary
  )

  let curY = y + 28 + 40 + 20
  if (!block.hasScores) {
    fillRoundRect(ctx, innerX, curY, innerW, 96, 14, COLORS.softBg, COLORS.cardBorder, 1)
    ctx.font = '24px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂无成绩记录', innerX + innerW / 2, curY + 48)
    return
  }

  // 1. 折线图底框
  const chartX = innerX
  const chartY = curY
  const chartW = innerW
  const chartH = block.chartH
  fillRoundRect(ctx, chartX, chartY, chartW, chartH, 16, COLORS.softBg, COLORS.cardBorder, 1)

  drawScoreLineChart(ctx, chartX, chartY, chartW, chartH, scores)
  curY += chartH + 24

  // 2. 最近成绩明细表（按时间倒序）
  const descScores = [...scores].reverse()
  const shown = descScores.slice(0, MAX_SCORE_ROWS)

  fillRoundRect(ctx, innerX, curY, innerW, 46, 10, COLORS.slateBg)
  ctx.font = '600 21px sans-serif'
  ctx.fillStyle = COLORS.textSecondary
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('考试日期', innerX + 18, curY + 23)
  ctx.fillText('考试名称 / 备注', innerX + 190, curY + 23)
  ctx.textAlign = 'right'
  ctx.fillText('成绩', innerX + innerW - 18, curY + 23)

  curY += 46

  shown.forEach((rec, idx) => {
    if (idx % 2 === 1) {
      fillRoundRect(ctx, innerX, curY, innerW, 52, 8, COLORS.softBg)
    }
    const midY = curY + 26
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = '22px sans-serif'
    ctx.fillStyle = COLORS.textSecondary
    ctx.fillText(rec.date || '--', innerX + 18, midY)

    ctx.fillStyle = COLORS.textPrimary
    ctx.fillText(truncateText(ctx, rec.examName || '日常测验', innerW - 310), innerX + 190, midY)

    ctx.textAlign = 'right'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillStyle = COLORS.primary
    ctx.fillText(`${rec.score} 分`, innerX + innerW - 18, midY)

    curY += 52
  })

  if (scores.length > MAX_SCORE_ROWS) {
    ctx.font = '20px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`共 ${scores.length} 次成绩，折线图展示全部趋势，列表展示最近 ${MAX_SCORE_ROWS} 次`, innerX + innerW / 2, curY + 20)
  }
}

/**
 * 在指定矩形内绘制清爽浅色折线图
 */
function drawScoreLineChart(ctx, ox, oy, w, h, records) {
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

  const padTop = 38
  const padRight = 28
  const padBottom = 42
  const padLeft = yMax >= 1000 ? 72 : 58
  const plotX = ox + padLeft
  const plotY = oy + padTop
  const plotW = Math.max(10, w - padLeft - padRight)
  const plotH = Math.max(10, h - padTop - padBottom)
  const yRange = yMax - yMin || 1

  // 横向网格线与 Y 轴刻度
  const tickCount = 4
  ctx.font = '19px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= tickCount; i++) {
    const ratio = i / tickCount
    const val = yMin + yRange * (1 - ratio)
    const y = plotY + plotH * ratio

    ctx.beginPath()
    ctx.strokeStyle = i === tickCount ? '#cbd5e1' : '#e2e8f0'
    ctx.lineWidth = i === tickCount ? 1.5 : 1
    ctx.moveTo(plotX, y)
    ctx.lineTo(plotX + plotW, y)
    ctx.stroke()

    const label = Number.isInteger(val) ? String(val) : String(Math.round(val * 10) / 10)
    ctx.fillStyle = COLORS.textMuted
    ctx.fillText(label, plotX - 10, y)
  }

  // 坐标点
  const n = records.length
  const innerPadX = n === 1 ? plotW / 2 : Math.min(34, plotW / (n * 2))
  const usableW = Math.max(1, plotW - innerPadX * 2)
  const points = records.map((rec, idx) => {
    const px = n === 1 ? plotX + plotW / 2 : plotX + innerPadX + (usableW * idx) / (n - 1)
    const py = plotY + plotH * (1 - (rec.score - yMin) / yRange)
    return { x: px, y: py, rec }
  })

  // 折线面积渐变 + 主线
  if (points.length >= 2) {
    const areaGrad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH)
    areaGrad.addColorStop(0, 'rgba(37, 99, 235, 0.22)')
    areaGrad.addColorStop(1, 'rgba(37, 99, 235, 0.01)')

    ctx.beginPath()
    ctx.moveTo(points[0].x, plotY + plotH)
    points.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.lineTo(points[points.length - 1].x, plotY + plotH)
    ctx.closePath()
    ctx.fillStyle = areaGrad
    ctx.fill()

    ctx.beginPath()
    ctx.strokeStyle = COLORS.primary
    ctx.lineWidth = 3.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.stroke()
  }

  // 决定展示哪些点的分数标注
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

  points.forEach((p, idx) => {
    const isLast = idx === n - 1
    if (isLast) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(37, 99, 235, 0.16)'
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(p.x, p.y, isLast ? 7 : 6, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.primary
    ctx.fill()

    ctx.beginPath()
    ctx.arc(p.x, p.y, isLast ? 3.5 : 3, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    if (showValSet.has(idx)) {
      ctx.font = isLast ? 'bold 21px sans-serif' : '600 19px sans-serif'
      ctx.fillStyle = isLast ? COLORS.primary : COLORS.textPrimary
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      const textY = Math.max(oy + 22, p.y - 12)
      ctx.fillText(String(p.rec.score), p.x, textY)
    }
  })

  // X 轴时间刻度（最多 5 个防重叠）
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
  ctx.font = '19px sans-serif'
  ctx.fillStyle = COLORS.textMuted
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
    ctx.fillText(label, p.x, plotY + plotH + 12)
  })
}

/**
 * 绘制页脚署名
 */
function drawFooter(ctx, block, data) {
  const { teacherName, generatedDateTime } = data
  const y = block.y
  ctx.beginPath()
  ctx.strokeStyle = COLORS.divider
  ctx.lineWidth = 1
  ctx.moveTo(PAD_X + 20, y + 6)
  ctx.lineTo(LOGICAL_WIDTH - PAD_X - 20, y + 6)
  ctx.stroke()

  const footerText = teacherName
    ? `授课教师：${teacherName}  ·  ${generatedDateTime}`
    : `课程管理学习报告  ·  ${generatedDateTime}`
  ctx.font = '20px sans-serif'
  ctx.fillStyle = COLORS.textMuted
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(footerText, LOGICAL_WIDTH / 2, y + 34)
}

/**
 * 安全加载头像图片（失败则返回 null，自动降级为姓名首字徽章）
 */
function loadAvatarImage(canvas, avatarUrl) {
  return new Promise(resolve => {
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      resolve(null)
      return
    }
    const finishWithLocalPath = (localPath) => {
      if (!localPath) {
        resolve(null)
        return
      }
      const img = canvas.createImage()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = localPath
    }

    if (avatarUrl.startsWith('cloud://') && wx.cloud && wx.cloud.downloadFile) {
      wx.cloud.downloadFile({
        fileID: avatarUrl,
        success: res => finishWithLocalPath(res.tempFilePath),
        fail: () => resolve(null)
      })
      return
    }

    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      wx.getImageInfo({
        src: avatarUrl,
        success: res => finishWithLocalPath(res.path),
        fail: () => resolve(null)
      })
      return
    }

    finishWithLocalPath(avatarUrl)
  })
}

/**
 * 主绘制入口：渲染到 Canvas 2D 节点并导出高清 PNG 临时文件路径
 */
async function renderReportToFile(canvas, data) {
  const layout = calculateLayout(data)
  const totalHeight = layout.totalHeight

  // 根据总高度自适应缩放倍率（防止部分安卓机型超出 6000px 纹理限制）
  const dpr = totalHeight * 2 <= 5800 ? 2 : Math.max(1, Math.floor((5800 / totalHeight) * 10) / 10)

  canvas.width = Math.round(LOGICAL_WIDTH * dpr)
  canvas.height = Math.round(totalHeight * dpr)

  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.scale(dpr, dpr)

  // 整体清爽浅灰蓝背景
  ctx.fillStyle = COLORS.pageBg
  ctx.fillRect(0, 0, LOGICAL_WIDTH, totalHeight)

  const avatarImg = await loadAvatarImage(canvas, data.student && data.student.avatar)

  const { blocks } = layout
  drawHeader(ctx, blocks.header, data, avatarImg)

  if (blocks.overview) {
    drawOverview(ctx, blocks.overview)
  }
  if (blocks.allCourses) {
    drawAllCourses(ctx, blocks.allCourses, data)
  }
  if (blocks.singleCourse) {
    drawSingleCourse(ctx, blocks.singleCourse, data)
  }
  if (blocks.scores) {
    drawScoresCard(ctx, blocks.scores, data)
  }
  drawFooter(ctx, blocks.footer, data)

  ctx.restore()

  // 导出临时文件
  const tempFilePath = await new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      quality: 1,
      success: res => resolve(res.tempFilePath),
      fail: err => reject(err)
    })
  })

  return {
    tempFilePath,
    width: LOGICAL_WIDTH,
    height: totalHeight
  }
}

module.exports = {
  LOGICAL_WIDTH,
  calculateLayout,
  renderReportToFile
}
