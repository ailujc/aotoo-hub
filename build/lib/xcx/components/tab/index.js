/**
 * 作者： 天天修改
 * github: webkixi
 * 小程序的模板真是又长又臭
 */
const app = getApp()
const Core = require('../aotoo/core')
const lib = Core.lib

function grabData(dataSource) {
  let ds = dataSource
  ds.select = ds.select ? ds.select : 0
  const _menus = []
  const _contents = []
  if (lib.isObject(dataSource) && lib.isArray(dataSource.data)) {
    dataSource.data.forEach((item, ii) => {
      if (item.title && item.content) {
        if (lib.isString(item.title)) {
          item.title = {title: item.title}
        }
        _menus.push({
          title: item.title,
          tap: 'tabIndex?idx='+ii,
          itemClass: ds.select == ii ? 'active' : ''
        })
        _contents.push(item.content)
      }
    })
  }

  const menus = {
    data: _menus,
    listClass: 'menu-box',
    itemClass: 'menu-item'
  }

  const contents = {
    $$id: '__mytabcontent',
    data: _contents,
    type: {
      is: 'swiper',
      current: 0
    },
    listClass: 'content-box',
    itemClass: 'content-item'
  }
  return {menus, contents}
}

/**
 * data: [
 *  {title: 'tabName', content: 'some content'},
 *  {title: 'tabName', content: 'some content'},
 *  {title: 'tabName', content: 'some content'},
 *  {title: 'tabName', content: 'some content'},
 * ],
 * $$id: 'some id',
 * select: 0,
 * multipy: false,
 * singleView: false,
 * show: true
 */

// 基于item的组件
Component({
  options: {
    multipleSlots: true, // 在组件定义时的选项中启用多slot支持
    addGlobalClass: true
  },
  properties: {
    dataSource: Object,
  },
  data: {
    $dataSource: {},
    $menus: {},
    $contents: {}
  },
  behaviors: [Core.baseBehavior(app, 'tap')],
  lifetimes: {
    created: function () {
      this.generateUpdate('$dataSource', function() {
        const $dataSource = this.data.$dataSource
        const {menus, contents} = grabData($dataSource)
        this.setData({
          $menus: menus,
          $contents: contents
        })
      })
    },
    attached: function() { //节点树完成，可以用setData渲染节点，但无法操作节点
      let properties = this.properties
      let dataSource = properties.dataSource
      const {menus, contents} = grabData(dataSource)
      this.setData({
        $dataSource: dataSource,
        $menus: menus,
        $contents: contents
      })
    },
    ready: function() {
      const ds = this.data.$dataSource
      this.mount((ds.$$id || ds.id))
    }
  },
  methods: {
    tabIndex: function(e, param) {
      if (param) {
        const idx = parseInt(param['idx'])
        const $menus = this.data.$menus
        $menus.data = $menus.data.map((item, ii) => {
          if (item.itemClass) item.itemClass = ''
          if (ii==idx) item.itemClass = 'active'
          return item
        })

        this.setData({ 
          $menus,
          '$contents.type.current': idx
        })
      }
    }
  }
})