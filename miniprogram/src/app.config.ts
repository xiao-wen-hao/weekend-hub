export default defineAppConfig({
  pages: ['pages/home/index','pages/circles/index','pages/circle/index','pages/discussions/index','pages/intent/index','pages/profile/index','pages/room/index','pages/login/index','pages/create/index'],
  tabBar: {color:'#7b867d',selectedColor:'#197a3b',backgroundColor:'#fffdf9',borderStyle:'white',list:[{pagePath:'pages/home/index',text:'首页'},{pagePath:'pages/discussions/index',text:'讨论间'},{pagePath:'pages/circles/index',text:'熟人圈'},{pagePath:'pages/profile/index',text:'我的'}]},
  window: {navigationBarTitleText: '周末局', navigationBarBackgroundColor: '#f8f7f2', navigationBarTextStyle: 'black', backgroundColor: '#f8f7f2'}
})
