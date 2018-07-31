define(['ol3', 'turf'], function(ol, turf) {
    // Direct transforamation between 2 projection
    ol.proj.transformDirect = function(xy, src, dist) {
        if (!dist) {
            dist = src;
            src = xy;
            xy = null;
        }
        var srcCode = src.getCode ? src.getCode() : src;
        var distCode = dist.getCode ? dist.getCode() : dist;
        var func = ol.proj.getTransform(src, dist);
        if (func == ol.proj.identityTransform && srcCode != distCode) {
            var srcFunc = ol.proj.getTransform(src, 'EPSG:3857');
            var distFunc = ol.proj.getTransform('EPSG:3857', dist);
            if (srcFunc == ol.proj.identityTransform && srcCode != 'EPSG:3857')
                throw 'Transform of Source projection is not defined.';
            if (distFunc == ol.proj.identityTransform && distCode != 'EPSG:3857')
                throw 'Transform of Distination projection is not defined.';
            func = function(xy) {
                return ol.proj.transform(ol.proj.transform(xy, src, 'EPSG:3857'), 'EPSG:3857', dist);
            };
            var invFunc = function(xy) {
                return ol.proj.transform(ol.proj.transform(xy, dist, 'EPSG:3857'), 'EPSG:3857', src);
            };
            ol.proj.addCoordinateTransforms(src, dist, func, invFunc);
        }

        if (xy) return func(xy);
    };

    ol.View.prototype.getDecimalZoom = function() {
        var offset;
        var resolution = this.getResolution();

        offset = Math.log(this.maxResolution_ / resolution) / Math.log(2);
        return offset !== undefined ? this.minZoom_ + offset : offset;
    };

    ol.const = ol.const ? ol.const : {};
    ol.const.MERC_MAX = 20037508.342789244;
    ol.const.MERC_CROSSMATRIX = [
        [0.0, 0.0],
        [0.0, 1.0],
        [1.0, 0.0],
        [0.0, -1.0],
        [-1.0, 0.0]
    ];

    var gpsStyle = new ol.style.Style({
        image: new ol.style.Icon(({
            anchor: [0.5, 0.5],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            src: 'parts/bluedot.png'
        }))
    });
    var accCircleStyle = new ol.style.Style({
        fill: new ol.style.Fill({
            color: [128, 128, 256, 0.2]
        }),
        stroke: new ol.style.Stroke({
            color: [128, 128, 256, 1.0],
            width: 3
        })
    });
    var markerDefaultStyle = new ol.style.Style({
        image: new ol.style.Icon(({
            anchor: [0.5, 1.0],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            src: 'parts/defaultpin.png'
        }))
    });
    var t = function(arg) { return arg; };

    ol.source.setCustomFunction = function(target) {
        target.prototype.getMap = function() {
            return this._map;
        };

        // 経緯度lnglat、メルカトルズームmercZoom、地図ズームzoom、方角direction、地図回転rotation等を指定し地図移動
        target.prototype.moveTo = function(cond) {
            var self = this;
            var merc;
            var mercZoom = cond.mercZoom;
            var zoom = cond.zoom;
            var direction = cond.direction;
            var rotate = cond.rotate;
            var map = this._map;
            var view = map.getView();
            if (cond.latitude != null && cond.longitude != null) {
                merc = ol.proj.transform([cond.longitude, cond.latitude], 'EPSG:4326', 'EPSG:3857');
            }
            self.size2MercsAsync().then(function(mercs){
                return self.mercs2MercSizeAsync(mercs);
            }).then(function(mercSize) {
                var mercs = self.mercsFromGivenMercZoom(merc || mercSize[0], mercZoom || mercSize[1],
                    direction != null ? direction : mercSize[2]);
                self.mercs2SizeAsync(mercs).then(function(size) {
                    if (merc != null) {
                        view.setCenter(size[0]);
                    }
                    if (mercZoom != null) {
                        view.setZoom(size[1]);
                    } else if (zoom != null) {
                        view.setZoom(zoom);
                    }
                    if (direction != null) {
                        view.setRotation(size[2]);
                    } else if (rotate != null) {
                        view.setRotation(rotate);
                    }
                });
            });
        };

        target.prototype.goHome = function() {
            this.moveTo({
                longitude: this.home_position[0],
                latitude: this.home_position[1],
                mercZoom: this.merc_zoom,
                rotate: 0
            });
        };

        target.prototype.setGPSMarkerAsync = function(position, ignoreMove) {
            var self = this;
            var map = self.getMap();
            var view = map.getView();
            var mercs = position ? self.mercsFromGPSValue(position.lnglat, position.acc) : ['dummy'];

            return Promise.all(mercs.map(function(merc, index) {
                if (index == 5 || merc == 'dummy') return merc;
                return self.merc2XyAsync(merc);
            })).then(function(xys) {
                var pos = null;
                if (xys[0] != 'dummy') {
                    pos = {xy: xys[0]};
                    if (!self.insideCheckHistMapCoords(xys[0])) {
                        map.handleGPS(false, true);
                        return false;
                    }
                    var news = xys.slice(1);

                    pos.rad = news.reduce(function(prev, curr, index) {
                        var ret = prev + Math.sqrt(Math.pow(curr[0] - pos.xy[0], 2) + Math.pow(curr[1] - pos.xy[1], 2));
                        return index == 3 ? ret / 4.0 : ret;
                    }, 0);
                    if (!ignoreMove) view.setCenter(pos.xy);
                }
                map.setGPSPosition(pos);
                return true;
            }).catch(function(err) { throw err; });
        };

        target.prototype.setGPSMarker = function(position, ignoreMove) {
            this.setGPSMarkerAsync(position, ignoreMove).then(function() {});
        };

        // size(画面サイズ)とズームから、地図面座標上での半径を得る。zoom無指定の場合は自動取得
        target.prototype.getRadius = function(size, zoom) {
            var radius = Math.floor(Math.min(size[0], size[1]) / 4);
            if (zoom == null) {
                zoom = this._map.getView().getDecimalZoom();
            }
            return radius * ol.const.MERC_MAX / 128 / Math.pow(2, zoom);
        };

        // メルカトルの中心座標とメルカトルズームから、メルカトル5座標値に変換
        target.prototype.mercsFromGivenMercZoom = function(center, mercZoom, direction) {
            if (mercZoom == null) {
                mercZoom = 17;
            }
            var size = this._map.getSize();
            var pixel = Math.floor(Math.min(size[0], size[1]) / 4);

            var delta = pixel * ol.const.MERC_MAX / 128 / Math.pow(2, mercZoom);
            var crossDelta = this.rotateMatrix(ol.const.MERC_CROSSMATRIX, direction);
            return crossDelta.map(function(xy) {
                return [xy[0]*delta+center[0], xy[1]*delta+center[1]];
            });
        };

        target.prototype.mercsFromGPSValue = function(lnglat, acc) {
            var merc = ol.proj.transform(lnglat, 'EPSG:4326', 'EPSG:3857');
            var latrad = lnglat[1] * Math.PI / 180;
            var delta = acc / Math.cos(latrad);
            return ol.const.MERC_CROSSMATRIX.map(function(xy) {
                return [xy[0]*delta+merc[0], xy[1]*delta+merc[1]];
            });
        };

        // 与えられた差分行列を回転。theta無指定の場合は自動取得
        target.prototype.rotateMatrix = function(xys, theta) {
            if (theta == null) {
                theta = 1.0 * this._map.getView().getRotation();
            }
            var result = [];
            for (var i=0; i<xys.length; i++) {
                var xy = xys[i];
                var x = xy[0] * Math.cos(theta) - xy[1] * Math.sin(theta);
                var y = xy[0] * Math.sin(theta) + xy[1] * Math.cos(theta);
                result.push([x, y]);
            }
            return result;
        };

        // 画面サイズと地図ズームから、地図面座標上での5座標を取得する。zoom, rotate無指定の場合は自動取得
        target.prototype.size2Xys = function(center, zoom, rotate) {
            if (!center) {
                center = this._map.getView().getCenter();
            }
            var size = this._map.getSize();
            var radius = this.getRadius(size, zoom);
            var crossDelta = this.rotateMatrix(ol.const.MERC_CROSSMATRIX, rotate);
            var cross = crossDelta.map(function(xy) {
                return [xy[0]*radius+center[0], xy[1]*radius+center[1]];
            });
            cross.push(size);
            return cross;
        };

        // 画面サイズと地図ズームから、メルカトル座標上での5座標を取得する。zoom, rotate無指定の場合は自動取得
        target.prototype.size2MercsAsync = function(center, zoom, rotate) {
            var cross = this.size2Xys(center, zoom, rotate);
            var self = this;
            var promises = cross.map(function(val, index) {
                if (index == 5) return val;
                return self.xy2MercAsync(val);
            });
            return Promise.all(promises).catch(function(err) { throw err; });
        };

        // メルカトル5地点情報から地図サイズ情報（中心座標、サイズ、回転）を得る
        target.prototype.mercs2SizeAsync = function(mercs, asMerc) {
            var self = this;
            var promises = asMerc ? Promise.resolve(mercs) :
                Promise.all(mercs.map(function(merc, index) {
                    if (index == 5) return merc;
                    return self.merc2XyAsync(merc);
                }));
            return promises.then(function(xys) {
                return self.xys2Size(xys);
            }).catch(function(err) { throw err; });
        };

        // メルカトル5地点情報からメルカトル地図でのサイズ情報（中心座標、サイズ、回転）を得る
        target.prototype.mercs2MercSizeAsync = function(mercs) {
            return this.mercs2SizeAsync(mercs, true);
        };

        // 地図座標5地点情報から地図サイズ情報（中心座標、サイズ、回転）を得る
        target.prototype.xys2Size = function(xys) {
            var center = xys[0];
            var size = xys[5];
            var nesw = xys.slice(1, 5);
            var neswDelta = nesw.map(function(val) {
                return [val[0] - center[0], val[1] - center[1]];
            });
            var normal = [[0.0, 1.0], [1.0, 0.0], [0.0, -1.0], [-1.0, 0.0]];
            var abss = 0;
            var cosx = 0;
            var sinx = 0;
            for (var i = 0; i < 4; i++) {
                var delta = neswDelta[i];
                var norm = normal[i];
                var abs = Math.sqrt(Math.pow(delta[0], 2) + Math.pow(delta[1], 2));
                abss += abs;
                var outer = delta[0] * norm[1] - delta[1] * norm[0];
                var inner = Math.acos((delta[0] * norm[0] + delta[1] * norm[1]) / abs);
                var theta = outer > 0.0 ? -1.0 * inner : inner;
                cosx += Math.cos(theta);
                sinx += Math.sin(theta);
            }
            var scale = abss / 4.0;
            var omega = Math.atan2(sinx, cosx);

            if (!size) size = this._map.getSize();
            var radius = Math.floor(Math.min(size[0], size[1]) / 4);
            var zoom = Math.log(radius * ol.const.MERC_MAX / 128 / scale) / Math.log(2);

            return [center, zoom, omega];
        };

        target.prototype.mercs2MercRotation = function(xys) {
            var center = xys[0];
            var nesw = xys.slice(1, 5);
            var neswDelta = nesw.map(function(val) {
                return [val[0] - center[0], val[1] - center[1]];
            });
            var normal = [[0.0, 1.0], [1.0, 0.0], [0.0, -1.0], [-1.0, 0.0]];
            // var abss = 0;
            var cosx = 0;
            var sinx = 0;
            for (var i = 0; i < 4; i++) {
                var delta = neswDelta[i];
                var norm = normal[i];
                var abs = Math.sqrt(Math.pow(delta[0], 2) + Math.pow(delta[1], 2));
                // abss += abs;
                var outer = delta[0] * norm[1] - delta[1] * norm[0];
                var inner = Math.acos((delta[0] * norm[0] + delta[1] * norm[1]) / abs);
                var theta = outer > 0.0 ? -1.0 * inner : inner;
                cosx += Math.cos(theta);
                sinx += Math.sin(theta);
            }
            // var scale = abss / 4.0;
            return Math.atan2(sinx, cosx);
        };
    };
    ol.source.META_KEYS = ['title', 'officialTitle', 'author', 'createdAt', 'era',
        'contributor', 'mapper', 'license', 'dataLicense', 'attr', 'dataAttr',
        'reference', 'description'];

    ol.source.setCustomInitialize = function(self, options) {
        self.sourceID = options.sourceID;
        self.map_option = options.map_option || {};
        self.home_position = options.home_position;
        self.merc_zoom = options.merc_zoom;
        self.fake_gps = options.fake_gps || false;
        self.thumbnail = options.thumbnail || './tmbs/' + (options.mapID || options.sourceID) + '_menu.jpg';
        self.label = options.label;
        if (options.envelopLngLats) {
            var mercs = options.envelopLngLats.map(function(lnglat){
                return ol.proj.transform(lnglat, 'EPSG:4326', 'EPSG:3857');
            });
            mercs.push(mercs[0]);
            self.envelop = turf.helpers.polygon([mercs]);
            self.centroid = turf.centroid(self.envelop).geometry.coordinates;
        }

        for (var i = 0; i < ol.source.META_KEYS.length; i++) {
            var key = ol.source.META_KEYS[i];
            self[key] = options[key];
        }

        if (!options.cache_enable) {
            //console.log('setcache');
            var openDB;
            self.cacheWait = new Promise(function(resolve, reject) {
                openDB = indexedDB.open('MaplatDB_' + self.sourceID);
                openDB.onupgradeneeded = function(event) {
                    var db = event.target.result;
                    db.createObjectStore('tileCache', {keyPath : 'z_x_y'});
                };
                openDB.onsuccess = function(event) {
                    var db = event.target.result;
                    self.cache_db = db;
                    resolve();
                };
                openDB.onerror = function (event) {
                    resolve();
                };
            });
        }
    };

    ol.source.NowMap = function(optOptions) {
        var options = optOptions || {};
        ol.source.OSM.call(this, options);
        ol.source.setCustomInitialize(this, options);
    };
    ol.inherits(ol.source.NowMap, ol.source.OSM);
    ol.source.NowMap.createAsync = function(options) {
        return new Promise(function(resolve, reject) {
            var obj = new ol.source.NowMap(options);
            resolve(obj);
        }).catch(function(err) { throw err; });
    };
    ol.source.setCustomFunction(ol.source.NowMap);
    ol.source.NowMap.prototype.xy2MercAsync = function(xy) {
        return new Promise(function(resolve, reject) {
            resolve(xy);
        }).catch(function(err) { throw err; });
    };
    ol.source.NowMap.prototype.merc2XyAsync = function(merc) {
        return new Promise(function(resolve, reject) {
            resolve(merc);
        });
    };

    ol.source.NowMap.prototype.insideCheckXy = function(xy) {
        if (!this.envelop) return true;
        var point = turf.helpers.point(xy);
        return turf.booleanPointInPolygon(point, this.envelop);
    };

    ol.source.NowMap.prototype.insideCheckHistMapCoords = function(histCoords) {
        return this.insideCheckXy(histCoords);
    };

    ol.source.NowMap.prototype.modulateXyInside = function(xy) {
        if (!this.centroid) return xy;
        var expandLine = turf.lineString([xy, this.centroid]);
        var intersect = turf.lineIntersect(this.envelop, expandLine);
        if (intersect.features.length > 0 && intersect.features[0].geometry) {
            return intersect.features[0].geometry.coordinates;
        } else {
            return xy;
        }
    };

    ol.source.NowMap.prototype.modulateHistMapCoordsInside = function(histCoords) {
        return this.modulateXyInside(histCoords);
    };

    ol.source.TmsMap = function(optOptions) {
        var options = optOptions || {};
        ol.source.NowMap.call(this, options);
    };
    ol.inherits(ol.source.TmsMap, ol.source.NowMap);
    ol.source.TmsMap.createAsync = function(options) {
        var promise = new Promise(function(resolve, reject) {
            var obj = new ol.source.TmsMap(options);
            resolve(obj);
        });
        return promise.catch(function(err) { throw err; });
    };

    ol.MaplatMap = function(optOptions) {
        optOptions = optOptions || {};
        var vectorLayer = new ol.layer.Vector({
            source: new ol.source.Vector({
                wrapX: false
            })
        });
        vectorLayer.set('name', 'gps');

        var markerLayer = new ol.layer.Vector({
            source: new ol.source.Vector({
                wrapX: false
            })
        });
        markerLayer.set('name', 'marker');

        var featureLayer = new ol.layer.Vector({
            source: new ol.source.Vector({
                wrapX: false
            })
        });
        featureLayer.set('name', 'feature');

        var baseLayer = optOptions.baseLayer ? optOptions.baseLayer :
            new ol.layer.Tile({
                source: optOptions.source
            });
        baseLayer.set('name', 'base');

        var overlayLayer = this._overlay_group = new ol.layer.Group();
        overlayLayer.set('name', 'overlay');

        var controls = optOptions.controls ? optOptions.controls : [];

        var options = {
            controls: controls,
            layers: [
                baseLayer,
                overlayLayer,
                featureLayer,
                vectorLayer,
                markerLayer
            ],
            target: optOptions.div,
            view: new ol.View({
                center: optOptions.default_center || [0, 0],
                zoom: optOptions.default_zoom || 2,
                rotation: optOptions.default_rotation || 0
            })
        };
        if (optOptions.interactions) {
            options.interactions = optOptions.interactions;
        } else if (optOptions.off_rotation) {
            options.interactions = ol.interaction.defaults({altShiftDragRotate: false, pinchRotate: false});
        }

        ol.Map.call(this, options);

        var view = this.getView();
        var self = this;
        self.__AvoidFirstMoveStart = true;
        var movestart = function() {
            if (!self.__AvoidFirstMoveStart) self.dispatchEvent('movestart');
            self.__AvoidFirstMoveStart = false;
            view.un('propertychange', movestart);
        };
        view.on('propertychange', movestart);
        self.on('moveend', function() {
            view.on('propertychange', movestart);
        });
    };
    ol.inherits(ol.MaplatMap, ol.Map);

    ol.MaplatMap.prototype.getLayer = function(name) {
        if (!name) name = 'base';
        var recur = function(layers) {
            var filtered = layers.getArray().map(function(layer) {
                if (layer.get('name') == name) return layer;
                if (layer.getLayers) return recur(layer.getLayers());
                return;
            }).filter(function(layer) {
                return layer;
            });
            if (filtered.length == 0) return;
            return filtered[0];
        };
        return recur(this.getLayers());
    };

    ol.MaplatMap.prototype.getSource = function(name) {
        var layer = this.getLayer(name);
        if (!layer) return;
        return layer.getSource();
    };

    ol.MaplatMap.prototype.setGPSPosition = function(pos) {
        var src = this.getSource('gps');
        src.clear();
        if (pos) {
            var iconFeature = new ol.Feature({
                geometry: new ol.geom.Point(pos.xy)
            });
            iconFeature.setStyle(gpsStyle);
            var circle = new ol.Feature({
                geometry: new ol.geom.Circle(pos.xy, pos.rad)
            });
            circle.setStyle(accCircleStyle);
            src.addFeature(iconFeature);
            src.addFeature(circle);
        }
    };

    ol.MaplatMap.prototype.resetMarker = function() {
        var src = this.getSource('marker');
        src.clear();
    };

    ol.MaplatMap.prototype.setMarker = function(xy, data, markerStyle) {
        var src = this.getSource('marker');
        data['geometry'] = new ol.geom.Point(xy);
        var iconFeature = new ol.Feature(data);
        if (!markerStyle) markerStyle = markerDefaultStyle;
        else if (typeof markerStyle == 'string') {
            markerStyle = new ol.style.Style({
                image: new ol.style.Icon(({
                    anchor: [0.5, 1.0],
                    anchorXUnits: 'fraction',
                    anchorYUnits: 'fraction',
                    src: markerStyle
                }))
            });
        }
        iconFeature.setStyle(markerStyle);
        src.addFeature(iconFeature);
    };

    ol.MaplatMap.prototype.setLine = function(xys, stroke) {
        var src = this.getSource('feature');
        var lineFeature = new ol.Feature({
            geometry: new ol.geom.LineString(xys),
            name: 'Line'
        });
        if (stroke != null) {
            lineFeature.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke(stroke)
            }));
        }

        src.addFeature(lineFeature);
    };

    ol.MaplatMap.prototype.resetLine = function() {
        var src = this.getSource('feature');
        src.clear();
    };

    ol.MaplatMap.prototype.exchangeSource = function(source) {
        var layers = this.getLayers();
        var layer = layers.item(0);
        layer.setSource(source);
        if (source) {
            source._map = this;
        }
    };

    ol.MaplatMap.prototype.setLayer = function(source) {
        var layers = this.getLayer('overlay').getLayers();
        layers.clear();
        if (source) {
            var layer = new ol.layer.Tile({
                source: source
            });
            layers.push(layer);
        }
    };

    ol.MaplatMap.prototype.setOpacity = function(percentage) {
        var opacity = (100 - percentage) / 100;
        var source = this.getSource();
        if (source instanceof ol.source.NowMap) {
            this.getLayers().item(0).setOpacity(1);
            this.getLayers().item(1).setOpacity(opacity);
        } else {
            this.getLayers().item(0).setOpacity(opacity);
        }
    };

    ol.MaplatMap.prototype.setGPSMarker = function(position, ignoreMove) {
       // alert("ol.MaplatMap.prototype.setGPSMarker");
        var source = this.getLayers().item(0).getSource();
        source.setGPSMarker(position, ignoreMove);
    };

    ol.MaplatMap.prototype.handleGPS = function(launch, avoidEventForOff) {
        if (launch) {
            this.dispatchEvent('gps_request');
            this._first_gps_request = true;
            if (!this.geolocation) {
                var geolocation = this.geolocation = new ol.Geolocation({tracking: true});
                // listen to changes in position
                var map = this;
                geolocation.on('change', function(evt) {
                    var source = map.getLayers().item(0).getSource();
                    var lnglat = geolocation.getPosition();
                    var acc = geolocation.getAccuracy();
                    if (source.fake_gps && ol.MathEx.getDistance(source.home_position, lnglat) > source.fake_gps) {
                        lnglat = [ol.MathEx.randomFromCenter(source.home_position[0], 0.001),
                            ol.MathEx.randomFromCenter(source.home_position[1], 0.001)];
                        acc = ol.MathEx.randomFromCenter(15.0, 10);
                    }
                    var gpsVal = {lnglat: lnglat, acc: acc};
                    source.setGPSMarkerAsync(gpsVal, !map._first_gps_request)
                        .then(function(result) {
                            if (!result) {
                                gpsVal = {error: 'gps_out'};
                            }
                            map._first_gps_request = false;
                            map.dispatchEvent(new ol.MapEvent('gps_result', map, gpsVal));
                        });
                });
                geolocation.on('error', function(evt) {
                    var source = map.getLayers().item(0).getSource();
                    var gpsVal = null;
                    if (source.fake_gps) {
                        var lnglat = [ol.MathEx.randomFromCenter(source.home_position[0], 0.001),
                            ol.MathEx.randomFromCenter(source.home_position[1], 0.001)];
                        var acc = ol.MathEx.randomFromCenter(15.0, 10);
                        gpsVal = {lnglat: lnglat, acc: acc};
                    }
                    source.setGPSMarkerAsync(gpsVal, !map._first_gps_request)
                        .then(function(result) {
                            if (!result) {
                                gpsVal = {error: 'gps_out'};
                            }
                            map._first_gps_request = false;
                            map.dispatchEvent(new ol.MapEvent('gps_result', map, gpsVal));
                        });
                });
            } else {
                this.geolocation.setTracking(true);
            }
        } else {
            if (this.geolocation) this.geolocation.setTracking(false);
            var source = this.getLayers().item(0).getSource();
            source.setGPSMarker();
            if (!avoidEventForOff) this.dispatchEvent(new ol.MapEvent('gps_result', map, {error: 'gps_off'}));
        }
    };

    ol.MathEx = {};

    ol.MathEx.randomFromCenter = function(center, pow) {
        return center + (Math.random() - 0.5) * pow;
    };

    ol.MathEx.recursiveRound = function(val, decimal) {
        if (val instanceof Array) return val.map(function(item) {
            return ol.MathEx.recursiveRound(item, decimal);
        });
        var decVal = Math.pow(10, decimal);
        return Math.round(val * decVal) / decVal;
    };

    ol.MathEx.getDistance = function(lnglat1, lnglat2) {
        function radians(deg) {
            return deg * Math.PI / 180;
        }

        return 6378.14 * Math.acos(Math.cos(radians(lnglat1[1]))*
                Math.cos(radians(lnglat2[1]))*
                Math.cos(radians(lnglat2[0])-radians(lnglat1[0]))+
                Math.sin(radians(lnglat1[1]))*
                Math.sin(radians(lnglat2[1])));
    };

    return ol;
});
