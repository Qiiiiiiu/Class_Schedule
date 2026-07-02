const cloud = require('./cloud.js')

async function callFunction(name, data = {}, options = {}) {
  try {
    const res = await cloud.callFunction(name, data)
    if (res.result.code === 0) {
      return res.result.data
    } else {
      if (!options.silent) {
        wx.showToast({
          title: res.result.message || '操作失败',
          icon: 'none'
        })
      }
      return null
    }
  } catch (err) {
    console.error(`Cloud function ${name} error:`, err)
    if (!options.silent) {
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      })
    }
    return null
  }
}

async function login() {
  return await callFunction('login')
}

async function getUserInfo(openid) {
  return await callFunction('getUserInfo', { openid })
}

async function getStudents(teacherId) {
  return await callFunction('getStudents', { teacherId })
}

async function addStudentByTeacher(teacherId, name, nativePlace, grade, subject, remark) {
  return await callFunction('addStudentByTeacher', { 
    teacherId, 
    studentName: name, 
    studentPhone: '',
    nativePlace, 
    grade, 
    subject, 
    remark 
  })
}

async function getStudentDetail(teacherId, studentId) {
  try {
    const res = await cloud.callFunction('studentDetail', {
      type: 'get',
      teacherId,
      studentId
    })
    return res.result
  } catch (err) {
    console.error('getStudentDetail error:', err)
    return null
  }
}

async function saveStudentDetail(teacherId, studentId, detail) {
  try {
    const res = await cloud.callFunction('studentDetail', {
      type: 'save',
      teacherId,
      studentId,
      studentDetail: detail
    })
    return res.result
  } catch (err) {
    console.error('saveStudentDetail error:', err)
    return null
  }
}

async function addCourse(courseData) {
  return await callFunction('addCourse', courseData)
}

async function editCourse(courseId, courseData) {
  return await callFunction('editCourse', { courseId, ...courseData })
}

async function deleteCourse(courseId, teacherId) {
  return await callFunction('deleteCourse', {
    courseId,
    teacherId
  })
}

async function updateCourseStatus(courseId, status) {
  return await callFunction('updateCourseStatus', {
    courseId,
    status
  })
}

async function getCourses(teacherId) {
  return await callFunction('getCourses', { teacherId })
}

async function getSchedule(teacherId) {
  return await callFunction('getSchedule', { teacherId })
}

async function sendReminder(courseId, teacherId) {
  return await callFunction('sendReminder', { courseId, teacherId })
}

async function getCourseApplications(teacherId) {
  return await callFunction('getPendingApplications', { teacherId })
}

async function handleCourseApplication(applicationId, status) {
  return await callFunction('handleCourseApplication', { applicationId, status })
}

async function getBindApplications(teacherId) {
  return await callFunction('getPendingBindings', { teacherId })
}

async function getPendingBindings(teacherId) {
  return await callFunction('getPendingBindings', { teacherId })
}

async function getPendingApplications(teacherId) {
  return await callFunction('getPendingApplications', { teacherId })
}

async function handleBindApplication(applicationId, status) {
  return await callFunction('handleBindApplication', { applicationId, status })
}

async function bindTeacher(studentId, teacherId) {
  return await callFunction('bindTeacher', { studentId, teacherId })
}

async function applyCourse(studentId, courseId) {
  return await callFunction('applyCourse', { studentId, courseId })
}

async function getTeachers(studentId) {
  return await callFunction('getTeachers', { studentId })
}

async function getMyCourses(studentId) {
  return await callFunction('getMyCourses', { studentId })
}

async function getMyApplications(studentId) {
  return await callFunction('getMyApplications', { studentId })
}

async function bindStudent(teacherId, studentId) {
  return await callFunction('bindStudent', { teacherId, studentId })
}

async function getStudentCourses(studentId, teacherId) {
  return await callFunction('getStudentCourses', { studentId, teacherId })
}

async function deleteStudent(teacherId, studentId) {
  return await callFunction('deleteStudent', { teacherId, studentId })
}

async function getStudentSchedules(studentId) {
  return await callFunction('getStudentSchedules', { studentId })
}

async function getCourseSchedules(parentId) {
  return await callFunction('getCourseSchedules', { parentId })
}

async function editCourseSchedule(id, data) {
  return await callFunction('editCourseSchedule', { id, data })
}

async function deleteCourseSchedule(id) {
  return await callFunction('deleteCourseSchedule', { id })
}

async function addCourseSchedule(scheduleData) {
  return await callFunction('addCourseSchedule', scheduleData)
}

async function generateBindCode(teacherId) {
  return await callFunction('generateBindCode', { teacherId })
}

async function verifyBindCode(studentId, studentName, verifyCode) {
  return await callFunction('verifyBindCode', { studentId, studentName, verifyCode })
}

async function subscribeCourse(scheduleId, studentId) {
  return await callFunction('subscribeCourse', { action: 'subscribe', scheduleId, studentId })
}

async function unsubscribeCourse(scheduleId, studentId) {
  return await callFunction('subscribeCourse', { action: 'unsubscribe', scheduleId, studentId })
}

async function getSubscriptionStatus(scheduleId, studentId) {
  return await callFunction('subscribeCourse', { action: 'getSubscriptionStatus', scheduleId, studentId })
}

async function clearTeacherReminderMarks(teacherId) {
  return await callFunction('clearTeacherReminderMarks', { teacherId })
}

async function getCoursesWithStats(teacherId) {
  return await callFunction('getCoursesWithStats', { teacherId })
}

async function getTeacherDashboard(teacherId) {
  return await callFunction('getTeacherDashboard', { teacherId })
}

module.exports = {
  login,
  getUserInfo,
  getStudents,

  addStudentByTeacher,
  getStudentDetail,
  saveStudentDetail,
  addCourse,
  editCourse,
  deleteCourse,
  getCourses,
  getCoursesWithStats,
  getTeacherDashboard,
  getSchedule,
  sendReminder,
  getCourseApplications,
  handleCourseApplication,
  getBindApplications,
  getPendingBindings,
  getPendingApplications,
  handleBindApplication,
  bindTeacher,
  applyCourse,
  getTeachers,
  getMyCourses,
  getMyApplications,
  bindStudent,
  getStudentCourses,
  deleteStudent,
  getStudentSchedules,
  getCourseSchedules,
  editCourseSchedule,
  deleteCourseSchedule,
  addCourseSchedule,
  generateBindCode,
  verifyBindCode,
  subscribeCourse,
  unsubscribeCourse,
  updateCourseStatus,
  getSubscriptionStatus,
  clearTeacherReminderMarks,
  callFunction
}