const cloud = require('./cloud.js')

async function callFunction(name, data = {}, options = {}) {
  try {
    const res = await cloud.callFunction(name, data)
    if (res.result.code === 0) {
      return res.result.data
    } else {
      if (!options.silent) {
        console.error(`Cloud function ${name} failed:`, res.result)
        wx.showToast({
          title: (res.result.message && res.result.error) ? `${res.result.message}: ${res.result.error}` : (res.result.message || '操作失败'),
          icon: 'none'
        })
      }
      return null
    }
  } catch (err) {
    if (!options.silent) {
      console.error(`Cloud function ${name} error:`, err)
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

async function updateUserInfo(openid, name) {
  return await callFunction('updateUserInfo', { openid, name })
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
  return await callFunction('studentDetail', {
    type: 'get',
    teacherId,
    studentId
  })
}

async function saveStudentDetail(teacherId, studentId, detail) {
  return await callFunction('studentDetail', {
    type: 'save',
    teacherId,
    studentId,
    studentDetail: detail
  })
}

async function purchaseStudentHours(teacherId, studentId, amount, requestId) {
  return await callFunction('studentDetail', {
    type: 'purchaseHours',
    teacherId,
    studentId,
    amount,
    requestId
  })
}

async function adjustStudentHours(teacherId, studentId, amount, requestId) {
  return await callFunction('studentDetail', {
    type: 'adjustHours',
    teacherId,
    studentId,
    amount,
    requestId
  })
}

async function refundStudentHours(teacherId, studentId, amount, requestId) {
  return await callFunction('studentDetail', {
    type: 'refundHours',
    teacherId,
    studentId,
    amount,
    requestId
  })
}

async function addCourse(courseData) {
  return await callFunction('addCourse', courseData)
}

async function editCourse(courseId, courseData) {
  if (typeof courseId === 'object') {
    return await callFunction('editCourse', courseId)
  }
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

async function getSchedule(teacherId, options = {}) {
  const params = { teacherId }
  if (options.startDate) params.startDate = options.startDate
  if (options.endDate) params.endDate = options.endDate
  return await callFunction('getSchedule', params)
}

async function sendReminder(courseId, teacherId) {
  return await callFunction('sendReminder', { courseId, teacherId })
}

async function getCourseApplications(teacherId) {
  return await callFunction('getPendingApplications', { teacherId })
}

async function approveCourse(applicationId, teacherId) {
  return await callFunction('approveCourse', { applicationId, teacherId })
}

async function rejectCourse(applicationId, teacherId, remark = '') {
  return await callFunction('rejectCourse', { applicationId, teacherId, remark })
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

async function approveBinding(bindingId, teacherId) {
  return await callFunction('approveBinding', { bindingId, teacherId })
}

async function rejectBinding(bindingId, teacherId, remark = '') {
  return await callFunction('rejectBinding', { bindingId, teacherId, remark })
}

async function mergeStudents(teacherId, sourceStudentId, targetStudentId) {
  return await callFunction('mergeStudents', { teacherId, sourceStudentId, targetStudentId })
}

async function bindTeacher(studentId, teacherId) {
  return await callFunction('bindTeacher', { studentId, teacherId })
}

async function applyCourse(studentId, courseId, extra = {}) {
  return await callFunction('applyCourse', { studentId, courseId, ...extra })
}

async function getCourseDetail(courseId, options = {}) {
  return await callFunction('getCourseDetail', { courseId }, options)
}

async function updateClassMembers(courseId, studentIds, options = {}) {
  return await callFunction('updateClassMembers', { courseId, studentIds }, options)
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

async function generateBindCode(teacherId, teacherName = '') {
  return await callFunction('generateBindCode', { teacherId, teacherName })
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

async function getTeacherDashboard(teacherId, options = {}) {
  const params = { teacherId }
  if (options.startDate) params.startDate = options.startDate
  if (options.endDate) params.endDate = options.endDate
  return await callFunction('getTeacherDashboard', params)
}

module.exports = {
  login,
  getUserInfo,
  updateUserInfo,
  getStudents,

  addStudentByTeacher,
  getStudentDetail,
  saveStudentDetail,
  purchaseStudentHours,
  adjustStudentHours,
  refundStudentHours,
  addCourse,
  editCourse,
  deleteCourse,
  getCourses,
  getCoursesWithStats,
  getTeacherDashboard,
  getSchedule,
  sendReminder,
  getCourseApplications,
  approveCourse,
  rejectCourse,
  getBindApplications,
  getPendingBindings,
  getPendingApplications,
  approveBinding,
  rejectBinding,
  mergeStudents,
  bindTeacher,
  applyCourse,
  getCourseDetail,
  updateClassMembers,
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