Page({
  data: {
    loading: false,
    progress: 0,
    totalAdded: 0,
    totalSkipped: 0,
    log: [],
    finished: false
  },

  async onLoad() {
    // 检查是否是管理员
    const app = getApp()
    const userInfo = app.globalData.userInfo
    if (!userInfo || userInfo.role !== 'teacher') {
      wx.showToast({
        title: '无权限访问',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  async startMigrate() {
    if (this.data.loading) return

    this.setData({
      loading: true,
      progress: 0,
      totalAdded: 0,
      totalSkipped: 0,
      log: ['开始迁移...'],
      finished: false
    })

    let offset = 0
    const batchSize = 50
    let finished = false

    while (!finished) {
      try {
        const res = await wx.cloud.callFunction({
          name: 'migrateToUnfinished',
          data: {
            batchSize,
            offset
          }
        })

        const result = res.result

        if (result.code !== 0) {
          this.addLog(`错误: ${result.message}`)
          break
        }

        if (result.data.finished) {
          finished = true
        }

        offset = result.data.nextOffset
        const added = this.data.totalAdded + result.data.addedCount
        const skipped = this.data.totalSkipped + result.data.skippedCount

        this.addLog(`批次完成: 新增 ${result.data.addedCount}, 跳过 ${result.data.skippedCount}`)

        this.setData({
          totalAdded: added,
          totalSkipped: skipped,
          finished: result.data.finished
        })

        // 小延迟避免请求过快
        if (!finished) {
          await this.sleep(500)
        }
      } catch (err) {
        this.addLog(`调用失败: ${err.message}`)
        break
      }
    }

    this.setData({
      loading: false
    })

    if (finished) {
      this.addLog('迁移完成!')
      wx.showToast({
        title: '迁移完成',
        icon: 'success'
      })
    }
  },

  addLog(message) {
    const log = this.data.log
    const time = new Date().toLocaleTimeString()
    log.push(`[${time}] ${message}`)
    this.setData({ log })
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
})
