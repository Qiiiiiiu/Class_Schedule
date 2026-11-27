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
    this.applyThemeToSystem(theme, true);
  },

  applyThemeToSystem(theme, force = false) {
    const targetTheme = theme === 'light' ? 'light' : 'dark';
    const isLight = targetTheme === 'light';

    const pages = getCurrentPages();
    const curPage = pages && pages.length > 0 ? pages[pages.length - 1] : null;
    const prevPageTheme = (curPage && curPage.__appliedSystemTheme) || 'dark';
    const prevTabTheme = this._appliedTabBarTheme || 'dark';

    // 仅在页面实际需要变更时同步导航栏与窗口底色（避免每次切 Tab 重复重绘闪屏）
    if (force || prevPageTheme !== targetTheme) {
      if (curPage) {
        curPage.__appliedSystemTheme = targetTheme;
      }

      wx.setNavigationBarColor({
        frontColor: isLight ? '#000000' : '#ffffff',
        backgroundColor: isLight ? '#ffffff' : '#1a1a2e',
        animation: {
          duration: 0,
          timingFunc: 'linear'
        },
        fail: () => {}
      });

      wx.setBackgroundColor({
        backgroundColor: isLight ? '#f4f6f9' : '#0f1419',
        backgroundColorTop: isLight ? '#f4f6f9' : '#0f1419',
        backgroundColorBottom: isLight ? '#f4f6f9' : '#0f1419',
        fail: () => {}
      });
    }

    // 仅在 TabBar 主题发生变化时更新 TabBar 样式
    if (force || prevTabTheme !== targetTheme) {
      this._appliedTabBarTheme = targetTheme;
      wx.setTabBarStyle({
        color: isLight ? '#64748b' : '#666666',
        selectedColor: '#3b82f6',
        backgroundColor: isLight ? '#ffffff' : '#1a1a2e',
        borderStyle: isLight ? 'white' : 'black',
        fail: () => {}
      });
    }
  },

  clearCache() {
    this.globalData.coursesCache = null
    this.globalData.dashboardCache = null
  }
});