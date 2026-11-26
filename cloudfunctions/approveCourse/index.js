const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

async function fetchScheduleIdsByParent(parentId) {
  const MAX_LIMIT = 100
  let ids = []
  let offset = 0
  while (true) {
    const res = await db.collection('course_schedule')
      .where({ parentId })
      .field({ _id: true })
      .skip(offset)
      .limit(MAX_LIMIT)
      .get()
    const batch = res.data || []
    ids = ids.concat(batch.map(d => d._id))
    if (batch.length < MAX_LIMIT) break
    offset += MAX_LIMIT
  }
  return ids
}

exports.main = async (event, context) => {
  const { applicationId, teacherId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!applicationId) {
    return { code: 1, message: '参数不完整' }
  }
  if (teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限审批他人课程申请' }
  }

  try {
    // 事务外读取申请拿到 courseId，用于后续同步子课学生名单
    const preAppRes = await db.collection('course_applications').doc(applicationId).get()
    const preApp = preAppRes && preAppRes.data
    if (!preApp) {
      return { code: 1, message: '申请不存在' }
    }
    if (preApp.teacherId !== callerOpenid) {
      return { code: 1, message: '无权限审批此申请' }
    }
    if (preApp.status !== 'pending') {
      return { code: 1, message: '该申请已处理，不可重复审批' }
    }

    const scheduleIds = await fetchScheduleIdsByParent(preApp.courseId)

    let txResp = null
    await db.runTransaction(async transaction => {
      const appRes = await transaction.collection('course_applications').doc(applicationId).get()
      const application = appRes && appRes.data
      if (!application) {
        txResp = { code: 1, message: '申请不存在' }
        return
      }
      if (application.teacherId !== callerOpenid) {
        txResp = { code: 1, message: '无权限审批此申请' }
        return
      }
      if (application.status !== 'pending') {
        txResp = { code: 1, message: '该申请已处理，不可重复审批' }
        return
      }

      const courseRes = await transaction.collection('courses').doc(application.courseId).get()
      const course = courseRes && courseRes.data
      if (!course || course.teacherId !== callerOpenid) {
        txResp = { code: 1, message: '关联课程不存在或无权限' }
        return
      }

      const currentStudents = Array.isArray(course.students) ? course.students : []
      const classType = (course.classType === 'one_on_one' || course.classType === 'group')
        ? course.classType
        : (currentStudents.length > 1 ? 'group' : 'one_on_one')
      const capacity = typeof course.capacity === 'number'
        ? course.capacity
        : (classType === 'one_on_one' ? 1 : 0)
      if (!currentStudents.includes(application.studentId) && capacity > 0 && currentStudents.length >= capacity) {
        txResp = { code: 1, message: `班级已满（上限 ${capacity} 人），无法继续通过` }
        return
      }

      const now = new Date()
      await transaction.collection('course_applications').doc(applicationId).update({
        data: {
          status: 'approved',
          updateTime: now
        }
      })

      const nextStudents = currentStudents.includes(application.studentId)
        ? currentStudents
        : [...currentStudents, application.studentId]

      await transaction.collection('courses').doc(application.courseId).update({
        data: {
          students: nextStudents,
          updateTime: now
        }
      })

      txResp = {
        code: 0,
        message: '已通过申请',
        data: {
          success: true,
          courseId: application.courseId,
          studentId: application.studentId
        }
      }
    })

    // 事务外同步子课 students（使用 _.addToSet 幂等同步，避免大课程超过事务操作上限）
    if (txResp && txResp.code === 0 && scheduleIds.length > 0) {
      const _ = db.command
      const CHUNK = 20
      for (let i = 0; i < scheduleIds.length; i += CHUNK) {
        const chunk = scheduleIds.slice(i, i + CHUNK)
        await Promise.allSettled(
          chunk.map(sid =>
            db.collection('course_schedule').doc(sid).update({
              data: {
                students: _.addToSet(preApp.studentId),
                updateTime: db.serverDate()
              }
            })
          )
        )
      }
    }

    return txResp || { code: 1, message: '操作失败' }
  } catch (err) {
    console.error('[approveCourse] error:', err.message)
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}
