(function () {
    var POINTS = [[30, 6], [95, 18], [100, 42], [0, 59], [55, 74], [45, 95], [83, 96]];
    var PATHS_DATA = null;
    var ORIGINAL_CANVAS_SIZE = 800;
    var SIZE = 400;
    var MARGIN = 20;

    var SIZES = {
        POINT_RADIUS: 1.5,
        PEN_STROKE_WIDTH: 0.5,
        LINE_STROKE_WIDTH: 0.8
    };

    var CUSTOM_MODEL_PATH = 'doodle/custom-model.gen.json';
    var FALLBACK_MODELS = ['cat', 'owl', 'flamingo', 'flower', 'crab'];
    var FALLBACK_MODEL_URL = 'https://storage.googleapis.com/quickdraw-models/sketchRNN/large_models/';
    var ML_MAX_STEPS = 500;
    var ML_PIXEL_FACTOR = 3.0;
    var ML_NUM_PASSES = 3;
    var ML_PASS_CONFIG = [
        { temperature: 0.35, strokeWidth: 0.6 },
        { temperature: 0.45, strokeWidth: 0.9 },
        { temperature: 0.55, strokeWidth: 0.5 }
    ];

    var scope, masterGroup, paintGroup, line, mouseLine;
    var mouseLineInitHappened = false;
    var connectOrder = [];
    var placedDots = [];
    var currentlyPainting = false;
    var timers = [];
    var originalPosition = null;
    var paintGroupPositionTmp = null;
    var sizesRelative = {};
    var points = [];

    var sketchModels = {};
    var mlReady = false;

    function getRelativeValue(value) {
        return (value / 100) * SIZE;
    }

    function getThemeColor() {
        var theme = document.documentElement.getAttribute('data-theme');
        return theme === 'dark' ? '#eeeeee' : '#0d0d0d';
    }

    // ---- ML MODEL LOADING ----

    function loadSketchModels() {
        if (typeof ms === 'undefined' || typeof ms.SketchRNN === 'undefined') {
            console.warn('Magenta.js not available, using static paintings');
            return;
        }

        var customModel = new ms.SketchRNN(CUSTOM_MODEL_PATH);
        customModel.initialize().then(function () {
            customModel.setPixelFactor(ML_PIXEL_FACTOR);
            sketchModels['custom'] = customModel;
            mlReady = true;
        }).catch(function () {
            FALLBACK_MODELS.forEach(function (name) {
                var model = new ms.SketchRNN(FALLBACK_MODEL_URL + name + '.gen.json');
                model.initialize().then(function () {
                    model.setPixelFactor(ML_PIXEL_FACTOR);
                    sketchModels[name] = model;
                    if (!mlReady) {
                        mlReady = true;
                    }
                }).catch(function (err) {
                    console.warn('Failed to load model: ' + name, err);
                });
            });
        });
    }

    // ---- INIT ----

    function init() {
        var canvas = document.getElementById('doodle-canvas');
        if (!canvas) return;
        if (typeof paper === 'undefined') {
            console.error('Paper.js not loaded');
            return;
        }

        Object.keys(SIZES).forEach(function (key) {
            sizesRelative[key] = getRelativeValue(SIZES[key]);
        });

        var relativeMargin = getRelativeValue(MARGIN);
        points = POINTS.map(function (point) {
            return point.map(function (pos) {
                var withoutMargin = getRelativeValue(pos);
                return relativeMargin + (withoutMargin / 100) * (100 - MARGIN * 2);
            });
        });

        scope = new paper.PaperScope();
        scope.setup(canvas);
        masterGroup = new scope.Group();

        drawPoints();
        initConnectionLine();
        setCanvasSize();

        scope.view.onResize = function () { setCanvasSize(); };
        scope.view.draw();

        loadSketchModels();
    }

    function setCanvasSize() {
        var size = scope.view.viewSize;
        if (!originalPosition) {
            originalPosition = masterGroup.position.clone();
        }
        masterGroup.position = new scope.Point(size.width / 2, size.height / 2);

        if (paintGroup && paintGroup.children.length) {
            if (!paintGroupPositionTmp) {
                paintGroupPositionTmp = paintGroup.position.clone();
            }
            var diff = masterGroup.position.subtract(originalPosition);
            paintGroup.position = paintGroupPositionTmp.add(diff);
        }
        scope.view.draw();
    }

    function drawPoints() {
        var color = new scope.Color(getThemeColor());
        placedDots = [];

        points.forEach(function (point, index) {
            var dot = new scope.Path.Circle({
                center: point,
                radius: sizesRelative.POINT_RADIUS,
                fillColor: color
            });
            masterGroup.addChild(dot);

            var hitArea = new scope.Path.Circle({
                center: point,
                radius: sizesRelative.POINT_RADIUS * 8,
                fillColor: new scope.Color(0, 0, 0, 0.001)
            });
            hitArea.onMouseEnter = function () { addConnectionDot(index); };
            hitArea.onMouseDown = function () { addConnectionDot(index); };
            masterGroup.addChild(hitArea);
            placedDots.push(hitArea);
        });
    }

    function addConnectionDot(index) {
        if (!line || line.closed) return;
        var position = placedDots[index].position;

        if (connectOrder.indexOf(index) === -1) {
            line.add(new scope.Point(position));
            connectOrder.push(index);

            if (mouseLineInitHappened) {
                if (mouseLine.segments.length === 1) {
                    mouseLine.add(new scope.Point(position));
                } else {
                    mouseLine.lastSegment.point = position;
                }
            }
        }
        if (connectOrder.length === points.length) {
            dotConnectionFinished();
        }
    }

    function dotConnectionFinished() {
        if (mouseLineInitHappened && mouseLine) {
            mouseLine.lastSegment.remove();
        }
        line.closed = true;
        currentlyPainting = true;

        if (mlReady && Object.keys(sketchModels).length > 0) {
            generateMLDrawing();
        } else {
            loadStaticPainting();
        }
    }

    // ---- ML GENERATION ----

    function generateOnePass(model, temperature) {
        var input = model.zeroInput();
        var modelState = model.zeroState();
        var previousPen = [input[2], input[3], input[4]];

        var rawStrokes = [];
        var x = 0, y = 0;

        for (var i = 0; i < ML_MAX_STEPS; i++) {
            modelState = model.update(input, modelState);
            var pdf = model.getPDF(modelState, temperature);
            input = model.sample(pdf);

            var dx = input[0];
            var dy = input[1];
            var pen = [input[2], input[3], input[4]];

            rawStrokes.push({
                x: x, y: y,
                nextX: x + dx, nextY: y + dy,
                prevPenDown: previousPen[0] === 1,
                penEnd: pen[2] === 1
            });

            x += dx;
            y += dy;
            previousPen = pen;

            if (pen[2] === 1) break;
        }

        return rawStrokes;
    }

    function generateMLDrawing() {
        var modelNames = Object.keys(sketchModels);
        if (modelNames.length === 0) {
            loadStaticPainting();
            return;
        }

        var orderHash = connectOrder.reduce(function (a, b) { return a * 7 + b; }, 0);
        var passes = [];

        for (var p = 0; p < ML_NUM_PASSES; p++) {
            var idx = Math.abs(orderHash + p * 3) % modelNames.length;
            var model = sketchModels[modelNames[idx]];
            if (!model) continue;

            var config = ML_PASS_CONFIG[p % ML_PASS_CONFIG.length];
            var strokes = generateOnePass(model, config.temperature);
            if (strokes.length >= 3) {
                passes.push({ strokes: strokes, strokeWidth: config.strokeWidth });
            }
        }

        if (passes.length === 0) {
            loadStaticPainting();
            return;
        }

        renderMLPasses(passes);
    }

    function renderMLPasses(passes) {
        var pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
        connectOrder.forEach(function (idx) {
            var pt = points[idx];
            pMinX = Math.min(pMinX, pt[0]);
            pMinY = Math.min(pMinY, pt[1]);
            pMaxX = Math.max(pMaxX, pt[0]);
            pMaxY = Math.max(pMaxY, pt[1]);
        });
        var polyW = pMaxX - pMinX;
        var polyH = pMaxY - pMinY;
        var polyCenterX = pMinX + polyW / 2;
        var polyCenterY = pMinY + polyH / 2;

        timers.forEach(function (t) { clearTimeout(t); });
        timers = [];

        if (paintGroup) {
            paintGroup.removeChildren();
        } else {
            paintGroup = new scope.Group();
        }

        var clipPath = line.clone();
        clipPath.clipMask = true;
        paintGroup.addChild(clipPath);

        var color = new scope.Color(getThemeColor());
        var allPaths = [];

        passes.forEach(function (pass) {
            var rawStrokes = pass.strokes;

            var sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
            rawStrokes.forEach(function (s) {
                sMinX = Math.min(sMinX, s.x, s.nextX);
                sMinY = Math.min(sMinY, s.y, s.nextY);
                sMaxX = Math.max(sMaxX, s.x, s.nextX);
                sMaxY = Math.max(sMaxY, s.y, s.nextY);
            });

            var strokeW = sMaxX - sMinX || 1;
            var strokeH = sMaxY - sMinY || 1;
            var scaleFactor = Math.min(polyW / strokeW, polyH / strokeH) * 0.9;
            var strokeCenterX = (sMinX + sMaxX) / 2;
            var strokeCenterY = (sMinY + sMaxY) / 2;

            function tx(rawX) {
                return polyCenterX + (rawX - strokeCenterX) * scaleFactor;
            }
            function ty(rawY) {
                return polyCenterY + (rawY - strokeCenterY) * scaleFactor;
            }

            var currentPath = null;

            rawStrokes.forEach(function (s) {
                if (s.prevPenDown) {
                    if (!currentPath) {
                        currentPath = new scope.Path();
                        currentPath.strokeColor = color;
                        currentPath.strokeWidth = pass.strokeWidth;
                        currentPath.strokeCap = 'round';
                        currentPath.strokeJoin = 'round';
                        currentPath.add(new scope.Point(tx(s.x), ty(s.y)));
                    }
                    currentPath.add(new scope.Point(tx(s.nextX), ty(s.nextY)));
                } else {
                    if (currentPath && currentPath.segments.length > 1) {
                        currentPath.smooth({ type: 'continuous' });
                        paintGroup.addChild(currentPath);
                        allPaths.push(currentPath);
                    }
                    currentPath = null;
                }
            });

            if (currentPath && currentPath.segments.length > 1) {
                currentPath.smooth({ type: 'continuous' });
                paintGroup.addChild(currentPath);
                allPaths.push(currentPath);
            }
        });

        if (allPaths.length === 0) {
            currentlyPainting = false;
            scope.view.draw();
            return;
        }

        allPaths.forEach(function (path) { path.opacity = 0; });
        allPaths.forEach(function (path, idx) {
            timers.push(setTimeout(function () {
                path.opacity = 1;
                scope.view.draw();
                if (idx === allPaths.length - 1) {
                    currentlyPainting = false;
                }
            }, idx * 40));
        });
    }

    // ---- STATIC PAINTING FALLBACK ----

    function loadStaticPainting() {
        if (!PATHS_DATA) {
            currentlyPainting = false;
            return;
        }

        var key = connectOrder.join('');
        var drawingIndex = PATHS_DATA.byKey[key];

        fetch('doodle/paintingsSingle/' + drawingIndex + '.json')
            .then(function (r) { return r.json(); })
            .then(function (painting) { initPaint(painting); })
            .catch(function (ex) {
                console.error('painting load failed', ex);
                currentlyPainting = false;
            });
    }

    function initPaint(painting) {
        timers.forEach(function (t) { clearTimeout(t); });
        timers = [];

        if (paintGroup) {
            paintGroup.removeChildren();
        } else {
            paintGroup = new scope.Group();
        }

        if (painting) {
            var sf = SIZE / ORIGINAL_CANVAS_SIZE;
            paintGroup.importJSON(painting);
            paintGroup.scale(sf, new scope.Point(0, 0));

            paintGroup.children.forEach(function (child, idx) {
                child.strokeWidth = (child.strokeWidth || 1) * sf * 0.5;
                child.opacity = 0;

                timers.push(setTimeout(function () {
                    child.opacity = 1;
                    setCanvasSize();
                    scope.view.draw();
                    if (idx === paintGroup.children.length - 1) {
                        currentlyPainting = false;
                    }
                }, idx * 100));
            });
        }
    }

    // ---- CONNECTION LINE & RESET ----

    function initConnectionLine() {
        if (line) line.remove();

        var color = new scope.Color(getThemeColor());

        line = new scope.Path();
        line.strokeColor = color;
        line.strokeWidth = sizesRelative.LINE_STROKE_WIDTH;
        line.strokeJoin = 'round';
        line.closed = false;

        masterGroup.addChild(line);
        paintGroupPositionTmp = null;

        if (!mouseLine) {
            mouseLine = new scope.Path();
            mouseLine.strokeColor = color;
            mouseLine.strokeWidth = sizesRelative.LINE_STROKE_WIDTH;
            mouseLine.strokeCap = 'round';
            mouseLine.sendToBack();

            scope.view.onMouseMove = function (event) {
                if (!mouseLineInitHappened) {
                    mouseLine.add(new scope.Point(0, 0));
                    mouseLineInitHappened = true;
                }
                mouseLine.firstSegment.point = event.point;
            };
        } else {
            mouseLine.strokeColor = color;
            if (mouseLine.segments.length !== 1 && mouseLineInitHappened) {
                mouseLine.lastSegment.remove();
            }
        }

        connectOrder = [];

        scope.project.view.onMouseDown = function () {
            if (line.closed && !currentlyPainting) {
                reset();
            }
        };
    }

    function reset() {
        timers.forEach(function (t) { clearTimeout(t); });
        timers = [];
        originalPosition = null;
        paintGroupPositionTmp = null;
        mouseLineInitHappened = false;
        if (mouseLine) { mouseLine.remove(); mouseLine = null; }

        if (paintGroup) paintGroup.removeChildren();

        masterGroup.removeChildren();
        drawPoints();
        initConnectionLine();
        scope.view.draw();
    }

    // ---- STARTUP ----

    fetch('doodle/renderedPaths7.json')
        .then(function (r) { return r.json(); })
        .then(function (data) { PATHS_DATA = data; })
        .catch(function () { /* static paintings unavailable, ML will be primary */ });

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
