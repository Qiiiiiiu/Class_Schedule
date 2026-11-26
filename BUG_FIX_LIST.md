# Bug 修改清单（v1）

> 基线：`master` @ `ac8debd` + 当前工作区未提交改动（35 个文件已修改）
> 生成时间：2026-11-26
> **修复进度（2026-11-27）**：已完成 **Batch A / B / C / D 全部 33 项代码修复**（含核查阶段额外发现的高危提权、空桩云函数、事务 SDK 违规等缺陷），70 个 JS 文件语法校验、`app.json` 16 页 1:1 匹配、配置收口核查及核心单测全部通过。待完成事项：云函数重新部署、本地执行 `git rm --cached project.private.config.json .vscode/settings.json` 及微信开发者工具端到端手测回归（见第 4 节）。

---

## 0. 级别与统计

| 级别 | 定义 | 数量 |
|---|---|---|
| **P0** | 功能完全不可用、数据丢失/错账、可被越权操作 | 13 |
| **P1** | 功能表现错误、状态不刷新、有明显误导 | 13 |
| **P2** | 死代码、配置/仓库卫生、低危隐患 | 7 |
| 合计 | | **33** |

预估总工时：**P0 约 5–7 人天，P1 约 4–6 人天，P2 约 1 人天**（不含联调与回归）。

---

## 1. 总览

| 编号 | 级别 | 模块 | 标题 | 预估 |
|---|---|---|---|---|
| BUG-01 | P0 | 教师·绑定 | 「通过/拒绝」按钮调用未定义的 API，点击必报错 | 0.5h |
| BUG-02 | P0 | 教师·学生 | 「合并学生」调用未定义的 API，点击必报错 | 0.5h |
| BUG-03 | P0 | 选课申请 | 申请链路整条断开：无提交通道、页面未注册、无审批入口 | 2–3d |
| BUG-04 | P0 | 我的信息 | 「退出登录」无效，退出后立刻自动重新登录 | 0.5h |
| BUG-05 | P0 | 提醒 | 选「不提醒」仍会收到提醒（0 被 `\|\|` 吞掉） | 0.5h |
| BUG-06 | P0 | 提醒 | cron 日期二次加 8 小时，16:00 后查询窗口错位、晚间课漏提醒 | 1–2h |
| BUG-07 | P0 | 提醒/学生 | 课程结束即物理删除 `course_unfinished`，学生周课表历史消失 | 1–2d |
| BUG-08 | P0 | 课程编辑 | 编辑课程会删光并重建子课，订阅与提醒标记丢失 | 1d |
| BUG-09 | P0 | 教师·课表 | 周课表「发送提醒」传子课 id，必然「课程不存在」 | 0.5h |
| BUG-10 | P0 | 教师·课程 | 提醒实际失败仍提示「提醒已发送」 | 0.5h |
| BUG-11 | P0 | 课时 | 购买/调整/退费读改写无事务，并发或重复点击会错账 | 1d |
| BUG-12 | P0 | 订阅 | 订阅数组「读-改-写」并发丢订阅 | 0.5h |
| BUG-13 | P0 | 权限 | 删除/改状态类接口无归属校验，可越权删他人课程 | 1d |
| BUG-14 | P1 | 教师·绑定 | 教师手动添加的学生（unbound）被显示为「已拒绝」 | 0.5h |
| BUG-15 | P1 | 主题 | 学生端 6 个页面未接入主题，切浅色不生效 | 0.5h |
| BUG-16 | P1 | 学生·首页 | 「上课中/已结束」状态不随时间刷新 | 1h |
| BUG-17 | P1 | 学生·我的课程 | 周视图 key 用 `Math.random()`，每次渲染全量重建节点 | 0.5h |
| BUG-18 | P1 | 教师·学生 | 搜索把列表覆盖成子集；清空搜索又重复请求 | 1h |
| BUG-19 | P1 | 教师·课程管理 | 「班级管理」显示硬编码假数据（3 个班 / 2 个活跃） | 0.5h |
| BUG-20 | P1 | 仪表盘 | `getTeacherDashboard` 查询字段不存在，且首页未使用该接口 | 2h |
| BUG-21 | P1 | 提醒 | 修改上课时间后不重置提醒标记，改期后不再提醒 | 0.5h |
| BUG-22 | P1 | 提醒 | 额度从不校验；「订阅」按钮可无限刷额度并重置全部提醒标记 | 1h |
| BUG-23 | P1 | 提醒 | cron 批量取数无排序/游标，超 100 条时长期饿死 | 1h |
| BUG-24 | P1 | 申请审批 | 审批可重复执行，`students` 数组重复 push | 0.5h |
| BUG-25 | P1 | 学生·课程详情 | 缺 `schedule` 的脏数据直接抛错，只提示「加载失败」 | 0.5h |
| BUG-26 | P1 | 登录守卫 | tab 页用 `navigateTo` 跳登录，快速点击会堆叠页面 | 0.5h |
| BUG-27 | P2 | 数据模型 | 学生自建课 `teacherId` 固定为 `'custom_teacher'` | 1d |
| BUG-28 | P2 | 路由 | 4 个页面未注册到 `app.json`（含学生申请页） | 0.5h |
| BUG-29 | P2 | 前端 API 层 | 两个 helper 指向不存在的云函数（死代码，误用即报错） | 0.5h |
| BUG-30 | P2 | 配置 | envId/模板 ID 多处硬编码；`wx.cloud.init` 可能被调两次 | 1h |
| BUG-31 | P2 | 日志 | 提醒函数数十条 `console.log` 打印完整业务 JSON | 1h |
| BUG-32 | P2 | 仓库 | 无 `.gitignore`；`.vscode`、私有配置入库；35 个改动未提交 | 0.5h |
| BUG-33 | P2 | 部署 | `uploadCloudFunction.sh` 仍是 quickstart 模板，只部署模板函数 | 0.5h |

