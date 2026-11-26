const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const { validateHoursMutation } = require('./hoursUtils')

const ALLOWED_SAVE_FIELDS = ['name', 'phone', 'nativePlace', 'grade', 'subject', 'remark']

exports.main = async (event, context) => {
  const { type, teacherId, studentId, studentDetail, amount, requestId } = event || {}
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
          hourLogs: bindingDoc.hourLogs || []
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
