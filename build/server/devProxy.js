const co = require('co')
const fs = require('fs')
const fse = require('fs-extra')
const globby = require('globby')
const chalk = require('chalk')
const _ = require('lodash')
const path = require('path')
const nodemon = require('nodemon')
const webpack = require('webpack')
const mkdirp = require('mkdirp')
const sleep = require('../util/sleep')
const portOccupied = require('../util/portOccupied')
const validPort = require('../util/validPort')
const fillupMapfile = require('../util/fillupMapfile3ds')
const generateServerConfigsFile = require('../util/generateServerConfigsFile')
const log = console.log

const WebpackDevServer = require('webpack-dev-server')

const browserSync = require('../util/openBrowser')

function* generateBabelCfgFile(distserver) {
  const DISTSERVER = distserver
  const path_babelrc = path.join(DISTSERVER, '../.babelrc')
  
  const content_babelrc_path = path.join(__dirname, '../lib/babelrc')
  const content_babelrc = fs.readFileSync(content_babelrc_path, 'utf-8')

  return new Promise( (res, rej)=>{
    if (!fs.existsSync(DISTSERVER)) {
      mkdirp.sync(DISTSERVER)
      fs.writeFileSync(path_babelrc, content_babelrc, 'utf-8')
      return res(true)
    } else {
      if (fs.existsSync(path_babelrc)) {
        fs.unlinkSync(path_babelrc)
      }
      fs.writeFileSync(path_babelrc, content_babelrc, 'utf-8')
      return res(true)
    }
  })
}

// 启动node端服务
function* startupNodeServer(options) {
  let cmd_start
  const { SRC, DIST, argv, isDev, name } = options
  const path_dir_server = path.join(SRC, 'server')
  const path_dir_configs = path.join(SRC, 'configs')
  const path_server_index = path.join(SRC, 'server/index.js')

  if (fs.existsSync(path_server_index)) {
    if (isDev) {
      cmd_start = `node ${path_server_index}`
      const serverName = name || 'node'
      
      const nmStart = nodemon({
        "execMap": {
          "js": cmd_start
        },
        "script": path_server_index,
        "stdout": true,
        "ext": 'js json jsx css html md',
        "restartable": "rs",
        "verbose": true,
        "ignore": [
          ".git/*",
          "*.db"
        ],
        "watch": [
          path_dir_server + '/*',
          path_dir_configs + '/*'
        ],
      });
  
      nmStart.on('start', function () {
        console.log(serverName,'========= 服务端启动完成 ============');
      })
  
      .on('restart', function (files) {
        console.log('========== 正在重启服务端 ===========');
      })
  
      .on('quit', function () {
        console.log('========= 服务端退出 ============');
        process.exit();
      })
    } else {
      require(path_server_index)
    }
  }
}

// 获取有效的proxyport端口
function* getValidProxyPort(port) {
  const portUsed = yield portOccupied(port)
  if (portUsed) {
    port += 30
    return yield checkProxyPortOccupied(port)
  } else {
    return { valid: port }
  }
}



function* browserOpen(name, port, micro, isXcx) {
  if (!isXcx && !micro) {
    browserSync.browserOpen({
      name: name,
      PORT: port
    })
  }
}


function* wpDevProxyerer(compiler, asset) {
  let { name, contentBase, host, port, proxyPort, SRC, DIST } = asset

  // const validProxyPort = yield getValidProxyPort(proxyPort)
  const validProxyPort = yield validPort(proxyPort)
  proxyPort = validProxyPort.validPort

  const devS = new WebpackDevServer(compiler, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
    },
    compress: true,
    noInfo: false,
    overlay: {
      warnings: true,
      errors: true
    },
    // contentBase: contentBase,
    // publicPath: '/',
    hot: true,
    inline: true,
    historyApiFallback: true,
    disableHostCheck: true,
    staticOptions: {
      redirect: false
    },
    clientLogLevel: 'info',
    writeToDisk: true,
    // progress: true,
    stats: {
      assets: false,
      cached: false,
      cachedAssets: false,
      children: false,
      chunks: false,
      chunkModules: false,
      chunkOrigins: false,
      colors: true,
      errors: true,
      errorDetails: true,
      depth: false,
      entrypoints: true,
      excludeAssets: /app\/assets/,
      hash: true,
      maxModules: 15,
      modules: false,
      performance: true,
      reasons: false,
      source: false,
      timings: true,
      version: false,
      warnings: true,
    },
    host: host || '0.0.0.0',
    // watchContentBase: true,
    // startup: true
    proxy: {
      '*': {
        target: 'http://localhost:' + port,
        secure: false,
        changeOrigin: true
      }
    },
  })

  devS.listen(proxyPort, 'localhost', function (err, result) {
    if (err) console.log(err);
    // log(chalk.red.bold(`【${port}】`)) // 控制台输出信息
  })
}