---

## 2. 明细

### BUG-01 [P0] 绑定审核按钮调用未定义的 API

- **模块**：教师端 → 学生绑定审核
- **现象**：点击「通过」或「拒绝」直接抛 `TypeError: api.approveBinding is not a function`，审核功能完全不可用（云函数 `approveBinding` / `rejectBinding` 其实是好的）。
- **证据**：
  - 调用处：[bindings/index.js:94](miniprogram/pages/teacher/bindings/index.js#L94)、[bindings/index.js:112](miniprogram/pages/teacher/bindings/index.js#L112)
  - 定义处：[api.js:253-300](miniprogram/utils/api.js#L253-L300) 的导出里没有 `approveBinding` / `rejectBinding`
- **根因**：前端 API 层漏封装；`api.js` 里还留着一个指向不存在云函数的 `handleBindApplication`。
- **建议**：在 `api.js` 中补 `approveBinding(bindingId, teacherId)`、`rejectBinding(bindingId, teacherId, remark)`，分别调用同名云函数；顺手删掉 `handleBindApplication`。
- **验收**：待审核列表点「通过」→ 状态变「已绑定」；点「拒绝」填原因 → 状态变「已拒绝」且原因入库。
- **注意**：`rejectBinding` 云函数接受的参数需与前端传参对齐（先确认是否要 `remark`）。

---

### BUG-02 [P0] 「合并学生」调用未定义的 API

- **模块**：教师端 → 学生管理 → 合并
- **现象**：选好源/目标学生点确认后报 `api.mergeStudents is not a function`；`mergeStudents` 云函数已实现且用了事务，但前端接不上。
- **证据**：[students/index.js:258](miniprogram/pages/teacher/students/index.js#L258)；[api.js:253-300](miniprogram/utils/api.js#L253-L300) 无该导出
- **建议**：补 `mergeStudents(teacherId, sourceId, targetId)`；合并成功后同时清 `app.clearCache()` 并刷新列表。
- **验收**：合并后源学生消失、课程转到目标学生、课时日志保留。

---

### BUG-03 [P0] 选课申请链路整条断开

- **模块**：学生申请 / 教师审批
- **现象**（三个断点，缺一不可）：
  1. **没有入口**：全仓库没有任何页面调用 `api.applyCourse`，学生无法提交申请 → `course_applications` 永远为空；
  2. **页面未注册**：`pages/student/applications/index` 不在 `app.json` 的 `pages` 里，无法打开；
  3. **审批无页面**：教师首页点「待处理申请」跳到 `/pages/teacher/courses/index?tab=applications`，但课程页 `onLoad` 不读 `options`，也没有申请 tab。
- **证据**：
  - [api.js:170-172](miniprogram/utils/api.js#L170-L172)（仅定义，无调用方）
  - [app.json:2-18](miniprogram/app.json#L2-L18)（无 applications 页）
  - [home/index.js:457-468](miniprogram/pages/teacher/home/index.js#L457-L468) + [courses/index.js:11-18](miniprogram/pages/teacher/courses/index.js#L11-L18)
- **影响**：`course_applications` 永远不会有数据，教师端「待处理申请」恒为 0；学生没有申请入口，申请页即使注册也没有数据可展示。
- **建议**（二选一，先定产品口径再动手）：
  - A. 补全：课程详情页加「申请上课」按钮 → 调 `applyCourse`；新增教师端申请列表（或在课程页加 tab）；`app.json` 注册学生申请页；
  - B. 砍掉：如果产品决定不做申请制（教师直接加学生），就删除相关页面、云函数、首页入口，避免「看起来有但用不了」。
- **验收**：学生提交申请 → 教师首页待处理数 +1 → 教师通过 → 学生出现在该课程 `students` 中且课表可见。

---

### BUG-04 [P0] 「退出登录」无效

- **模块**：我的信息 → 退出登录
- **现象**：点「确定」后确实回到登录页，但 1 秒后自动登录成功并回到首页，用户无法真正退出。
- **证据**：
  - [my-info/index.js:126-140](miniprogram/pages/common/my-info/index.js#L126-L140)：仅清空 `globalData` 后 `navigateTo` 登录页
  - [login/index.js:118-153](miniprogram/pages/common/login/index.js#L118-L153)：`onLoad` 无条件自动 `api.login()` + `getUserInfo()`，查到用户就 `redirectToHome()`
- **根因**：登录态没落任何「主动退出」标记，登录页把「本地无 openid」当成「未登录」，但 openid 是云函数从微信上下文拿的，永远能拿到。
- **建议**：退出时写 `wx.setStorageSync('loggedOut', true)`；登录页 `onLoad` 先读该标记，存在则跳过自动登录、显示注册/登录表单，登录成功后清除标记。同时退出建议用 `wx.reLaunch` 回登录页，避免页面栈残留。
- **验收**：退出后停在登录表单，不自动跳首页；重新输入姓名登录可回到对应角色首页；杀进程重进仍是未登录态。

---

### BUG-05 [P0] 选「不提醒」仍然会收到提醒

- **模块**：提醒任务
- **现象**：课程/日程里提醒时间选了「不提醒」（值 0），到点仍会按 15 分钟提前量发订阅消息。
- **证据**：[sendReminder/index.js:161](cloudfunctions/sendReminder/index.js#L161)
  ```js
  const reminderMinutes = schedule.reminderTime || course.reminderTime || 15
  ```
  `0` 是合法业务值，但被 `||` 当成空值。
- **建议**：改成显式判空（`!= null` / `Number.isFinite`），并约定「0 = 不提醒」时直接跳过发送；`reminderOptions` 的 0 也要能被正确写入（当前写入是正确的，问题只在读取）。
- **验收**：两门课分别设「不提醒」与「提前 15 分钟」，只有后者在开课前 15 分钟收到提醒。

---

### BUG-06 [P0] cron 日期被加了两次 8 小时，晚间课程漏提醒

- **模块**：提醒任务（定时触发）
- **现象**：北京时间 16:00 之后，定时任务的查询日期窗口整体前移一天，查到的是「明天~后天」的课；当天晚上的课不会触发提醒，也不会被清理。上午的课表现正常，所以问题很隐蔽。
- **证据**：
  - [sendReminder/index.js:53-70](cloudfunctions/sendReminder/index.js#L53-L70)：`nowBeijing = Date.now() + 8h`，`today = new Date(nowBeijing)`
  - [sendReminder/index.js:303-310](cloudfunctions/sendReminder/index.js#L303-L310)：`formatDate` 内部又 `+8h` 后取 UTC 日期
  - 两条路径不一致：手动提醒用 `formatDate(new Date())`（只加一次），定时用 `formatDate(new Date(nowBeijing))`（加两次）
- **建议**：抽一个 `utils/time.js`，全部用「指定时区（Asia/Shanghai）→ YYYY-MM-DD」的单一路径；`handleCronTrigger` 直接 `formatDate(new Date())`，不要再预加偏移；补一条单测覆盖 00:00 / 09:00 / 16:30 / 23:59 四个时点。
- **验收**：把服务器时间 mock 到北京时间 22:00，窗口应是「今天~明天」，且当晚 22:30 的课能被扫描到。

---

### BUG-07 [P0] 课程结束后记录被物理删除，学生周课表历史消失

- **模块**：提醒任务 / 学生我的课程
- **现象**：一门课上完（超过结束时间）后，`course_unfinished` 记录被直接 `remove()`；学生端「周课表」正是从该集合读数据，于是历史课程/已上课程从课表里消失（列表 tab 因为读 `courses` 还在）。
- **证据**：
  - 删除：[sendReminder/index.js:135-140](cloudfunctions/sendReminder/index.js#L135-L140)（以及 L119/L145/L155 的异常分支也删）
  - 读取：[getStudentSchedules/index.js:43-51](cloudfunctions/getStudentSchedules/index.js#L43-L51)
- **附带问题**：`course_unfinished` 承担了三种职责（待上课程池、订阅者容器、提醒状态），一旦定时任务某天没跑成功或被批次截断，窗口外的过期记录不会再被清理，集合只增不减。
- **建议**（可先做最小改动）：把「课程结束后删除」改为「标记 `status: 'finished'`」，学生端查询保留历史；另起一个低频清理任务按 `schedule.date < today - N` 归档/删除；长期建议拆表（课程实例 / 订阅 / 提醒状态）。
- **验收**：上完一门课后刷新学生周课表，课程仍显示为「已结束」；连续一周后集合条数不持续增长。

---

### BUG-08 [P0] 编辑课程会删光并重建全部子课，订阅与提醒标记丢失

- **模块**：课程编辑（教师端 / 学生端）
- **现象**：任何一次编辑（哪怕只改教室）都会 `remove()` 该课程下所有 `course_schedule` 与 `course_unfinished`，然后按新日期重建。结果：学生已订阅的提醒全部丢失、`teacherReminderSent` 全部丢失、学生课时/签到类字段（如果后续加）也会丢；中途失败则只剩父课程，子课全没了。
- **证据**：[editCourse/index.js:35-88](cloudfunctions/editCourse/index.js#L35-L88)；学生端编辑入口 [detail.js:215-235](miniprogram/pages/student/courses/detail.js#L215-L235)
- **建议**：改为「按日期 diff」：保留日期未变的记录（只更新时间/教室/提醒时间，同时重置该条 `teacherReminderSent`），仅新增新日期、删除被取消的日期；整个操作放进事务。
- **验收**：编辑只改教室 → 子课 id 不变、`subscribers` 不变；改日期 → 对应旧记录删除、新记录创建，其他记录不受影响。

---

### BUG-09 [P0] 周课表「发送提醒」传的是子课 id，必然失败

- **模块**：教师端 → 课表 → 课程详情
- **现象**：在课表里点某节课的「发送提醒」，提示「课程不存在」。
- **证据**：
  - [schedule/index.js:397](miniprogram/pages/teacher/schedule/index.js#L397) 传 `course._id`（`course_schedule` 的 id）
  - [sendReminder/index.js:350](cloudfunctions/sendReminder/index.js#L350) 用 `db.collection('courses').doc(courseId).get()` 按父课程查
- **建议**：课表页改传 `course.parentId`（无则取 `course._id`），或让 `sendReminder` 支持「子课 id」入参（先按子课查 parentId 再走原逻辑）。
- **验收**：课表里对某节课点提醒，教师收到订阅消息且提示成功。

---

### BUG-10 [P0] 提醒实际失败仍提示「提醒已发送」

- **模块**：教师端 → 课程管理 → 发送提醒
- **现象**：订阅授权过期（43101）或对方未授权时，云函数返回 `code: 0` + `teacherSuccess: false` + `message: '教师端订阅消息授权已过期，请重新授权'`，但前端只要拿到对象就弹「提醒已发送」。
- **证据**：
  - [sendReminder/index.js:518-533](cloudfunctions/sendReminder/index.js#L518-L533) 返回结构
  - [courses/index.js:188-198](miniprogram/pages/teacher/courses/index.js#L188-L198) 未检查 `teacherSuccess` / `message`
- **建议**：前端按 `teacherSuccess` 与 `message` 分支提示（失败弹模态引导去「重新订阅」）；或后端在失败时返回 `code: 1`。
- **验收**：把模板授权清掉后点提醒，应提示授权过期而不是「已发送」。

---

### BUG-11 [P0] 课时购买/调整/退费无事务，会错账

- **模块**：教师端 → 学生详情 → 课时
- **现象**：先读 `purchasedHours/remainingHours`，在内存里算，再整体写回。并发操作或弱网重复点击会互相覆盖（典型的 lost update）；`hourLogs` 与余额也可能对不上。
- **证据**：[studentDetail/index.js:60-160](cloudfunctions/studentDetail/index.js#L60-L160)（purchase / adjust / refund 三段都是同一模式）
- **建议**：改为原子更新 `remainingHours: _.inc(amount)` + 条件校验（退款时 `where({ remainingHours: _.gte(amount) })`），或放进 `db.runTransaction`；前端加按钮防抖（`loading` 已在，但云函数层仍要防重）。
- **验收**：模拟同时发起 2 次 +10 课时，最终余额 +20；重复点击只生效一次（可用请求幂等键）。

---

### BUG-12 [P0] 订阅数组「读-改-写」会丢订阅

- **模块**：学生端 → 订阅上课提醒
- **证据**：[subscribeCourse/index.js:55-75](cloudfunctions/subscribeCourse/index.js#L55-L75)：`subscribers.push(...)` 后整体写回
- **建议**：改为 `subscribers: _.addToSet(studentId)`；取消订阅用 `_.pull(studentId)`。
- **验收**：两个学生同时订阅同一节课，最终 `subscribers` 包含两人。

---

### BUG-13 [P0] 删除/改状态类接口没有归属校验（可越权）

- **模块**：云函数权限
- **现象**：以下接口只校验参数存在，不校验「这门课是不是你的」：
  - [deleteCourse/index.js:22](cloudfunctions/deleteCourse/index.js#L22)：`teacherId` 只用于参数判空，实际删除不看归属
  - [updateCourseStatus/index.js:27-32](cloudfunctions/updateCourseStatus/index.js#L27-L32)：只传 `courseId`，直接改
  - [deleteCourseSchedule/index.js:19-20](cloudfunctions/deleteCourseSchedule/index.js#L19-L20)：只传 `id`
  - [clearTeacherReminderMarks/index.js:24-31](cloudfunctions/clearTeacherReminderMarks/index.js#L24-L31)：任意人可给任意 teacherId 加额度
- **影响**：虽然前端 UI 做了「自建课程才显示删除」，但接口可被直接调用（改 AppData / 写个脚本），能删掉别人的课；也解释了 `studentDetail(save)` 可改任意学生资料。
- **建议**：云函数内统一 `const { OPENID } = cloud.getWXContext()`，查用户角色 + 资源 `teacherId/createdBy` 是否匹配再执行。这条与「统一鉴权」一起做，成本最低。
- **验收**：用 A 教师的身份调用删除 B 教师的课程 → 返回 `code: 1, message: '无权限'`。

---

### BUG-14 [P1] 教师手动添加的学生（unbound）显示为「已拒绝」

- **模块**：教师端 → 绑定审核
- **现象**：通过「添加学生」录入的学生状态是 `unbound`，在绑定审核页被归到「已拒绝」tab，并显示「已拒绝」。
- **证据**：
  - [getStudents/index.js:27](cloudfunctions/getStudents/index.js#L27) 返回 `pending/approved/rejected/unbound`
  - [bindings/index.js:61-75](miniprogram/pages/teacher/bindings/index.js#L61-L75)：`else` 分支统一当拒绝处理，`statusStr` 也把 else 映射成「已拒绝」
- **建议**：显式处理 `unbound`（单独文案「未绑定/待学生确认」，或直接不进审核页），不要用 `else` 兜底。
- **验收**：教师手动添加的学生不出现在「已拒绝」列表里。

---

### BUG-15 [P1] 学生端主题切换不生效

- **模块**：学生端全部页面
- **现象**：在「我的信息」切到浅色后，教师端变浅色，学生端（首页/我的课程/课程详情/教师信息/添加课程/申请）仍是深色。
- **证据**：
  - 学生页根节点是 `<view class="container">`，没有 `{{theme}}`：[home/index.wxml:1](miniprogram/pages/student/home/index.wxml#L1)、[my-courses/index.wxml:1](miniprogram/pages/student/my-courses/index.wxml#L1)、[courses/detail.wxml:1](miniprogram/pages/student/courses/detail.wxml#L1)、[teachers/index.wxml:1](miniprogram/pages/student/teachers/index.wxml#L1)
  - 学生页 JS 的 `onShow` 也不 `setData({ theme })`
- **建议**：学生页统一加 `theme` 数据 + 根节点 `{{theme}}`；或做一个 `themeBehavior`（behavior 复用）注入到所有页面，避免再漏。
- **验收**：切换主题后，学生端 6 个页面同步变浅色，导航栏/TabBar 颜色一致。

---

### BUG-16 [P1] 今日课程状态不随时间刷新

- **模块**：学生端 → 首页
- **现象**：页面停留时，「上课中/已结束」的状态一直停留在进入页面那一刻；9:59 进入页面，10:00 开始上课也不会变「上课中」。
- **证据**：[student/home/index.js:44-56](miniprogram/pages/student/home/index.js#L44-L56) 只在 `onShow` 里算一次 `currentTime`；[L113-L119](miniprogram/pages/student/home/index.js#L113-L119) 用它与课程时间比较
- **建议**：加一个只在首页存活期间运行的 `setInterval`（30s/60s 刷新一次，`onHide`/`onUnload` 清理）；或改用 `wx.nextTick` + 下拉刷新提示。
- **验收**：停留跨过上课时间点，状态自动从「待上课」变为「上课中」。

---

### BUG-17 [P1] 周视图 `courseKey` 用随机数，导致全量重建

- **模块**：学生端 → 我的课程 → 周课表
- **现象**：每次 `setData` 都生成新的 key，列表项被当作全新节点重建，滚动时闪烁、长列表卡顿。
- **证据**：[my-courses/index.js:210](miniprogram/pages/student/my-courses/index.js#L210)：`courseKey: \`${course._id || course.scheduleId}_${dayIndex}_${Math.random()}\``
- **建议**：用稳定的 `${_id}_${dayIndex}`（同一条记录同一天天然唯一）。
- **验收**：切换周/刷新后节点不重建（可在开发者工具 Elements 面板观察）。

---

### BUG-18 [P1] 搜索覆盖列表 + 清空搜索重复请求

- **模块**：教师端 → 学生管理
- **现象**：输入关键字后 `students` 被替换成过滤结果，继续输入只在已过滤的子集里搜（越搜越少）；清空搜索时又调一次云函数。
- **证据**：[students/index.js:77-99](miniprogram/pages/teacher/students/index.js#L77-L99)
- **建议**：保留 `allStudents` 原始数据，搜索只写 `filteredStudents` 并渲染它；清空时从内存恢复，不重新请求。
- **验收**：输入→清空→再输入，结果始终基于全量数据；清空不产生网络请求。

---

### BUG-19 [P1] 「班级管理」展示硬编码假数据

- **模块**：教师端 → 课程管理
- **现象**：页面上「班级数 3 / 本周活跃 2」是写死的，与真实数据无关；点进去提示「开发中」。
- **证据**：[management/index.js:12-13](miniprogram/pages/teacher/management/index.js#L12-L13)
- **建议**：短期把这两项隐藏或标注「即将上线」，避免用户误信；中长期实现班级模型后再展示。
- **验收**：页面不再出现与真实数据无关的数字。

---

### BUG-20 [P1] `getTeacherDashboard` 查询字段不存在且未被使用

- **模块**：云函数 / 教师首页
- **现象**：该函数把学生数查成 `users.where({ teacherId, role:'student' })`，但 `users` 表没有 `teacherId` 字段 → 恒为 0；`pendingApplications` 直接返回空数组。同时首页根本没用它，而是并发打 5 个接口。
- **证据**：[getTeacherDashboard/index.js:52-87](cloudfunctions/getTeacherDashboard/index.js#L52-L87)；调用方 [home/index.js:97-129](miniprogram/pages/teacher/home/index.js#L97-L129) 用的是 `getStudents/getCourses/getPendingBindings/getPendingApplications/getSchedule`
- **建议**：要么修好并作为首页唯一数据源（服务端聚合 count），要么删掉避免误导；不建议两个都留着。
- **验收**：首页一次请求拿到统计与待处理；学生数/课程数与列表页一致。

---

### BUG-21 [P1] 改期后不重置提醒标记，改期后不再提醒

- **模块**：课表 → 编辑单节课
- **现象**：一节课的提醒已经发过（`teacherReminderSent: true`），教师把上课时间改到第二天，定时任务看到标记为 true 就跳过，教师再也收不到提醒。
- **证据**：[editCourseSchedule/index.js:41-58](cloudfunctions/editCourseSchedule/index.js#L41-L58) 只更新 `schedule.*`，不清标记
- **建议**：当 `date` / `startTime` 变化时，同时把对应 `course_unfinished.teacherReminderSent` 置回 `false`（若有学生订阅，`subscribers` 保留即可）。
- **验收**：先触发提醒 → 改时间到未来 → 新时间点能再次收到提醒。

---

### BUG-22 [P1] 提醒额度形同虚设，且可被无限刷

- **模块**：提醒 / 额度
- **现象**：
  - 发送前从不检查 `reminderQuota > 0`，只是每次成功发送后 `_.inc(-1)`，可以减成负数；
  - 「重新订阅」按钮每点一次就让额度 +1，并把该教师**所有**课程的 `teacherReminderSent` 清回 false（[clearTeacherReminderMarks](cloudfunctions/clearTeacherReminderMarks/index.js#L24-L31)），用户反复点会反复收到提醒；
  - 该接口无鉴权，任意人可给任意教师刷额度。
- **证据**：发送与扣减 [sendReminder/index.js:266-280](cloudfunctions/sendReminder/index.js#L266-L280)；重置 [courses/index.js:200-254](miniprogram/pages/teacher/courses/index.js#L200-L254)
- **建议**：先明确额度业务规则（是否要限额、额度怎么获得）；若保留，发送前校验、扣减与发送放同一事务、重置只针对「未来且未发送」的课程，接口加身份校验。
- **验收**：额度为 0 时不发送并提示；连续点 3 次「重新订阅」不会造成重复提醒。

---

### BUG-23 [P1] cron 批量取数无排序/游标，超 100 条会饿死

- **模块**：提醒任务
- **现象**：`.limit(batchSize)`（默认 100）没有 `orderBy`、没有游标推进，一次只处理 100 条；同一批记录可能被反复取到，其余记录长期处理不到。
- **证据**：[sendReminder/index.js:73-78](cloudfunctions/sendReminder/index.js#L73-L78)
- **建议**：按「提醒时间/开课时间」排序 + 用上一轮最后一条的时间做 `>` 游标；或按小时分片；并在返回值里给出 `hasMore` 让定时器串联。
- **验收**：造 150 条待提醒记录，两轮内全部处理完。

---

### BUG-24 [P1] 审批可重复执行，`students` 数组重复 push

- **模块**：课程申请审批
- **现象**：`approveCourse` 不校验申请状态，也不去重，重复点「通过」会把同一学生多次写进 `courses.students`；已拒绝的申请也能再通过。
- **证据**：[approveCourse/index.js:30-42](cloudfunctions/approveCourse/index.js#L30-L42)
- **建议**：先校验 `status === 'pending'`；`students` 用 `_.addToSet`；审批与状态更新放事务。
- **验收**：同一条申请点两次通过，`students` 只出现一次。

---

### BUG-25 [P1] 课程详情对脏数据直接抛错

- **模块**：学生端 → 课程详情
- **现象**：若某条课程缺少 `schedule` 字段，`course.schedule.classroom` / `startTime` 直接抛错，页面只显示「加载失败」，没有降级展示。
- **证据**：[detail.js:63-73](miniprogram/pages/student/courses/detail.js#L63-L73)
- **建议**：`const s = course.schedule || {}` 后再取字段；加载失败时给出「返回/重试」而不是空白。
- **验收**：手工造一条无 `schedule` 的记录，详情页正常显示空值而不是整页失败。

---

### BUG-26 [P1] tab 页用 `navigateTo` 跳登录，可能堆叠页面

- **模块**：登录守卫
- **现象**：`checkLogin` 在 tab 页里 `navigateTo` 登录页，1.5 秒延迟内连续触发会压入多个登录页；退出登录也用 `navigateTo`，返回时仍回到已登录的 tab 页。
- **证据**：[checkRole.js:3-17](miniprogram/utils/checkRole.js#L3-L17)；[my-info/index.js:134-136](miniprogram/pages/common/my-info/index.js#L134-L136)
- **建议**：统一用 `wx.reLaunch`，并加「跳转中」防重锁。
- **验收**：快速触发 3 次，只进入一次登录页。

---

### BUG-27 [P2] 学生自建课程 `teacherId` 固定为 `'custom_teacher'`

- **模块**：数据模型
- **现象**：学生自建课把 `teacherId` 写死成字符串 `custom_teacher`（[add.js:239](miniprogram/pages/student/courses/add.js#L239)、[detail.js:191](miniprogram/pages/student/courses/detail.js#L191)）。教师端按自己的 openid 查课，永远看不到这些课；统计、收入、课时都覆盖不到；`users` 里也不存在这个 id。
- **建议**：`teacherId` 置空并用 `createdBy/creatorRole` 表达来源，或建一个真实的自建课归属字段；教师端如需展示学生自建课，按 `students` 关联查询。
- **验收**：移除魔法字符串后，学生自建课仍能在学生端完整显示与编辑。

---

### BUG-28 [P2] 4 个页面未注册到 `app.json`

- **现象与证据**：`app.json` 只注册了 15 个页面（[app.json:2-18](miniprogram/app.json#L2-L18)），但目录里还有：
  - `pages/index/index`（quickstart 首页）
  - `pages/example/index`（quickstart 示例）
  - `pages/admin/migrate/index`（无鉴权的迁移页）
  - `pages/student/applications/index`（学生申请页，**功能页，属于 BUG-03 的一部分**）
- **建议**：前三个直接删；学生申请页按 BUG-03 的方案决定保留并注册或一起删。
- **验收**：`app.json` 与目录一一对应，无孤儿页面。

---

### BUG-29 [P2] 两个 API helper 指向不存在的云函数

- **现象**：`handleBindApplication` / `handleCourseApplication` 调用的云函数在 `cloudfunctions/` 下不存在（实际是 `approveBinding` / `rejectBinding` / `approveCourse` / `rejectCourse`）。
- **证据**：[api.js:146-164](miniprogram/utils/api.js#L146-L164)
- **建议**：删除这两个 helper；如果后续要用，按云函数真实名字重新封装。
- **验收**：全局搜索无 `handleBindApplication` / `handleCourseApplication`。

---

### BUG-30 [P2] 配置硬编码且不一致，`wx.cloud.init` 可能被调两次

- **现象**：
  - 环境 ID 在 [app.js:4](miniprogram/app.js#L4) 与 [wxBroker.js:15](miniprogram/utils/wxBroker.js#L15) 各写一份；
  - `app.js` 已 `wx.cloud.init`，`wxBroker.init()` 又 init 一次（两者都没有幂等判断，控制台可能告警）；
  - 订阅消息模板 ID 在 [sendReminder/index.js:10](cloudfunctions/sendReminder/index.js#L10) 与 [courses/index.js:203](miniprogram/pages/teacher/courses/index.js#L203) 各写一份；
  - 基础库版本 `project.config.json`（2.20.1）与 `project.private.config.json`（3.15.2）不一致。
- **建议**：抽 `miniprogram/config.js`（env、模板 ID）与云函数侧环境变量；`wxBroker` 复用 `app.js` 的初始化结果；统一基础库版本为当前稳定版。
- **验收**：全局搜索环境 ID / 模板 ID 各只剩一处；控制台无重复 init 告警。

---

### BUG-31 [P2] 日志打印完整业务 JSON

- **现象**：`sendReminder` 有 30+ 条 `console.log`，其中包含 `JSON.stringify(scheduleRes.data)`、课程详情、学生名单等；`studentDetail` 还会打印学生资料。既占日志费用，也有隐私风险。
- **证据**：[sendReminder/index.js:59-209](cloudfunctions/sendReminder/index.js#L59-L209)、[studentDetail/index.js:11](cloudfunctions/studentDetail/index.js#L11)
- **建议**：生产只保留 `warn/error` + 关键 id（courseId/scheduleId/openid 脱敏）；调试日志用开关控制。
- **验收**：一次定时任务执行只产生少量结构化日志，无完整记录体。

---

### BUG-32 [P2] 仓库卫生

- **现象**：无 `.gitignore`；`.vscode/settings.json` 与 `project.private.config.json` 已入库；当前工作区 35 个文件已修改、3 个未跟踪未提交。
- **证据**：`git status --short`、`git ls-files`
- **建议**：补 `.gitignore`（`node_modules/`、`project.private.config.json`、`*.log`、`.DS_Store`）；把私有配置移出版本库；现有改动按功能拆成小提交。
- **验收**：`git status` 干净；新克隆仓库不含私有配置。

---

### BUG-33 [P2] 部署脚本仍是 quickstart 模板

- **现象**：[uploadCloudFunction.sh:1](uploadCloudFunction.sh#L1) 只部署 `quickstartFunctions`，项目真实云函数一个都不会上传；脚本里 `${installPath}` / `${envId}` / `${projectPath}` 也未定义。
- **建议**：改成遍历 `cloudfunctions/` 目录部署，或改用云开发 CLI / 控制台批量上传；在 README 写清部署步骤。
- **验收**：执行脚本后 42 个函数状态与本地一致。

---

## 3. 分批修复计划

### Batch A —— 纯前端接线/低风险改动（建议今天做，约 4–6h）
`BUG-01`、`BUG-02`、`BUG-04`、`BUG-09`、`BUG-10`、`BUG-14`、`BUG-15`、`BUG-16`、`BUG-17`、`BUG-18`、`BUG-19`、`BUG-28`、`BUG-29`

> 特点：只改前端或补一个函数封装，不动数据、不涉及迁移；修完立刻能演示。

### Batch B —— 后端逻辑与数据正确性（本周，约 2–3 人天）
`BUG-05`、`BUG-06`、`BUG-08`、`BUG-11`、`BUG-12`、`BUG-21`、`BUG-23`、`BUG-24`、`BUG-25`

> 建议先写「时区工具 + 提醒时间窗」单测，再动 `sendReminder`；`BUG-08` 动到删除逻辑，务必先在测试环境备份数据。

### Batch C —— 数据模型与安全（需要评审后再动，约 1–2 人天 + 回归）
`BUG-03`（先定产品口径）、`BUG-07`（先定历史保留策略）、`BUG-13`（与统一鉴权一起做）、`BUG-20`、`BUG-22`、`BUG-27`、`BUG-30`

### Batch D —— 清理（可并行，约 0.5 人天）
`BUG-31`、`BUG-32`、`BUG-33`

---

## 4. 回归测试清单（每次发版前手测）

- [ ] 教师登录 → 首页统计/月历/收入显示正常，待处理数与列表页一致
- [ ] 学生扫码/验证码绑定 → 教师审核通过/拒绝 → 状态与文案正确（含 unbound 场景）
- [ ] 教师新建单次课、重复课、批量加日期 → 课表出现对应节次
- [ ] 学生看到新课 → 订阅提醒 → 取消订阅 → 状态正确
- [ ] 教师改期（只改教室 / 改日期）→ 学生订阅不丢、新时间能提醒
- [ ] 提醒：设「不提醒」的课不发送；提前 15 分钟的课在正确时刻只发送一次
- [ ] 课时：购买 +10、手动 -2、退款 -3 → 余额与日志一致；重复点击不重复扣
- [ ] 退出登录 → 停在登录页；重新登录 → 回到原角色首页
- [ ] 主题切换 → 教师端、学生端全部页面同步
- [ ] 学生首页停留跨过上课时间点 → 状态自动从「待上课」变「上课中」

---

## 5. 附：已核实「不是 bug」的项（避免误改）

- **订阅状态显示**：`selectedCourse.subscribed` 的数据来自 `course_unfinished`（含 `subscribers`），周课表视图里取数正确，不属于 bug。
- **`wx:key="courseKey"`**：属性名本身没问题，问题只在 key 值用了随机数（已列 BUG-17）。
- **`getSchedule` 只返回 `status: 'available'`**：与「停课」语义一致，暂按预期行为处理（但 `updateCourseStatus` 目前前端没有入口，见 BUG-28/附录）。

---

## 附录 A：本轮新发现（相对上一轮评估）

- BUG-04 退出登录无效、BUG-06 日期二次偏移、BUG-09 子课 id 传参、BUG-15 学生端主题缺失、BUG-21 改期不重置标记、BUG-24 审批重复 push —— 均为本轮代码定位后新增。

## 附录 B：无法静态确认，需人工验证（不计入 33 条）

1. **云数据库集合权限与索引**：需在控制台核对（`courses`、`course_schedule`、`teacher_student_bindings` 等的读写权限；`teacherId + schedule.date + status` 等复合索引是否存在）。
2. **定时触发器是否已部署**：`cloudfunctions/sendReminder/config.json` 里配了 `0 */5 * * * *`，但触发器需要单独上传才生效；需在控制台确认当前环境真实状态。
3. **订阅消息模板字段**：`thing5/date4/date9/time6` 是否与模板 `w223WKtyfXebjCpkNc2TbtczBuGuR4SUk2IRbMcRreU` 的字段定义一致（不一致会报 47003）。
4. **`_.elemMatch(_.eq(studentId))` 在字符串数组上的匹配行为**：`getMyCourses` / `getStudentSchedules` 用了这种写法，建议用真实数据回归一次，必要时改成 `_.in([studentId])` 或 `students: studentId`。

---

*文档结束。所有条目均已在源码中定位；修复时请逐条更新状态并附回归结果。*
