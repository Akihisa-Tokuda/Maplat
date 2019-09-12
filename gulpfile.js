var gulp = require('gulp'),
    execSync = require('child_process').execSync,
    spawn = require('child_process').spawn,
    concat = require('gulp-concat'),
    header = require('gulp-header'),
    zip = require('gulp-zip'),
    replace = require('gulp-replace'),
    uglify = require('gulp-uglify'),
    os = require('os'),
    fs = require('fs-extra'),
    wbBuild = require('workbox-build'),
    glob = require('glob');

var pkg = require('./package.json.old');
var pkg_tin = require('./npm/tmpl/package.json.old');
pkg_tin.version = pkg.version;
var banner = ['/**',
  ' * <%= pkg.name %> - <%= pkg.description %>',
  ' * @version v<%= pkg.version %>',
  ' * @link <%= pkg.homepage %>',
  ' * @license <%= pkg.license %>',
  ' * Copyright (c) 2015- Kohei Otsuka, Code for Nara, RekishiKokudo project',
  ' *',
  ' * Permission is hereby granted, free of charge, to any person obtaining a copy',
  ' * of this software and associated documentation files (the "Software"), to deal',
  ' * in the Software without restriction, including without limitation the rights',
  ' * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  ' * copies of the Software, and to permit persons to whom the Software is',
  ' * furnished to do so, subject to the following conditions:',
  ' *',
  ' * The above copyright notice and this permission notice shall be included in all',
  ' * copies or substantial portions of the Software.',
  ' *',
  ' * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  ' * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
  ' * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
  ' * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
  ' * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
  ' * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
  ' * SOFTWARE.',
  ' */',
  ''].join('\n');
var isWin = os.type().toString().match('Windows') !== null;

gulp.task('server', function() {
    spawn('node', ['server.js'], {
        stdio: 'ignore',
        detached: true
    }).unref();
    return Promise.resolve();
});

gulp.task('config', function() {
    return Promise.all([
        configMaker('core'),
        configMaker('ui')
    ]);
});

gulp.task('js_build_task', function() {
    var cmd = isWin ? 'r.js.cmd' : 'r.js';
    execSync(cmd + ' -o rjs_config_core.js');
    execSync(cmd + ' -o rjs_config_ui.js');
    return Promise.all([
        new Promise(function(resolve, reject) {
            gulp.src(['./lib/aigle-es5.min.js', 'dist/maplat_core_withoutpromise.js'])
                .pipe(concat('maplat_core.js'))
                .pipe(header(banner, {pkg: pkg}))
                .on('error', reject)
                .pipe(gulp.dest('./dist/'))
                .on('end', resolve);
        }),
        new Promise(function(resolve, reject) {
            gulp.src(['./lib/aigle-es5.min.js', 'dist/maplat_withoutpromise.js'])
                .pipe(concat('maplat.js'))
                .pipe(header(banner, {pkg: pkg}))
                .on('error', reject)
                .pipe(gulp.dest('./dist/'))
                .on('end', resolve);
        })
    ]).then(function() {
        fs.unlinkSync('./dist/maplat_withoutpromise.js');
        fs.unlinkSync('./dist/maplat_core_withoutpromise.js');
    });
});

gulp.task('js_build', gulp.series('config', 'js_build_task'));

gulp.task('less', function() {
    var lesses = ['ol-maplat', 'font-awesome', 'bootstrap', 'swiper', 'core', 'ui', 'iziToast'];
    lesses.map(function(less) {
        execSync('lessc -x less/' + less + '.less > css/' + less + '.css');
    });
    return Promise.resolve();
});

gulp.task('css_build_task', function() {
    var cmd = isWin ? 'r.js.cmd' : 'r.js';
    execSync(cmd + ' -o cssIn=css/core.css out=dist/maplat_core.css');
    execSync(cmd + ' -o cssIn=css/ui.css out=dist/maplat.css');
    return Promise.resolve();
});

gulp.task('css_build', gulp.series('less', 'css_build_task'));

gulp.task('mobile_build', gulp.series('js_build', 'css_build', 'mobile_build_task'));