function* wpProductionDone(compiler, asset) {
  return new Promise((res, rej) => {
    compiler.run((err, stats) => {
      if (err) {
        console.error(err.stack || err);
        if (err.details) {
          console.error(err.details);
        }
        return;
      }

      const info = stats.toJson();

      if (stats.hasErrors()) {
        console.error(info.errors);
      }

      if (stats.hasWarnings()) {
        console.warn(info.warnings);
      }

      console.log('=============== 编译完成 =============');
      return res(stats)

    })
  })
}

function* selectConfig(asset, ifStart) {
  let { TYPE, name, contentBase, isDev, host, port, proxyPort, SRC, DIST, argv, onlynode } = asset
  
  let DISTSERVER = path.join(SRC, 'server')
  let starts = argv.start ? argv.start !== true ? [].concat(argv.start) : false : false
  let path_config_file = path.join(DISTSERVER, 'configs.js')
  if ((starts && starts.length && starts.indexOf(name) > -1) || onlynode) {
    return asset
  }

  if (ifStart) {  //非hooks传入，检测是否只是启动node
    if (starts && starts.length) {
      ifStart = true
      let oldConfig = require(path_config_file)
      if (typeof oldConfig == 'function') {
        oldConfig = oldConfig()
      }
      asset = _.merge({}, asset, oldConfig, {PORT: (argv.port||oldConfig.PORT)})
      DIST = asset.DIST
      process.env.NODE_ENV = asset.isDev ? 'development' : 'production'
    } else {
      ifStart = false
    }
  }

  const path_mapfile = path.join(DIST, 'mapfile.json')
  // yield fillupMapfile(asset)
  yield generateBabelCfgFile(DISTSERVER)
  yield sleep(500, '==========  babel配置文件写入完成  ===========')
  yield generateServerConfigsFile(DISTSERVER, path_mapfile, path_config_file, asset)
  yield sleep(500, '=========  server端的configs文件写入完成  ===============')
  // return yield asset
  return asset
}

const names = []
module.exports = function* myProxy(compilerConfig, asset) {
  asset = yield selectConfig(asset, true)
  const { TYPE, name, contentBase, isDev, host, port, proxyPort, SRC, DIST, argv, onlynode, micro } = asset
  const isXcx = (TYPE == 'mp' || TYPE == 'ali')
  const starts = argv.start ? argv.start !== true ? [].concat(argv.start) : false : false
  if ((starts && starts.length && starts.indexOf(name) > -1) || onlynode) {
    yield startupNodeServer(asset)
    if (isDev) {
      yield browserOpen(asset.name, asset.PORT, micro, isXcx)
    }
  } else {
    const DISTSERVER = path.join(SRC, 'server')
    const compiler = webpack(compilerConfig)
    compiler.hooks.done.tap('start-node-server', stats => {
      if (names.indexOf(name) == -1) {
        names.push(name)
        co(function* () {
          yield selectConfig(asset)
          if (isDev && !argv.onlybuild) {
            yield startupNodeServer(asset)
            yield browserOpen(asset.name, asset.proxyPort, micro, isXcx)
          }
        })
      }
    })
    if (isDev) {
      if (argv.onlybuild) {
        compiler.run((err, state)=>{
          if (err) { console.log(err); }
        })
      } else {
        yield wpDevProxyerer(compiler, asset)
      }
    } else {
      yield wpProductionDone(compiler, asset)
    }
  }
}