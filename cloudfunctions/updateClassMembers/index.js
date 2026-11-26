const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

function getTodayBeijingStr() {
  const bj = new Date(Date.now() + BEIJING_OFFSET_MS)
  const y = bj.getUTCFullYear()
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0')
  const d = String(bj.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function resolveClassType(course) {
  if (course.classType === 'one_on_one' || course.classType === 'group') {
    return course.classType
  }
  return Array.isArray(course.students) && course.students.length > 1 ? 'group' : 'one_on_one'
}

exports.main = async (event, context) => {
  const { courseId, studentIds } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!courseId || !Array.isArray(studentIds)) {
    return { code: 1, message: '参数不完整' }
  }

  try {
    const courseRes = await db.collection('courses').doc(courseId).get()
    const course = courseRes && courseRes.data
    if (!course) {
      return { code: 1, message: '班级不存在' }
    }
    if (course.teacherId !== callerOpenid) {
      return { code: 1, message: '无权限管理他人班级学员' }
    }

    const nextStudents = [...new Set(studentIds.filter(Boolean).map(String))]
    const classType = resolveClassType(course)
    const capacity = typeof course.capacity === 'number'
      ? course.capacity
      : (classType === 'one_on_one' ? 1 : 0)

    if (classType === 'one_on_one' && nextStudents.length > 1) {
      return { code: 1, message: '一对一班级最多只能绑定 1 名学生' }
    }
    if (classType === 'group' && capacity > 0 && nextStudents.length > capacity) {
      return { code: 1, message: `超出班级人数上限（${capacity}人）` }
    }

    const now = new Date()
    await db.collection('courses').doc(courseId).update({
      data: {
        students: nextStudents,
        classType,
        capacity,
        updateTime: now
      }
    })

    // 关键边界规则：仅同步“今天及以后”的未来排课，绝不篡改已上完的历史课表
    const todayStr = getTodayBeijingStr()
    const syncRes = await db.collection('course_schedule')
      .where({
        parentId: courseId,
        'schedule.date': _.gte(todayStr)
      })
      .update({
        data: {
          students: nextStudents,
          studentCount: nextStudents.length,
          updateTime: now
        }
      })

    return {
      code: 0,
      message: '学员更新成功',
      data: {
        success: true,
        students: nextStudents,
        studentCount: nextStudents.length,
        syncedFutureSchedules: (syncRes && syncRes.stats && syncRes.stats.updated) || 0
      }
    }
  } catch (err) {
    console.error('[updateClassMembers] error:', err.message)
    return {
      code: 1,
      message: '更新班级学员失败',
      error: err.message
    }
  }
}
