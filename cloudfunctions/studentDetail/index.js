const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const { validateHoursMutation } = require('./hoursUtils')

const ALLOWED_SAVE_FIELDS = ['name', 'phone', 'nativePlace', 'grade', 'subject', 'remark']

function validateScorePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: '成绩数据格式错误' }
  }
  const dateStr = String(payload.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, message: '请选择正确的考试日期' }
  }
  const scoreNum = Number(payload.score)
  if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 10000) {
    return { ok: false, message: '请输入有效成绩（0 - 10000）' }
  }
  const roundedScore = Math.round(scoreNum * 100) / 100
  const examName = String(payload.examName || '').trim().slice(0, 100)
  return {
    ok: true,
    date: dateStr,
    score: roundedScore,
    examName
  }
}

function sortScoreRecords(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const da = String((a && a.date) || '')
    const dbStr = String((b && b.date) || '')
    if (da !== dbStr) return da.localeCompare(dbStr)
    return ((a && a.createTime) || 0) - ((b && b.createTime) || 0)
  })
}

exports.main = async (event, context) => {
  const { type, teacherId, studentId, studentDetail, amount, requestId, scoreRecord, scoreId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!type || !studentId) {
    return { code: 1, message: '参数不完整' }
  }
  if (teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限操作他人学生资料' }
  }

  const effectiveTeacherId = callerOpenid

  try {
    // 统一先查师生绑定记录（所有操作均须基于已存在的师生归属关系，防越权）
    const bindingLookup = await db.collection('teacher_student_bindings')
      .where({ teacherId: effectiveTeacherId, studentId })
      .limit(1)
      .get()
    const bindingDoc = bindingLookup.data && bindingLookup.data[0]

    if (!bindingDoc) {
      return { code: 1, message: '未找到师生绑定记录或无权限' }
    }

    if (type === 'get') {
      const userRes = await db.collection('users')
        .where({ openid: studentId })
        .limit(1)
        .get()
      const user = (userRes.data && userRes.data[0]) || {}

      return {
        code: 0,
        data: {
          studentName: user.name || bindingDoc.studentName || '',
          studentPhone: user.phone || '',
          avatar: user.avatar || '',
          status: bindingDoc.status || 'approved',
          statusStr: bindingDoc.status === 'approved'
            ? '已绑定'
            : bindingDoc.status === 'pending'
              ? '待审核'
              : bindingDoc.status === 'unbound'
                ? '未绑定'
                : '已拒绝',
          nativePlace: user.nativePlace || '',
          grade: user.grade || '',
          subject: user.subject || '',
          remark: user.remark || '',
          purchasedHours: bindingDoc.purchasedHours || 0,
          remainingHours: bindingDoc.remainingHours || 0,
          hourLogs: bindingDoc.hourLogs || [],
          scoreRecords: sortScoreRecords(bindingDoc.scoreRecords || [])
        }
      }
    }

    if (type === 'purchaseHours' || type === 'adjustHours' || type === 'refundHours') {
      // 前置基本校验（拦截 NaN / Infinity / 0 / 负数）
      const preCheck = validateHoursMutation(type, amount, bindingDoc.purchasedHours, bindingDoc.remainingHours)
      if (!preCheck.ok && (typeof amount !== 'number' || !Number.isFinite(amount))) {
        return { code: 1, message: preCheck.message }
      }

      const bindingId = bindingDoc._id
      let txResp = null

      await db.runTransaction(async transaction => {
        const lockedRes = await transaction.collection('teacher_student_bindings').doc(bindingId).get()
        const locked = lockedRes && lockedRes.data
        if (!locked || locked.teacherId !== effectiveTeacherId || locked.studentId !== studentId) {
          throw new Error('师生绑定记录不存在或无权限')
        }

        const existingLogs = Array.isArray(locked.hourLogs) ? locked.hourLogs : []
        if (requestId && existingLogs.some(l => l && l.requestId === requestId)) {
          txResp = {
            code: 0,
            message: '操作已处理',
            data: {
              duplicate: true,
              purchasedHours: locked.purchasedHours || 0,
              remainingHours: locked.remainingHours || 0
            }
          }
          return
        }

        const calc = validateHoursMutation(type, amount, locked.purchasedHours, locked.remainingHours)
        if (!calc.ok) {
          txResp = { code: 1, message: calc.message }
          return
        }

        const logEntry = {
          type: calc.logType,
          amount: calc.amount,
          createTime: Date.now()
        }
        if (requestId) {
          logEntry.requestId = String(requestId)
        }

        const updatePayload = {
          remainingHours: calc.nextRemaining,
          hourLogs: _.push(logEntry),
          updateTime: new Date()
        }
        if (type === 'purchaseHours' || type === 'refundHours') {
          updatePayload.purchasedHours = calc.nextPurchased
        }

        await transaction.collection('teacher_student_bindings').doc(bindingId).update({
          data: updatePayload
        })

        txResp = {
          code: 0,
          message: type === 'purchaseHours' ? '购买课时成功' : type === 'adjustHours' ? '调整课时成功' : '退费成功',
          data: {
            duplicate: false,
            purchasedHours: calc.nextPurchased,
            remainingHours: calc.nextRemaining
          }
        }
      })

      return txResp || { code: 1, message: '操作失败' }
    }

    if (type === 'save') {
      if (!studentDetail || typeof studentDetail !== 'object') {
        return { code: 1, message: '学生资料格式错误' }
      }

      // 严格字段白名单，防止越权修改 role / openid / reminderQuota
      const safeUpdate = { updateTime: db.serverDate() }
      ALLOWED_SAVE_FIELDS.forEach(field => {
        if (studentDetail[field] !== undefined) {
          safeUpdate[field] = String(studentDetail[field])
        }
      })

      const userRes = await db.collection('users')
        .where({ openid: studentId })
        .limit(1)
        .get()

      if (userRes.data && userRes.data.length > 0) {
        await db.collection('users').doc(userRes.data[0]._id).update({
          data: safeUpdate
        })
        return {
          code: 0,
          message: '更新成功',
          data: { success: true }
        }
      }

      return { code: 1, message: '未找到该学生记录' }
    }

    if (type === 'addScore') {
      const check = validateScorePayload(scoreRecord)
      if (!check.ok) {
        return { code: 1, message: check.message }
      }

      const bindingId = bindingDoc._id
      let txResp = null

      await db.runTransaction(async transaction => {
        const lockedRes = await transaction.collection('teacher_student_bindings').doc(bindingId).get()
        const locked = lockedRes && lockedRes.data
        if (!locked || locked.teacherId !== effectiveTeacherId || locked.studentId !== studentId) {
          throw new Error('师生绑定记录不存在或无权限')
        }

        const existing = Array.isArray(locked.scoreRecords) ? locked.scoreRecords : []
        if (requestId && existing.some(s => s && s.requestId === requestId)) {
          txResp = {
            code: 0,
            message: '成绩已录入',
            data: {
              duplicate: true,
              scoreRecords: sortScoreRecords(existing)
            }
          }
          return
        }

        const nowTs = Date.now()
        const newRecord = {
          id: `score_${nowTs}_${Math.random().toString(36).slice(2, 8)}`,
          date: check.date,
          score: check.score,
          examName: check.examName,
          createTime: nowTs,
          updateTime: nowTs
        }
        if (requestId) {
          newRecord.requestId = String(requestId)
        }

        const nextRecords = sortScoreRecords([...existing, newRecord])
        await transaction.collection('teacher_student_bindings').doc(bindingId).update({
          data: {
            scoreRecords: nextRecords,
            updateTime: new Date()
          }
        })

        txResp = {
          code: 0,
          message: '成绩录入成功',
          data: {
            duplicate: false,
            record: newRecord,
            scoreRecords: nextRecords
          }
        }
      })

      return txResp || { code: 1, message: '录入失败' }
    }

    if (type === 'updateScore') {
      if (!scoreId) {
        return { code: 1, message: '缺少成绩记录ID' }
      }
      const check = validateScorePayload(scoreRecord)
      if (!check.ok) {
        return { code: 1, message: check.message }
      }

      const bindingId = bindingDoc._id
      let txResp = null

      await db.runTransaction(async transaction => {
        const lockedRes = await transaction.collection('teacher_student_bindings').doc(bindingId).get()
        const locked = lockedRes && lockedRes.data
        if (!locked || locked.teacherId !== effectiveTeacherId || locked.studentId !== studentId) {
          throw new Error('师生绑定记录不存在或无权限')
        }

        const existing = Array.isArray(locked.scoreRecords) ? locked.scoreRecords : []
        const targetIdx = existing.findIndex(s => s && s.id === scoreId)
        if (targetIdx === -1) {
          txResp = { code: 1, message: '未找到该条成绩记录' }
          return
        }

        const updatedRecord = {
          ...existing[targetIdx],
          date: check.date,
          score: check.score,
          examName: check.examName,
          updateTime: Date.now()
        }
        const nextList = [...existing]
        nextList[targetIdx] = updatedRecord
        const sorted = sortScoreRecords(nextList)

        await transaction.collection('teacher_student_bindings').doc(bindingId).update({
          data: {
            scoreRecords: sorted,
            updateTime: new Date()
          }
        })

        txResp = {
          code: 0,
          message: '更新成功',
          data: {
            record: updatedRecord,
            scoreRecords: sorted
          }
        }
      })

      return txResp || { code: 1, message: '更新失败' }
    }

    if (type === 'deleteScore') {
      if (!scoreId) {
        return { code: 1, message: '缺少成绩记录ID' }
      }

      const bindingId = bindingDoc._id
      let txResp = null

      await db.runTransaction(async transaction => {
        const lockedRes = await transaction.collection('teacher_student_bindings').doc(bindingId).get()
        const locked = lockedRes && lockedRes.data
        if (!locked || locked.teacherId !== effectiveTeacherId || locked.studentId !== studentId) {
          throw new Error('师生绑定记录不存在或无权限')
        }

        const existing = Array.isArray(locked.scoreRecords) ? locked.scoreRecords : []
        const nextList = existing.filter(s => s && s.id !== scoreId)
        if (nextList.length === existing.length) {
          txResp = { code: 1, message: '未找到该条成绩记录' }
          return
        }

        const sorted = sortScoreRecords(nextList)
        await transaction.collection('teacher_student_bindings').doc(bindingId).update({
          data: {
            scoreRecords: sorted,
            updateTime: new Date()
          }
        })

        txResp = {
          code: 0,
          message: '删除成功',
          data: {
            scoreRecords: sorted
          }
        }
      })

      return txResp || { code: 1, message: '删除失败' }
    }

    return { code: 1, message: '无效的操作类型' }
  } catch (err) {
    console.error(`[studentDetail] type=${type} error:`, err.message)
    return {
      code: 1,
      message: err.message || '操作失败',
      error: err.message
    }
  }
}