gulp.task('sw_build', function() {
    return wbBuild.generateSW({
        globDirectory: '.',
        globPatterns: [
            '.',
            'dist/maplat.js',
            'dist/maplat.css',
            'parts/*',
            'locales/*/*',
            'fonts/*'
        ],
        swDest: 'service-worker_.js',
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [{
            urlPattern: /(?:maps\/.+\.json|pwa\/.+|pois\/.+\.json|apps\/.+\.json|tmbs\/.+_menu\.jpg|img\/.+\.(?:png|jpg))$/,
            handler: 'staleWhileRevalidate',
            options: {
                cacheName: 'resourcesCache',
                expiration: {
                    maxAgeSeconds: 60 * 60 * 24,
                },
            },
        }],
    }).then(function() {
        var unixtime = new Date();
        return new Promise(function(resolve, reject) {
            gulp.src(['./service-worker_.js'])
                .pipe(concat('service-worker.js'))
                .pipe(replace(/self\.__precacheManifest = \[/, "self.__precacheManifest = [\n  {\n    \"url\": \".\",\n    \"revision\": \"" + unixtime + "\"\n  },"))
                .on('error', reject)
                .pipe(gulp.dest('./'))
                .on('end', resolve);
        });
    }).then(function() {
        fs.unlinkSync('./service-worker_.js');
    });
});

gulp.task('build_task', function() {
    try {
        fs.removeSync('./example.zip');
    } catch (e) {
    }
    try {
        fs.removeSync('./example');
    } catch (e) {
    }

    fs.ensureDirSync('./example');
    fs.copySync('./dist', './example/dist');
    fs.copySync('./locales', './example/locales');
    fs.copySync('./parts', './example/parts');
    fs.copySync('./fonts', './example/fonts');
    fs.copySync('./apps/example_sample.json', './example/apps/sample.json');
    fs.copySync('./maps/morioka.json', './example/maps/morioka.json');
    fs.copySync('./maps/morioka_ndl.json', './example/maps/morioka_ndl.json');
    fs.copySync('./tiles/morioka', './example/tiles/morioka');
    fs.copySync('./tiles/morioka_ndl', './example/tiles/morioka_ndl');
    fs.copySync('./tmbs/morioka_menu.jpg', './example/tmbs/morioka_menu.jpg');
    fs.copySync('./tmbs/morioka_ndl_menu.jpg', './example/tmbs/morioka_ndl_menu.jpg');
    fs.copySync('./tmbs/osm_menu.jpg', './example/tmbs/osm_menu.jpg');
    fs.copySync('./tmbs/gsi_menu.jpg', './example/tmbs/gsi_menu.jpg');
    fs.copySync('./img/houonji.jpg', './example/img/houonji.jpg');
    fs.copySync('./img/ishiwari_zakura.jpg', './example/img/ishiwari_zakura.jpg');
    fs.copySync('./img/mitsuishi_jinja.jpg', './example/img/mitsuishi_jinja.jpg');
    fs.copySync('./img/moriokaginko.jpg', './example/img/moriokaginko.jpg');
    fs.copySync('./img/moriokajo.jpg', './example/img/moriokajo.jpg');
    fs.copySync('./img/sakurayama_jinja.jpg', './example/img/sakurayama_jinja.jpg');
    fs.copySync('./example.html', './example/index.html');

    return new Promise(function(resolve, reject) {
        gulp.src(['./example/*', './example/*/*', './example/*/*/*', './example/*/*/*/*', './example/*/*/*/*/*'])
            .pipe(zip('example.zip'))
            .on('error', reject)
            .pipe(gulp.dest('./'))
            .on('end', resolve);
    }).then(function() {
        fs.removeSync('./example');
    });
});

gulp.task('build', gulp.series('mobile_build', 'sw_build', 'build_task'));

var configMaker = function(name) {
    var out = name == 'ui' ? '' : name + '_';
    return Promise.all([
        new Promise(function(resolve, reject) {
            gulp.src(['./js/polyfill.js', './js/config.js', './js/loader.js'])
                .pipe(concat('config_' + name + '.js'))
                .pipe(replace(/\s+name:[^\n]+,\r?\n+\s+out:[^\n]+,\r?\n\s+include:[^\n]+,/, ''))
                .pipe(replace(/\{app\}/, name))
                .pipe(replace(/\{name\}/, name))
                .on('error', reject)
                .pipe(gulp.dest('./js/'))
                .on('end', resolve);
        }),
        new Promise(function(resolve, reject) {
            gulp.src(['./js/config.js'])
                .pipe(concat('rjs_config_' + name + '.js'))
                .pipe(replace(/\{name\}/g, name))
                .pipe(replace(/\{out\}/, out))
                .on('error', reject)
                .pipe(gulp.dest('./'))
                .on('end', resolve);
        })
    ]);
};
