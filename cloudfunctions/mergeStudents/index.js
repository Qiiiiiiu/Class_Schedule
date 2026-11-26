const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

async function fetchMatchingIds(collectionName, whereCond) {
  const MAX_LIMIT = 100
  let ids = []
  let offset = 0
  while (true) {
    const res = await db.collection(collectionName)
      .where(whereCond)
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
  const { teacherId, sourceStudentId, targetStudentId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!sourceStudentId || !targetStudentId) {
    return { code: 1, message: '参数不完整' }
  }
  if (teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限合并他人学生' }
  }
  if (sourceStudentId === targetStudentId) {
    return { code: 1, message: '不能与自己合并' }
  }

  const effectiveTeacherId = callerOpenid

  try {
    // CloudBase 事务内不支持 .where()，先在事务外查出所有目标文档 _id
    const [sourceRes, targetRes, courseIds, scheduleIds] = await Promise.all([
      db.collection('teacher_student_bindings')
        .where({ teacherId: effectiveTeacherId, studentId: sourceStudentId, status: 'unbound' })
        .field({ _id: true })
        .limit(1)
        .get(),
      db.collection('teacher_student_bindings')
        .where({ teacherId: effectiveTeacherId, studentId: targetStudentId, status: 'approved' })
        .field({ _id: true })
        .limit(1)
        .get(),
      fetchMatchingIds('courses', {
        teacherId: effectiveTeacherId,
        students: _.elemMatch(_.eq(sourceStudentId))
      }),
      fetchMatchingIds('course_schedule', {
        teacherId: effectiveTeacherId,
        students: _.elemMatch(_.eq(sourceStudentId))
      })
    ])

    if (!sourceRes.data || sourceRes.data.length === 0) {
      return { code: 1, message: '源学生不存在或不是未绑定状态' }
    }
    if (!targetRes.data || targetRes.data.length === 0) {
      return { code: 1, message: '目标学生不存在或不是已绑定状态' }
    }

    const sourceBindingId = sourceRes.data[0]._id
    const targetBindingId = targetRes.data[0]._id

    let migratedCourses = 0
    await db.runTransaction(async transaction => {
      const [lockedSourceRes, lockedTargetRes] = await Promise.all([
        transaction.collection('teacher_student_bindings').doc(sourceBindingId).get(),
        transaction.collection('teacher_student_bindings').doc(targetBindingId).get()
      ])
      const sourceBinding = lockedSourceRes && lockedSourceRes.data
      const targetBinding = lockedTargetRes && lockedTargetRes.data

      if (!sourceBinding || sourceBinding.status !== 'unbound' || sourceBinding.teacherId !== effectiveTeacherId) {
        throw new Error('源学生不存在或状态已变更')
      }
      if (!targetBinding || targetBinding.status !== 'approved' || targetBinding.teacherId !== effectiveTeacherId) {
        throw new Error('目标学生不存在或状态已变更')
      }

      const now = new Date()

      // 1. 迁移父课程学生名单
      for (const cId of courseIds) {
        const cRes = await transaction.collection('courses').doc(cId).get()
        const course = cRes && cRes.data
        if (!course || !Array.isArray(course.students)) continue
        const nextStudents = course.students.filter(id => id !== sourceStudentId)
        if (!nextStudents.includes(targetStudentId)) {
          nextStudents.push(targetStudentId)
        }
        await transaction.collection('courses').doc(cId).update({
          data: { students: nextStudents, updateTime: now }
        })
        migratedCourses++
      }

      // 2. 合并源学生的已购课时、剩余课时、课时日志与成绩记录到目标学生
      const mergedPurchased = Math.round(((targetBinding.purchasedHours || 0) + (sourceBinding.purchasedHours || 0)) * 100) / 100
      const mergedRemaining = Math.round(((targetBinding.remainingHours || 0) + (sourceBinding.remainingHours || 0)) * 100) / 100
      const sourceLogs = Array.isArray(sourceBinding.hourLogs) ? sourceBinding.hourLogs : []
      const targetLogs = Array.isArray(targetBinding.hourLogs) ? targetBinding.hourLogs : []
      const mergedLogs = [...targetLogs, ...sourceLogs].sort((a, b) => (a.createTime || 0) - (b.createTime || 0))

      const sourceScores = Array.isArray(sourceBinding.scoreRecords) ? sourceBinding.scoreRecords : []
      const targetScores = Array.isArray(targetBinding.scoreRecords) ? targetBinding.scoreRecords : []
      const seenScoreIds = new Set(targetScores.map(s => s && s.id).filter(Boolean))
      const mergedScores = [...targetScores]
      sourceScores.forEach(s => {
        if (!s) return
        if (s.id && seenScoreIds.has(s.id)) return
        if (s.id) seenScoreIds.add(s.id)
        mergedScores.push(s)
      })
      mergedScores.sort((a, b) => {
        const da = String((a && a.date) || '')
        const dbStr = String((b && b.date) || '')
        if (da !== dbStr) return da.localeCompare(dbStr)
        return ((a && a.createTime) || 0) - ((b && b.createTime) || 0)
      })

      await transaction.collection('teacher_student_bindings').doc(targetBindingId).update({
        data: {
          purchasedHours: mergedPurchased,
          remainingHours: mergedRemaining,
          hourLogs: mergedLogs,
          scoreRecords: mergedScores,
          updateTime: now
        }
      })

      // 3. 删除源学生绑定记录
      await transaction.collection('teacher_student_bindings').doc(sourceBindingId).remove()
    })

    // 4. 事务外同步子课 course_schedule 的 students（避免大量子课触发事务超时）
    if (scheduleIds.length > 0) {
      const CHUNK = 20
      for (let i = 0; i < scheduleIds.length; i += CHUNK) {
        const chunk = scheduleIds.slice(i, i + CHUNK)
        await Promise.allSettled(
          chunk.map(async sId => {
            const sRes = await db.collection('course_schedule').doc(sId).get()
            const sch = sRes && sRes.data
            if (!sch || !Array.isArray(sch.students)) return
            const nextStudents = sch.students.filter(id => id !== sourceStudentId)
            if (!nextStudents.includes(targetStudentId)) {
              nextStudents.push(targetStudentId)
            }
            await db.collection('course_schedule').doc(sId).update({
              data: { students: nextStudents, updateTime: db.serverDate() }
            })
          })
        )
      }
    }

    return {
      code: 0,
      data: {
        message: '合并成功',
        migratedCourses,
        migratedSchedules: scheduleIds.length
      }
    }
  } catch (err) {
    console.error('[mergeStudents] error:', err.message)
    return {
      code: 1,
      message: err.message || '合并失败',
      error: err.message
    }
  }
}
