const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { courseId, studentId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!courseId) {
    return { code: 1, message: '参数不完整' }
  }
  if (studentId && studentId !== callerOpenid) {
    return { code: 1, message: '无权限代他人申请课程' }
  }

  const effectiveStudentId = callerOpenid

  try {
    // 1. 服务端反查课程，禁止信任前端伪造的 teacherId / courseName
    const courseRes = await db.collection('courses').doc(courseId).get()
    const course = courseRes && courseRes.data
    if (!course) {
      return { code: 1, message: '课程不存在' }
    }
    if (course.status !== 'available') {
      return { code: 1, message: '该课程已停课，暂不可申请' }
    }
    if (!course.teacherId || course.creatorRole === 'student') {
      return { code: 1, message: '该课程不支持申请加入' }
    }

    const classType = (course.classType === 'one_on_one' || course.classType === 'group')
      ? course.classType
      : (Array.isArray(course.students) && course.students.length > 1 ? 'group' : 'one_on_one')
    const allowApply = typeof course.allowApply === 'boolean' ? course.allowApply : (classType === 'group')
    if (!allowApply) {
      return { code: 1, message: '该班级暂未开放学生自主申请（一对一班由教师直接添加）' }
    }

    const currentStudents = Array.isArray(course.students) ? course.students : []
    if (currentStudents.includes(effectiveStudentId)) {
      return { code: 1, message: '您已在该班级中，无需重复申请' }
    }

    const capacity = typeof course.capacity === 'number'
      ? course.capacity
      : (classType === 'one_on_one' ? 1 : 0)
    if (capacity > 0 && currentStudents.length >= capacity) {
      return { code: 1, message: '该班级名额已满' }
    }

    // 2. 校验学生已与该教师完成绑定
    const bindingRes = await db.collection('teacher_student_bindings')
      .where({
        teacherId: course.teacherId,
        studentId: effectiveStudentId,
        status: 'approved'
      })
      .limit(1)
      .get()
    if (!bindingRes.data || bindingRes.data.length === 0) {
      return { code: 1, message: '请先与该教师完成绑定后再申请课程' }
    }

    // 3. 校验是否已有待处理申请（若集合尚未创建，自动尝试建表）
    let checkRes = { data: [] }
    try {
      checkRes = await db.collection('course_applications')
        .where({
          courseId,
          studentId: effectiveStudentId,
          status: 'pending'
        })
        .limit(1)
        .get()
    } catch (e) {
      const msg = String((e && e.message) || e)
      if (msg.includes('-502005') || msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('not exist')) {
        if (typeof db.createCollection === 'function') {
          await db.createCollection('course_applications')
        } else {
          throw e
        }
      } else {
        throw e
      }
    }
    if (checkRes.data && checkRes.data.length > 0) {
      return { code: 1, message: '您已提交过该课程申请，请耐心等待教师审核' }
    }

    // 4. 补齐学生与教师真实姓名
    const [studentUserRes, teacherUserRes] = await Promise.all([
      db.collection('users').where({ openid: effectiveStudentId }).field({ name: true }).limit(1).get(),
      db.collection('users').where({ openid: course.teacherId }).field({ name: true }).limit(1).get()
    ])
    const studentName = (studentUserRes.data && studentUserRes.data[0] && studentUserRes.data[0].name) ||
      event.studentName || '学生'
    const teacherName = course.teacherName ||
      (teacherUserRes.data && teacherUserRes.data[0] && teacherUserRes.data[0].name) ||
      event.teacherName || '教师'

    const now = new Date()
    const addRes = await db.collection('course_applications').add({
      data: {
        courseId,
        studentId: effectiveStudentId,
        studentName,
        courseName: course.name || event.courseName || '未命名课程',
        teacherId: course.teacherId,
        teacherName,
        status: 'pending',
        applyTime: now,
        createTime: now,
        updateTime: now
      }
    })

    return {
      code: 0,
      message: '申请已提交',
      data: {
        success: true,
        applicationId: addRes._id
      }
    }
  } catch (err) {
    console.error('[applyCourse] error:', err.message)
    return {
      code: 1,
      message: '申请失败',
      error: err.message
    }
  }
}
