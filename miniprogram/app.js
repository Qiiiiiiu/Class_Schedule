const config = require('./config.js')

App({
  onLaunch: function () {
    this.globalData = {
      env: config.ENV_ID,
      cloudInitialized: false,
      openid: null,
      userInfo: null,
      coursesCache: null,
      dashboardCache: null,
      navigateWeekStart: null,
      navigateDate: null,
      theme: 'dark' // 默认深色模式
    };

    // 读取本地存储的主题设置
    try {
      const savedTheme = wx.getStorageSync('theme');
      if (savedTheme) {
        this.globalData.theme = savedTheme;
      }
    } catch (e) {
      console.error('Failed to get theme from storage', e);
    }

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: config.ENV_ID,
        traceUser: true
      });
      this.globalData.cloudInitialized = true;
    }
  },

  setTheme(theme) {
    this.globalData.theme = theme;
    wx.setStorageSync('theme', theme);
    this.applyThemeToSystem(theme);
  },

  applyThemeToSystem(theme) {
    const isLight = theme === 'light';
    
    wx.nextTick(() => {
      // 动态调整导航栏颜色
      wx.setNavigationBarColor({
        frontColor: isLight ? '#000000' : '#ffffff',
        backgroundColor: isLight ? '#ffffff' : '#1a1a2e',
        animation: {
          duration: 150,
          timingFunc: 'easeIn'
        },
        fail: () => {}
      });

      // 动态调整 TabBar 样式
      wx.setTabBarStyle({
        color: isLight ? '#64748b' : '#666666',
        selectedColor: '#3b82f6',
        backgroundColor: isLight ? '#ffffff' : '#1a1a2e',
        borderStyle: isLight ? 'white' : 'black',
        fail: () => {}
      });

      // 动态调整窗口背景色
      wx.setBackgroundColor({
        backgroundColor: isLight ? '#f4f6f9' : '#0f1419',
        backgroundColorTop: isLight ? '#f4f6f9' : '#0f1419',
        backgroundColorBottom: isLight ? '#f4f6f9' : '#0f1419',
        fail: () => {}
      });
    });
  },

  clearCache() {
    this.globalData.coursesCache = null
    this.globalData.dashboardCache = null
  }
});