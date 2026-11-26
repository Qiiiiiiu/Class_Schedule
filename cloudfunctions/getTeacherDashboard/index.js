const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

function resolveClassType(course) {
  if (course.classType === 'one_on_one' || course.classType === 'group') {
    return course.classType
  }
  return Array.isArray(course.students) && course.students.length > 1 ? 'group' : 'one_on_one'
}

async function fetchAllPaginated(collectionName, whereCond, fieldProjection) {
  const MAX_LIMIT = 100
  let list = []
  let offset = 0
  while (true) {
    let query = db.collection(collectionName).where(whereCond)
    if (fieldProjection) {
      query = query.field(fieldProjection)
    }
    const res = await query.skip(offset).limit(MAX_LIMIT).get()
    const batch = res.data || []
    list = list.concat(batch)
    if (batch.length < MAX_LIMIT) break
    offset += MAX_LIMIT
  }
  return list
}

exports.main = async (event, context) => {
  const { teacherId, startDate, endDate } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  const effectiveTeacherId = callerOpenid || teacherId
  if (!effectiveTeacherId) {
    return { code: 1, message: '参数不完整' }
  }
  if (callerOpenid && teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限查看他人仪表盘' }
  }

  try {
    const scheduleQuery = {
      teacherId: effectiveTeacherId,
      status: 'available'
    }
    if (startDate && endDate) {
      scheduleQuery['schedule.date'] = _.gte(startDate).and(_.lte(endDate))
    } else if (startDate) {
      scheduleQuery['schedule.date'] = _.gte(startDate)
    } else if (endDate) {
      scheduleQuery['schedule.date'] = _.lte(endDate)
    }

    const [
      allSchedules,
      allCourses,
      studentsCountRes,
      bindingsCountRes,
      bindingsRes,
      applicationsCountRes,
      applicationsRes
    ] = await Promise.all([
      fetchAllPaginated('course_schedule', scheduleQuery, {
        _id: true,
        name: true,
        parentId: true,
        price: true,
        classType: true,
        billingMode: true,
        students: true,
        studentCount: true,
        status: true,
        schedule: true
      }),
      fetchAllPaginated('courses', { teacherId: effectiveTeacherId }, {
        _id: true,
        price: true,
        pricePerHour: true,
        classType: true,
        billingMode: true,
        students: true
      }),
      db.collection('teacher_student_bindings').where({
        teacherId: effectiveTeacherId,
        status: _.in(['pending', 'approved', 'rejected', 'unbound'])
      }).count(),
      db.collection('teacher_student_bindings').where({
        teacherId: effectiveTeacherId,
        status: 'pending'
      }).count(),
      db.collection('teacher_student_bindings').where({
        teacherId: effectiveTeacherId,
        status: 'pending'
      }).orderBy('applyTime', 'desc').limit(2).get(),
      db.collection('course_applications').where({
        teacherId: effectiveTeacherId,
        status: 'pending'
      }).count(),
      db.collection('course_applications').where({
        teacherId: effectiveTeacherId,
        status: 'pending'
      }).orderBy('applyTime', 'desc').limit(2).get()
    ])

    const coursePriceMap = {}
    const courseMetaMap = {}
    let oneOnOneCount = 0
    let groupClassCount = 0

    allCourses.forEach(c => {
      const cType = resolveClassType(c)
      const bMode = cType === 'group' && c.billingMode === 'per_student' ? 'per_student' : 'per_session'
      const price = c.price || c.pricePerHour || 0
      coursePriceMap[c._id] = price
      courseMetaMap[c._id] = {
        price,
        classType: cType,
        billingMode: bMode,
        studentCount: Array.isArray(c.students) ? c.students.length : 0
      }
      if (cType === 'group') groupClassCount++
      else oneOnOneCount++
    })

    const enrichedSchedules = allSchedules.map(item => {
      const meta = (item.parentId && courseMetaMap[item.parentId]) || {}
      const cType = item.classType || meta.classType || 'one_on_one'
      const bMode = item.billingMode || meta.billingMode || 'per_session'
      const sCount = (Array.isArray(item.students) && item.students.length > 0)
        ? item.students.length
        : (item.studentCount || meta.studentCount || 0)
      const basePrice = item.price || meta.price || 0
      const effectivePrice = bMode === 'per_student' ? basePrice * sCount : basePrice
      return {
        ...item,
        classType: cType,
        billingMode: bMode,
        studentCount: sCount,
        price: effectivePrice
      }
    })

    const pendingBindings = (bindingsRes.data || []).map(item => ({
      _id: item._id,
      studentName: item.studentName || '学生'
    }))

    const pendingApplications = (applicationsRes.data || []).map(item => ({
      _id: item._id,
      studentName: item.studentName || '学生',
      courseName: item.courseName || '课程'
    }))

    return {
      code: 0,
      data: {
        studentCount: studentsCountRes.total || 0,
        courseCount: allCourses.length,
        oneOnOneCount,
        groupClassCount,
        coursePriceMap,
        scheduleCount: enrichedSchedules.length,
        schedules: enrichedSchedules,
        pendingBindingsCount: bindingsCountRes.total || 0,
        pendingApplicationsCount: applicationsCountRes.total || 0,
        pendingBindings,
        pendingApplications
      }
    }
  } catch (err) {
    console.error('[getTeacherDashboard] error:', err.message)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
