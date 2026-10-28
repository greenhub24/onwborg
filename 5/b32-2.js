// --- inline script block 2 ---
(function () {
      var STORAGE_KEY = 'ow-property-panel-layout';
      var btn = document.getElementById('btn-layout-toggle');
      if (!btn) return;

      function applyLayout(vertical) {
        document.body.classList.toggle('property-panel-vertical', vertical);
        btn.setAttribute('aria-pressed', vertical ? 'true' : 'false');
        btn.title = vertical ? 'Switch property panel back to top' : 'Switch property panel to Excalidraw-style layout';
      }

      var saved = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
      applyLayout(saved !== null ? saved === 'vertical' : true);

      btn.addEventListener('click', function () {
        var vertical = !document.body.classList.contains('property-panel-vertical');
        applyLayout(vertical);
        try { localStorage.setItem(STORAGE_KEY, vertical ? 'vertical' : 'horizontal'); } catch (e) {}
      });
    })();

        /**
     * VECTOR WHITEBOARD ARCHITECTURE - PHASE 3 (SELECTION & TRANSFORM)
     * -------------------------------------------------------------------------
     * Professional 2D Vector Engine with Infinite Viewport, Selection Box, 
     * Multi-select Marquee, Move, 8-Handle Resize, Rotation & Undo/Redo commands.
     */

    /* ==========================================================================
       ZQ-GATE
       Only the sites listed in ZQ_GATE_HOSTS may run this app (one per line).
       Format: 'https://yourdomain.com'  (protocol + domain, no trailing slash)
       zqGateCheck() is called in several places in this file.
       Search for "ZQ-GATE" to find every one of them.
       ========================================================================== */
    const ZQ_GATE_HOSTS = [
      'https://onlinewhiteboard.org',
    ];

    // Set to true to re-enable the domain lock before production deploy.
    const ZQ_GATE_ENABLED = false;

    function zqGateCheck() {
      if (!ZQ_GATE_ENABLED) return; // domain lock disabled (e.g. GitHub Pages deploy)
      const loc = window.location;
      const zqCurrentSite = loc.protocol + '//' + loc.hostname;
      if (ZQ_GATE_HOSTS.includes(zqCurrentSite)) return;

      const links = ZQ_GATE_HOSTS.map(function (origin) {
        return '<a href="' + origin + '" style="display:block;font-size:16px;color:#6366f1;margin-top:6px;">' + origin + '</a>';
      }).join('');
      document.documentElement.innerHTML =
        '<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f8fafc;">' +
        '<div style="text-align:center;color:#64748b;">' +
        '<p style="font-size:18px;font-weight:600;">This application is only available at</p>' +
        links +
        '</div></body>';
      throw new Error('ZQ-GATE: blocked host ' + zqCurrentSite);
    }

    zqGateCheck(); // ZQ-GATE: 1 - on script load

    /* ==========================================================================
       0. SAFE STORAGE HELPER (IN-MEMORY FALLBACK FOR SANDBOX / IFRAME SAFETY)
       ========================================================================== */
    const SafeStorage = {
      _mem: new Map(),
      getItem(key, fallback = null) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const val = window.localStorage.getItem(key);
            return val !== null ? val : fallback;
          }
        } catch (e) {
          // Blocked by browser security / partitioned iframe
        }
        return this._mem.has(key) ? this._mem.get(key) : fallback;
      },
      setItem(key, value) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, String(value));
            return true;
          }
        } catch (e) {
          // Blocked by browser security / partitioned iframe
        }
        this._mem.set(key, String(value));
        return true;
      },
      removeItem(key) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(key);
            return true;
          }
        } catch (e) {
          // Blocked by browser security / partitioned iframe
        }
        this._mem.delete(key);
        return true;
      }
    };

    /* ==========================================================================
       1. GEOMETRY & MATH UTILITIES
       ========================================================================== */
    class MathUtils {
      /* Text tool only: maximum line width (SVG units) before text auto-wraps. */
      static get TEXT_TOOL_MAX_WIDTH() { return 640; }

      /* Text tool only: size-slider value (1-48) -> font size in px.
         Sizes 1-3 step by 7px (10, 17, 24) so the smallest text is 10px;
         size 3 and above are unchanged (12 + size * 4). */
      static textFontSizeFromSize(size) {
        return size <= 3 ? 10 + (size - 1) * 7 : 12 + size * 4;
      }
      /* Inverse of textFontSizeFromSize, used to show the slider value for existing text. */
      static sizeFromTextFontSize(fontSize) {
        return fontSize <= 24 ? Math.max(1, Math.round((fontSize - 10) / 7) + 1) : Math.round((fontSize - 12) / 4);
      }

      /* Text tool only: word-wraps text to maxWidth using real font metrics.
         Keeps explicit newlines; hard-breaks single words longer than maxWidth. */
      static wrapTextToWidth(text, fontSize, bold, italic, fontFamily, maxWidth) {
        const src = String(text === undefined || text === null ? '' : text);
        maxWidth = maxWidth || MathUtils.TEXT_TOOL_MAX_WIDTH;
        let ctx = MathUtils._textWrapCtx;
        if (!ctx) {
          ctx = MathUtils._textWrapCtx = document.createElement('canvas').getContext('2d');
        }
        ctx.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${fontSize}px ${fontFamily || 'sans-serif'}`;
        const measure = (t) => ctx.measureText(t).width;
        const out = [];
        src.split('\n').forEach((para) => {
          if (para === '' || measure(para) <= maxWidth) { out.push(para); return; }
          let line = '';
          const pushWord = (word) => {
            // Hard-break a word that alone is wider than maxWidth
            let chunk = '';
            for (const ch of word) {
              if (chunk && measure(chunk + ch) > maxWidth) { out.push(chunk); chunk = ch; }
              else chunk += ch;
            }
            return chunk;
          };
          para.split(' ').forEach((word) => {
            const candidate = line === '' ? word : line + ' ' + word;
            if (measure(candidate) <= maxWidth) { line = candidate; return; }
            if (line !== '') { out.push(line); line = ''; }
            if (measure(word) <= maxWidth) { line = word; }
            else { line = pushWord(word); }
          });
          out.push(line);
        });
        return out.length ? out : [''];
      }

      static wrapText(text, maxCharsPerLine = 24) {
        if (!text) return [''];
        // Hard-break a single token that is longer than maxCharsPerLine into
        // successive chunks.  Only called for spaceless long strings; normal
        // words that already fit are returned as-is (no behaviour change).
        function hardBreak(token) {
          const chunks = [];
          let remaining = token;
          while (remaining.length > maxCharsPerLine) {
            chunks.push(remaining.slice(0, maxCharsPerLine));
            remaining = remaining.slice(maxCharsPerLine);
          }
          if (remaining.length > 0) chunks.push(remaining);
          return chunks;
        }

        const rawLines = String(text).split('\n');
        const lines = [];
        for (const rLine of rawLines) {
          if (rLine.length <= maxCharsPerLine) {
            lines.push(rLine);
          } else {
            const words = rLine.split(' ');
            let cur = '';
            for (const w of words) {
              if (!cur) {
                // If the word itself overflows, hard-break it immediately.
                if (w.length > maxCharsPerLine) {
                  const chunks = hardBreak(w);
                  // All chunks except the last are flushed; the last becomes cur.
                  for (let ci = 0; ci < chunks.length - 1; ci++) lines.push(chunks[ci]);
                  cur = chunks[chunks.length - 1];
                } else {
                  cur = w;
                }
              } else if ((cur + ' ' + w).length <= maxCharsPerLine) {
                cur += ' ' + w;
              } else {
                // Flush the current accumulator before starting a new one.
                // If cur itself overflowed (shouldn't happen via this path, but
                // guard it anyway), hard-break it too.
                if (cur.length > maxCharsPerLine) {
                  const curChunks = hardBreak(cur);
                  for (let ci = 0; ci < curChunks.length - 1; ci++) lines.push(curChunks[ci]);
                  cur = curChunks[curChunks.length - 1];
                } else {
                  lines.push(cur);
                  cur = '';
                }
                // Now start the new word, hard-breaking if it overflows on its own.
                if (w.length > maxCharsPerLine) {
                  const chunks = hardBreak(w);
                  for (let ci = 0; ci < chunks.length - 1; ci++) lines.push(chunks[ci]);
                  cur = chunks[chunks.length - 1];
                } else {
                  cur = (cur ? cur + ' ' : '') + w;
                }
              }
            }
            if (cur) {
              // Final flush — hard-break if the last accumulator still overflows.
              if (cur.length > maxCharsPerLine) {
                const chunks = hardBreak(cur);
                for (const ch of chunks) lines.push(ch);
              } else {
                lines.push(cur);
              }
            }
          }
        }
        return lines.length > 0 ? lines : [''];
      }

      /**
       * Produces one responsive text layout used by the live canvas and exports.
       * Padding scales with the object instead of becoming disproportionate on small objects.
       */
      static getFittedTextLayout(text, width, height, options = {}) {
        const basePaddingX = options.paddingX === undefined ? 12 : options.paddingX;
        const basePaddingY = options.paddingY === undefined ? 12 : options.paddingY;
        const scale = Math.min(1, Math.max(0.2, Math.min(width, height) / 180));
        const paddingX = Math.min(Math.max(1, width / 4), basePaddingX * scale);
        const paddingY = Math.min(Math.max(1, height / 4), basePaddingY * scale);
        const availW = Math.max(1, width - paddingX * 2);
        const availH = Math.max(1, height - paddingY * 2);
        const lineHeightRatio = options.lineHeight || 1.25;
        const maxFontSize = Math.max(4, options.fontSize || 18);
        const minFontSize = Math.max(3, options.minFontSize || 4);
        const source = String(text || '');

        for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 0.5) {
          const charsPerLine = Math.max(1, Math.floor(availW / (fontSize * 0.58)));
          const lines = MathUtils.wrapText(source, charsPerLine);
          if (lines.length * fontSize * lineHeightRatio <= availH) {
            return { fontSize: Math.round(fontSize * 10) / 10, lines, paddingX, paddingY, availW, availH, lineHeight: fontSize * lineHeightRatio };
          }
        }
        const fontSize = minFontSize;
        const charsPerLine = Math.max(1, Math.floor(availW / (fontSize * 0.58)));
        return { fontSize, lines: MathUtils.wrapText(source, charsPerLine), paddingX, paddingY, availW, availH, lineHeight: fontSize * lineHeightRatio };
      }

      /**
       * Calculates the responsive typography for sticky notes.  This is the single
       * source of truth for the canvas, inline editor, and exported SVG so a note
       * always retains its dimensions while its text scales to fit.
       */
      static getStickyTextLayout(text, width, height) {
        return MathUtils.getFittedTextLayout(text, width, height, {
          fontSize: 48,
          minFontSize: 3,
          paddingX: 12,
          paddingY: 12,
          lineHeight: 1.3
        });
      }

      static textLinesToHtml(lines) {
        return lines.map(line => MathUtils.escapeHtml(line)).join('<br/>');
      }

      /**
       * Returns SVG-safe text for one laid-out line without collapsing blank lines.
       * An SVG tspan containing only a regular space can be discarded or collapsed by
       * export consumers, so use a non-breaking space to retain the line's dy offset.
       */
      static escapeSvgTextLine(line) {
        return MathUtils.escapeSvgText(line === '' ? '\u00a0' : String(line));
      }

      static generateSvgTextElements(text, x, y, width, height, options = {}) {
        if (text === undefined || text === null || text === '') return '';
        const lines = String(text).split('\n');
        const fontSize = options.fontSize || 16;
        const lineHeight = fontSize * 1.25;
        const align = options.align || 'center';
        const vAlign = options.vAlign || 'center';
        const textColor = options.textColor || '#0f172a';
        const fontWeight = options.fontWeight || '500';
        const fontStyle = options.fontStyle || 'normal';
        const textDeco = options.textDeco ? ` text-decoration="${options.textDeco}"` : '';

        const totalTextHeight = lines.length * lineHeight;
        let startY;
        if (vAlign === 'top') {
          startY = y + fontSize + (options.paddingY !== undefined ? options.paddingY : 4);
        } else if (vAlign === 'bottom') {
          startY = y + height - totalTextHeight + fontSize * 0.85;
        } else {
          startY = y + (height - totalTextHeight) / 2 + fontSize * 0.85;
        }

        let textAnchor = 'middle';
        let startX = x + width / 2;
        if (align === 'left') {
          textAnchor = 'start';
          startX = x + (options.paddingX !== undefined ? options.paddingX : 8);
        } else if (align === 'right') {
          textAnchor = 'end';
          startX = x + width - (options.paddingX !== undefined ? options.paddingX : 8);
        }

        let out = `    <text x="${startX.toFixed(1)}" y="${startY.toFixed(1)}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" fill="${textColor}" text-anchor="${textAnchor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"${textDeco} pointer-events="none">\n`;
        for (let i = 0; i < lines.length; i++) {
          const dy = i === 0 ? '0' : `${lineHeight.toFixed(1)}px`;
          out += `      <tspan x="${startX.toFixed(1)}" dy="${dy}">${MathUtils.escapeHtml(lines[i])}</tspan>\n`;
        }
        out += `    </text>\n`;
        return out;
      }

      static getShapeDefaultLabel(shapeType) {
        const map = {
          rectangle: 'Rectangle',
          circle: 'Circle',
          diamond: 'Diamond',
          triangle: 'Triangle',
          star: 'Star',
          hexagon: 'Hexagon',
          pentagon: 'Pentagon',
          parallelogram: 'Parallelogram',
          cylinder: 'Cylinder',
          speech_bubble: 'Callout',
          cloud: 'Cloud',
          heart: 'Heart',
          plus: 'Plus',
          arrow_right: 'Right Arrow',
          arrow_left: 'Left Arrow',
          chevron: 'Chevron',
          trapezoid: 'Trapezoid',
          octagon: 'Octagon',
          document: 'Document',
          lightning: 'Lightning',
          cross_x: 'Cross X',
          arrow_up: 'Up Arrow',
          arrow_double: 'Double Arrow',
          stadium: 'Pill / Capsule',
          ribbon: 'Banner Ribbon',
          starburst: 'Starburst',
          thought_bubble: 'Thought Bubble',
          funnel: 'Funnel',
          cube: '3D Cube',
          graduated_cylinder: 'Graduated Cylinder',
          erlenmeyer_flask: 'Erlenmeyer Flask',
          beaker: 'Lab Beaker',
          test_tube: 'Test Tube',
          dna: 'DNA Helix',
          magnet: 'Magnet',
          microscope: 'Microscope',
          battery: 'Electric Battery',
          lightbulb: 'Light Bulb',
          gear: 'Engineering Gear',
          thermometer: 'Thermometer',
          solar_system: 'Planet & Orbit',
          resistor: 'Circuit Resistor'
        };
        if (map[shapeType]) return map[shapeType];
        if (!shapeType) return 'Shape';
        return shapeType.charAt(0).toUpperCase() + shapeType.slice(1).replace(/_/g, ' ');
      }

      static escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br/>');
      }

      static escapeSvgText(str) {
        // SVG-safe escape: does NOT convert \n to <br/> (invalid in SVG text elements)
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      static getArrowMarkers(arrowType = 'single') {
        switch (arrowType) {
          case 'double':
            return 'marker-start="url(#arrowhead)" marker-end="url(#arrowhead)"';
          case 'start':
            return 'marker-start="url(#arrowhead)"';
          case 'dot':
            return 'marker-end="url(#arrow-dot)"';
          case 'diamond':
            return 'marker-end="url(#arrow-diamond)"';
          case 'barbed':
            return 'marker-end="url(#arrow-barb)"';
          case 'single':
          default:
            return 'marker-end="url(#arrowhead)"';
        }
      }

      static getExportArrowMarkers(arrowType = 'single') {
        switch (arrowType) {
          case 'double':
            return 'marker-start="url(#export-arrowhead)" marker-end="url(#export-arrowhead)"';
          case 'start':
            return 'marker-start="url(#export-arrowhead)"';
          case 'dot':
            return 'marker-end="url(#export-arrow-dot)"';
          case 'diamond':
            return 'marker-end="url(#export-arrow-diamond)"';
          case 'barbed':
            return 'marker-end="url(#export-arrow-barb)"';
          case 'single':
          default:
            return 'marker-end="url(#export-arrowhead)"';
        }
      }

      static getDashArray(strokeStyle, strokeWidth = 2) {
        if (strokeStyle === 'dashed') {
          const sw = strokeWidth || 2;
          const dash = Math.round(sw * 2 + 4);
          const gap = Math.round(sw * 2.5 + 5);
          return `${dash} ${gap}`;
        } else if (strokeStyle === 'dotted') {
          const sw = strokeWidth || 2;
          const dash = Math.round(Math.max(2, sw * 0.8));
          const gap = Math.round(sw * 2 + 2);
          return `${dash} ${gap}`;
        }
        return '';
      }

      static getDashAttr(strokeStyle, strokeWidth = 2) {
        const dashArray = MathUtils.getDashArray(strokeStyle, strokeWidth);
        return dashArray ? `stroke-dasharray="${dashArray}"` : '';
      }

      /* ----------------------------------------------------------------------
         ELBOW CONNECTOR ROUTE
         A route is a chain of horizontal / vertical segments.
           elbowDir    : direction of the FIRST segment ('h' or 'v')
           elbowTracks : position of every MIDDLE segment
                         (an x for a vertical segment, a y for a horizontal one)
         The first and last segments always stay attached to the start / end points,
         so the route stays orthogonal when the connector or its shapes move.
         Without elbowTracks the classic 3-segment route is used (from cx / cy).
         ---------------------------------------------------------------------- */
      static getElbowTracks(obj) {
        if (obj.elbowTracks && obj.elbowTracks.length > 0) return obj.elbowTracks.slice();
        const x1 = obj.x1 || 0, y1 = obj.y1 || 0, x2 = obj.x2 || 0, y2 = obj.y2 || 0;
        if (obj.elbowDir === 'v') return [obj.cy !== undefined ? obj.cy : (y1 + y2) / 2];
        return [obj.cx !== undefined ? obj.cx : (x1 + x2) / 2];
      }

      // True when segment k of the route is horizontal.
      static isElbowSegmentHorizontal(obj, k) {
        return (obj.elbowDir !== 'v') === (k % 2 === 0);
      }

      // All corner points of the route, start to end. Segment k runs from points[k] to points[k + 1].
      static getElbowPoints(obj) {
        const x1 = obj.x1 || 0, y1 = obj.y1 || 0, x2 = obj.x2 || 0, y2 = obj.y2 || 0;
        const tracks = MathUtils.getElbowTracks(obj);
        const count = tracks.length + 2;
        const horiz = (k) => MathUtils.isElbowSegmentHorizontal(obj, k);
        const track = (k) => {
          if (k === 0) return horiz(0) ? y1 : x1;
          if (k === count - 1) return horiz(k) ? y2 : x2;
          return tracks[k - 1];
        };
        const points = [{ x: x1, y: y1 }];
        for (let k = 0; k < count - 1; k++) {
          const a = track(k), b = track(k + 1);
          points.push(horiz(k) ? { x: b, y: a } : { x: a, y: b });
        }
        points.push({ x: x2, y: y2 });
        return points;
      }

      // Point halfway along the route (used for the label position).
      static getElbowMid(obj) {
        const pts = MathUtils.getElbowDrawnPoints(obj);
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        let remaining = total / 2;
        for (let i = 0; i < pts.length - 1; i++) {
          const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
          if (len > 0 && remaining <= len) {
            const t = remaining / len;
            return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
          }
          remaining -= len;
        }
        return pts[0];
      }

      // Result of dragging segment k to the pointer position.
      // Middle segments simply move. Dragging the first or last segment keeps a short
      // stub attached to the start / end point and adds a new segment after it, so the
      // route grows (and new handles appear) while the start / end points stay put.
      static dragElbowSegment(obj, k, pointerX, pointerY) {
        const STUB_LENGTH = 24;
        const tracks = MathUtils.getElbowTracks(obj);
        const count = tracks.length + 2;
        const dir = obj.elbowDir === 'v' ? 'v' : 'h';
        const horizontal = MathUtils.isElbowSegmentHorizontal(obj, k);
        const target = horizontal ? pointerY : pointerX;
        const unchanged = { elbowDir: dir, elbowTracks: tracks };

        // Middle segment: just move it
        if (k > 0 && k < count - 1) {
          tracks[k - 1] = target;
          return unchanged;
        }

        if (k === 0) {
          const current = horizontal ? obj.y1 : obj.x1;
          if (Math.abs(target - current) < 1) return unchanged;
          // Stub leaves the start point in the segment's original direction
          const origin = horizontal ? obj.x1 : obj.y1;
          const heading = Math.sign(tracks[0] - origin) || 1;
          const stub = Math.min(STUB_LENGTH, Math.abs(tracks[0] - origin) / 2) || STUB_LENGTH;
          return { elbowDir: dir, elbowTracks: [origin + heading * stub, target].concat(tracks) };
        }

        const current = horizontal ? obj.y2 : obj.x2;
        if (Math.abs(target - current) < 1) return unchanged;
        // Stub enters the end point in the segment's original direction
        const end = horizontal ? obj.x2 : obj.y2;
        const lastTrack = tracks[tracks.length - 1];
        const heading = Math.sign(end - lastTrack) || 1;
        const stub = Math.min(STUB_LENGTH, Math.abs(end - lastTrack) / 2) || STUB_LENGTH;
        return { elbowDir: dir, elbowTracks: tracks.concat([target, end - heading * stub]) };
      }

      // Apply a transform to the stored middle-segment positions
      // (used when a connector is moved, resized, duplicated, pasted or flipped).
      static mapElbowTracks(obj, mapX, mapY) {
        if (!obj.elbowTracks || obj.elbowTracks.length === 0) return obj.elbowTracks;
        return obj.elbowTracks.map((value, i) =>
          MathUtils.isElbowSegmentHorizontal(obj, i + 1) ? mapY(value) : mapX(value));
      }

      // Polyline with small rounded corners.
      static buildRoundedPath(points, maxRadius = 12) {
        const p = points.filter((pt, i) => i === 0 || pt.x !== points[i - 1].x || pt.y !== points[i - 1].y);
        if (p.length < 2) return `M ${p[0].x} ${p[0].y}`;
        let d = `M ${p[0].x} ${p[0].y}`;
        for (let i = 1; i < p.length - 1; i++) {
          const prev = p[i - 1], cur = p[i], next = p[i + 1];
          const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
          const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
          const r = Math.min(maxRadius, lenIn / 2, lenOut / 2);
          if (r < 1) {
            d += ` L ${cur.x} ${cur.y}`;
          } else {
            const inX = Math.sign(cur.x - prev.x), inY = Math.sign(cur.y - prev.y);
            const outX = Math.sign(next.x - cur.x), outY = Math.sign(next.y - cur.y);
            d += ` L ${cur.x - inX * r} ${cur.y - inY * r} Q ${cur.x} ${cur.y} ${cur.x + outX * r} ${cur.y + outY * r}`;
          }
        }
        const last = p[p.length - 1];
        return d + ` L ${last.x} ${last.y}`;
      }

      /* ----------------------------------------------------------------------
         AUTO ELBOW ROUTER (Miro / Lucidchart style)
         The route is calculated from the SIDE of each shape the connector is attached
         to: it always leaves / enters a shape perpendicular to that edge (so the
         arrowhead points straight into the shape), never cuts through the attached
         shapes, and uses the fewest bends. The result is stored as elbowDir +
         elbowTracks, so handles, dragging, rendering and export all keep working.
         ---------------------------------------------------------------------- */
      static getShapeRect(shape) {
        if (!shape) return null;
        if (shape.bounds) return { minX: shape.bounds.minX, minY: shape.bounds.minY, maxX: shape.bounds.maxX, maxY: shape.bounds.maxY };
        const x = shape.x || 0, y = shape.y || 0, w = shape.width || 0, h = shape.height || 0;
        return { minX: x, minY: y, maxX: x + w, maxY: y + h };
      }

      // Which edge of the shape a connection point sits on: 'top' | 'right' | 'bottom' | 'left'
      static getConnectionSide(shape, pointId, pt) {
        if (!shape.rotation && (pointId === 'top' || pointId === 'right' || pointId === 'bottom' || pointId === 'left')) return pointId;
        const r = MathUtils.getShapeRect(shape);
        const cx = (r.minX + r.maxX) / 2, cy = (r.minY + r.maxY) / 2;
        const w = Math.max(1, r.maxX - r.minX), h = Math.max(1, r.maxY - r.minY);
        const dx = (pt.x - cx) / w, dy = (pt.y - cy) / h;
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
        return dy > 0 ? 'bottom' : 'top';
      }

      // Shortest orthogonal route. p1 / p2 are the connector end points, side1 / side2 the
      // edge each is attached to (null = free end), rect1 / rect2 the shapes to avoid.
      // Returns the list of corner points (p1 ... p2), collinear points removed.
      static findElbowRoute(p1, p2, side1, side2, rect1, rect2, gap = 20, avoid = true) {
        const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
        const SIDE_DIR = { top: 0, right: 1, bottom: 2, left: 3 };
        const d1 = side1 ? SIDE_DIR[side1] : -1;
        const d2 = side2 ? SIDE_DIR[side2] : -1;

        // When two facing sides are very close, shrink the stubs so they don't cross
        let g1 = gap, g2 = gap;
        if (d1 >= 0 && d2 >= 0 && (d1 + 2) % 4 === d2) {
          const sep = d1 % 2 === 1 ? (p2.x - p1.x) * DIRS[d1][0] : (p2.y - p1.y) * DIRS[d1][1];
          if (sep > 0 && sep < 2 * gap) { g1 = g2 = Math.max(2, sep / 2); }
        }
        const stubPoint = (p, d, rect, g) => {
          if (d < 0) return { x: p.x, y: p.y };
          if (!rect) rect = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
          if (d === 0) return { x: p.x, y: Math.min(rect.minY, p.y) - g };
          if (d === 2) return { x: p.x, y: Math.max(rect.maxY, p.y) + g };
          if (d === 3) return { x: Math.min(rect.minX, p.x) - g, y: p.y };
          return { x: Math.max(rect.maxX, p.x) + g, y: p.y };
        };
        const S = stubPoint(p1, d1, rect1, g1);
        const E = stubPoint(p2, d2, rect2, g2);

        // Candidate grid lines
        const xsSet = new Set(), ysSet = new Set();
        const addX = (v) => xsSet.add(Math.round(v * 100) / 100);
        const addY = (v) => ysSet.add(Math.round(v * 100) / 100);
        [p1, p2, S, E].forEach(p => { addX(p.x); addY(p.y); });
        addX((S.x + E.x) / 2); addY((S.y + E.y) / 2);
        const rects = [];
        if (avoid && d1 >= 0 && rect1) rects.push(rect1);
        if (avoid && d2 >= 0 && rect2) rects.push(rect2);
        for (const r of rects) {
          addX(r.minX - gap); addX(r.maxX + gap); addY(r.minY - gap); addY(r.maxY + gap);
        }
        if (rects.length === 2) {
          for (const a of [rects[0].minX, rects[0].maxX]) for (const b of [rects[1].minX, rects[1].maxX]) addX((a + b) / 2);
          for (const a of [rects[0].minY, rects[0].maxY]) for (const b of [rects[1].minY, rects[1].maxY]) addY((a + b) / 2);
        }
        const xs = Array.from(xsSet).sort((a, b) => a - b);
        const ys = Array.from(ysSet).sort((a, b) => a - b);
        const xi = (v) => xs.indexOf(Math.round(v * 100) / 100);
        const yi = (v) => ys.indexOf(Math.round(v * 100) / 100);

        // A segment may touch a shape only at a single point (the connection point itself)
        const EPS = 0.01;
        const blocked = (ax, ay, bx, by) => {
          for (const r of rects) {
            if (ay === by) { // horizontal
              if (ay < r.minY - EPS || ay > r.maxY + EPS) continue;
              if (Math.min(Math.max(ax, bx), r.maxX) - Math.max(Math.min(ax, bx), r.minX) > EPS) return true;
            } else {         // vertical
              if (ax < r.minX - EPS || ax > r.maxX + EPS) continue;
              if (Math.min(Math.max(ay, by), r.maxY) - Math.max(Math.min(ay, by), r.minY) > EPS) return true;
            }
          }
          return false;
        };

        const startI = xi(p1.x), startJ = yi(p1.y), endI = xi(p2.x), endJ = yi(p2.y);
        const BEND = 24;
        // state = (i, j, heading) ; heading 4 = none yet
        const key = (i, j, h) => (i * ys.length + j) * 5 + h;
        const dist = new Map(), prev = new Map();
        const open = [{ c: 0, i: startI, j: startJ, h: 4 }];
        dist.set(key(startI, startJ, 4), 0);
        let goalKey = null;

        while (open.length) {
          let bi = 0;
          for (let k = 1; k < open.length; k++) if (open[k].c < open[bi].c) bi = k;
          const cur = open.splice(bi, 1)[0];
          const ck = key(cur.i, cur.j, cur.h);
          if (cur.c > (dist.get(ck) ?? Infinity)) continue;
          if (cur.i === endI && cur.j === endJ && cur.h !== 4) { goalKey = ck; break; }

          for (let nd = 0; nd < 4; nd++) {
            if (cur.h !== 4 && nd === (cur.h + 2) % 4) continue;           // no U-turns
            if (cur.i === startI && cur.j === startJ && cur.h === 4 && d1 >= 0 && nd !== d1) continue; // leave start perpendicular
            const ni = cur.i + DIRS[nd][0], nj = cur.j + DIRS[nd][1];
            if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ys.length) continue;
            if (ni === endI && nj === endJ && d2 >= 0 && nd !== (d2 + 2) % 4) continue;  // enter end perpendicular
            const ax = xs[cur.i], ay = ys[cur.j], bx = xs[ni], by = ys[nj];
            const isStartStub = cur.i === startI && cur.j === startJ && cur.h === 4;
            const isEndStub = ni === endI && nj === endJ && d2 >= 0;
            if (!isStartStub && !isEndStub && blocked(ax, ay, bx, by)) continue;
            let bendCost = 0;
            if (cur.h !== 4 && cur.h !== nd) {
              // tie-break: prefer the new segment to sit halfway between the two stub points
              bendCost = BEND + 0.01 * (nd % 2 === 0 ? Math.abs(xs[cur.i] - (S.x + E.x) / 2) : Math.abs(ys[cur.j] - (S.y + E.y) / 2));
            }
            const nc = cur.c + Math.abs(bx - ax) + Math.abs(by - ay) + bendCost;
            const nk = key(ni, nj, nd);
            if (nc < (dist.get(nk) ?? Infinity)) {
              dist.set(nk, nc); prev.set(nk, ck);
              open.push({ c: nc, i: ni, j: nj, h: nd });
            }
          }
        }
        if (goalKey === null) return null;

        const pts = [];
        for (let k = goalKey; k !== undefined; k = prev.get(k)) {
          const cell = Math.floor(k / 5);
          pts.push({ x: xs[Math.floor(cell / ys.length)], y: ys[cell % ys.length] });
        }
        pts.reverse();
        // drop duplicate + collinear points
        const out = [];
        for (const p of pts) {
          if (out.length && out[out.length - 1].x === p.x && out[out.length - 1].y === p.y) continue;
          while (out.length >= 2) {
            const a = out[out.length - 2], b = out[out.length - 1];
            if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop(); else break;
          }
          out.push(p);
        }
        return out;
      }

      // Turn a list of orthogonal corner points into { elbowDir, elbowTracks }
      static routePointsToElbow(pts) {
        const n = pts.length - 1;
        if (n < 1) return null;
        const horizontal = (k) => pts[k].y === pts[k + 1].y;
        const dir = horizontal(0) ? 'h' : 'v';
        if (n === 1) {
          return { elbowDir: dir, elbowTracks: [dir === 'h' ? (pts[0].x + pts[1].x) / 2 : (pts[0].y + pts[1].y) / 2] };
        }
        if (n === 2) {
          return { elbowDir: dir, elbowTracks: [dir === 'h' ? pts[2].x : pts[2].y] };
        }
        const tracks = [];
        for (let k = 1; k <= n - 2; k++) tracks.push(horizontal(k) ? pts[k].y : pts[k].x);
        return { elbowDir: dir, elbowTracks: tracks };
      }

      // True when the connector should be re-routed automatically
      static isElbowAuto(obj) {
        if (obj.arrowType !== 'elbow') return false;
        if (obj.elbowAuto === true) return true;
        if (obj.elbowAuto === false) return false;
        return !(obj.elbowTracks && obj.elbowTracks.length > 0);
      }

      // Re-route a connector from its bindings. Returns true when the route changed.
      static autoRouteElbow(obj, objectManager, startBinding, endBinding) {
        if (obj.arrowType !== 'elbow') return false;
        const sb = startBinding !== undefined ? startBinding : obj.startBinding;
        const eb = endBinding !== undefined ? endBinding : obj.endBinding;
        const sShape = sb && sb.objectId ? objectManager.getObject(sb.objectId) : null;
        const eShape = eb && eb.objectId ? objectManager.getObject(eb.objectId) : null;
        if (!sShape && !eShape) return false;

        const p1 = { x: obj.x1 || 0, y: obj.y1 || 0 }, p2 = { x: obj.x2 || 0, y: obj.y2 || 0 };
        const r1 = sShape ? MathUtils.getShapeRect(sShape) : null;
        const r2 = eShape ? MathUtils.getShapeRect(eShape) : null;
        const side1 = sShape ? MathUtils.getConnectionSide(sShape, sb.pointId, p1) : null;
        const side2 = eShape ? MathUtils.getConnectionSide(eShape, eb.pointId, p2) : null;

        // Overlapping shapes can leave no clean route: retry without obstacle avoidance
        const pts = MathUtils.findElbowRoute(p1, p2, side1, side2, r1, r2) ||
                    MathUtils.findElbowRoute(p1, p2, side1, side2, r1, r2, 20, false);
        if (!pts) return false;
        const route = MathUtils.routePointsToElbow(pts);
        if (!route) return false;

        const same = obj.elbowDir === route.elbowDir && obj.elbowAuto === true && obj.elbowTracks &&
          obj.elbowTracks.length === route.elbowTracks.length &&
          obj.elbowTracks.every((v, i) => Math.abs(v - route.elbowTracks[i]) < 0.01);
        obj.elbowDir = route.elbowDir;
        obj.elbowTracks = route.elbowTracks;
        obj.elbowAuto = true;
        return !same;
      }

      // Makes the first / last segment of an elbow route leave / enter its connection
      // point perpendicular to the shape edge (top/bottom => vertical, left/right => horizontal),
      // so the arrowhead (orient="auto") points along the edge normal.
      // Only the drawn path changes; the logical route used for handles stays untouched.
      static applyElbowSides(points, startSide, endSide, stub = 24) {
        return MathUtils.applyElbowSidesTagged(points, startSide, endSide, stub).map(p => ({ x: p.x, y: p.y }));
      }

      // Same as applyElbowSides, but every returned point carries `seg`: the logical segment
      // index that starts at that point (-1 for the short entry/exit stubs). This lets handles,
      // hit-testing and labels sit exactly on the line that is actually drawn.
      static applyElbowSidesTagged(points, startSide, endSide, stub = 24) {
        const vertical = (id) => id === 'top' || id === 'bottom';
        const horizontal = (id) => id === 'left' || id === 'right';
        const outward = (id) => (id === 'top' || id === 'left') ? -1 : 1;
        const pts = points.map((p, i) => ({ x: p.x, y: p.y, seg: i }));
        if (pts.length < 3) return pts;

        // END: fix the last segment
        if (vertical(endSide) || horizontal(endSide)) {
          const n = pts.length;
          const end = pts[n - 1], prev = pts[n - 2];
          const lastIsHoriz = prev.y === end.y && prev.x !== end.x;
          const lastIsVert = prev.x === end.x && prev.y !== end.y;
          if (vertical(endSide) && lastIsHoriz) {
            const ys = end.y + outward(endSide) * stub;
            pts.splice(n - 2, 1, { x: prev.x, y: ys, seg: prev.seg }, { x: end.x, y: ys, seg: -1 });
          } else if (horizontal(endSide) && lastIsVert) {
            const xs = end.x + outward(endSide) * stub;
            pts.splice(n - 2, 1, { x: xs, y: prev.y, seg: prev.seg }, { x: xs, y: end.y, seg: -1 });
          }
        }

        // START: fix the first segment
        if (vertical(startSide) || horizontal(startSide)) {
          const start = pts[0], next = pts[1];
          const firstIsHoriz = next.y === start.y && next.x !== start.x;
          const firstIsVert = next.x === start.x && next.y !== start.y;
          if (vertical(startSide) && firstIsHoriz) {
            const ys = start.y + outward(startSide) * stub;
            start.seg = -1;
            pts.splice(1, 1, { x: start.x, y: ys, seg: 0 }, { x: next.x, y: ys, seg: next.seg });
          } else if (horizontal(startSide) && firstIsVert) {
            const xs = start.x + outward(startSide) * stub;
            start.seg = -1;
            pts.splice(1, 1, { x: xs, y: start.y, seg: 0 }, { x: xs, y: next.y, seg: next.seg });
          }
        }
        return pts;
      }

      // Edge id ('top' | 'right' | 'bottom' | 'left') a connector end is attached to.
      // While an end is being dragged, the edge it is snapping to wins over the saved binding.
      static getElbowSide(obj, which) {
        const start = which === 'start';
        const temp = start ? obj._tempStartBinding : obj._tempEndBinding;
        if (temp !== undefined) {
          // End is being dragged: the edge it snaps to (null = free end)
          return temp ? ((start ? obj._tempStartSide : obj._tempEndSide) || temp.pointId) : null;
        }
        const binding = start ? obj.startBinding : obj.endBinding;
        if (!binding) return null;
        return (start ? obj.startSide : obj.endSide) || binding.pointId;
      }

      // Edge a bound connector end really sits on (accounts for rotated shapes), or null.
      static resolveElbowSide(obj, which, objectManager) {
        const binding = which === 'start' ? obj.startBinding : obj.endBinding;
        const shape = binding && binding.objectId ? objectManager.getObject(binding.objectId) : null;
        if (!shape) return null;
        const pt = which === 'start' ? { x: obj.x1, y: obj.y1 } : { x: obj.x2, y: obj.y2 };
        return MathUtils.getConnectionSide(shape, binding.pointId, pt);
      }

      // Stores the real edge of each bound end, so the drawn line (and its arrowhead) always
      // leaves / enters perpendicular to the edge it is attached to. Returns true if changed.
      static syncElbowSides(obj, objectManager) {
        let changed = false;
        for (const which of ['start', 'end']) {
          const key = which === 'start' ? 'startSide' : 'endSide';
          const side = MathUtils.resolveElbowSide(obj, which, objectManager);
          if (side) {
            if (obj[key] !== side) { obj[key] = side; changed = true; }
          } else if (obj[key] !== undefined) {
            delete obj[key]; changed = true;
          }
        }
        return changed;
      }

      // For a hand-edited route: makes sure each attached end still leaves / enters its edge from
      // the outside (so the arrowhead points into the shape). Only the segment next to that end
      // is adjusted; a route that is already valid is left untouched. Returns true if changed.
      static repairElbowEnds(obj, objectManager) {
        let changed = false;
        for (const which of ['start', 'end']) {
          const side = MathUtils.resolveElbowSide(obj, which, objectManager);
          if (!side) continue;
          const route = MathUtils.retargetElbowEnd(obj, obj, which, side);
          const same = route.elbowDir === (obj.elbowDir === 'v' ? 'v' : 'h') && obj.elbowTracks &&
            route.elbowTracks.length === obj.elbowTracks.length &&
            route.elbowTracks.every((v, i) => Math.abs(v - obj.elbowTracks[i]) < 0.01);
          if (!same) {
            obj.elbowDir = route.elbowDir;
            obj.elbowTracks = route.elbowTracks;
            changed = true;
          }
        }
        return changed;
      }

      // Moves one end of an elbow connector to another edge / position while KEEPING the rest of
      // the route. Only the segment next to the moved end is adjusted (and one bend is added if the
      // line would otherwise enter the edge sideways). `init` is the connector before the drag,
      // `obj` already holds the new end coordinates, `side` is the edge snapped to (or null).
      static retargetElbowEnd(obj, init, which, side) {
        const GAP = 24, MIN = 12;
        const isV = (id) => id === 'top' || id === 'bottom';
        let dir = init.elbowDir === 'v' ? 'v' : 'h';
        const tracks = MathUtils.getElbowTracks(init);
        if (side) {
          const o = (side === 'top' || side === 'left') ? -1 : 1; // outward direction of the edge
          if (which === 'end') {
            const lastHoriz = MathUtils.isElbowSegmentHorizontal({ elbowDir: dir }, tracks.length + 1);
            if (lastHoriz === isV(side)) {
              // Would enter the edge sideways: add a bend just outside the edge
              tracks.push(isV(side) ? obj.y2 + o * GAP : obj.x2 + o * GAP);
            } else {
              const axis = lastHoriz ? obj.x2 : obj.y2;
              const last = tracks.length - 1;
              if ((tracks[last] - axis) * o < MIN) tracks[last] = axis + o * GAP;
            }
          } else {
            const firstHoriz = dir === 'h';
            if (firstHoriz === isV(side)) {
              // Would leave the edge sideways: prepend a bend just outside the edge
              tracks.unshift(isV(side) ? obj.y1 + o * GAP : obj.x1 + o * GAP);
              dir = firstHoriz ? 'v' : 'h';
            } else {
              const axis = firstHoriz ? obj.x1 : obj.y1;
              if ((tracks[0] - axis) * o < MIN) tracks[0] = axis + o * GAP;
            }
          }
        }
        return { elbowDir: dir, elbowTracks: tracks };
      }

      // Corner points of the route exactly as it is DRAWN (including entry/exit stubs).
      static getElbowDrawnPoints(obj) {
        const pts = MathUtils.getElbowPoints(obj);
        return MathUtils.applyElbowSidesTagged(pts,
          MathUtils.getElbowSide(obj, 'start'),
          MathUtils.getElbowSide(obj, 'end'));
      }

      // Where the drag handle of logical segment k sits on the drawn line: { a, b } endpoints.
      static getElbowHandleSegment(obj, k, drawn) {
        const pts = drawn || MathUtils.getElbowDrawnPoints(obj);
        for (let i = 0; i < pts.length - 1; i++) {
          if (pts[i].seg === k) return { a: pts[i], b: pts[i + 1] };
        }
        const logical = MathUtils.getElbowPoints(obj);
        return logical[k + 1] ? { a: logical[k], b: logical[k + 1] } : null;
      }

      static getArrowPathD(arrowType = 'single', x1 = 0, y1 = 0, x2 = 0, y2 = 0, cx, cy, elbowDir = 'h', elbowTracks, startSide, endSide) {
        if (arrowType === 'elbow') {
          const pts = MathUtils.getElbowPoints({ x1, y1, x2, y2, cx, cy, elbowDir, elbowTracks });
          return MathUtils.buildRoundedPath(MathUtils.applyElbowSides(pts, startSide, endSide));
        } else {
          const defaultCx = cx !== undefined ? cx : (x1 + x2) / 2;
          const defaultCy = cy !== undefined ? cy : (y1 + y2) / 2;
          return `M ${x1} ${y1} Q ${defaultCx} ${defaultCy} ${x2} ${y2}`;
        }
      }

      // Returns the effective inner text area (x offset, y offset, width, height) for a shape type
      // so that text stays within the visible boundary of non-rectangular shapes.
      static getShapeTextInset(shapeType, x, y, width, height) {
        const w = width, h = height;
        switch (shapeType) {
          case 'triangle':
            // Triangle: apex at top-center, base at bottom. Safe inner rect is ~50% width, bottom 40% height
            return { x: x + w * 0.25, y: y + h * 0.55, width: w * 0.5, height: h * 0.38 };
          case 'diamond':
            // Diamond: rotated square. Inscribed rect is 50% of each dimension, centered
            return { x: x + w * 0.25, y: y + h * 0.25, width: w * 0.5, height: h * 0.5 };
          case 'parallelogram':
            // Parallelogram: skewed 25% on each side
            return { x: x + w * 0.28, y: y + h * 0.12, width: w * 0.44, height: h * 0.76 };
          case 'star':
            // Star: inner safe area is roughly 38% of each dimension centered
            return { x: x + w * 0.31, y: y + h * 0.31, width: w * 0.38, height: h * 0.38 };
          case 'pentagon':
            // Pentagon: narrower at top, safe inner rect
            return { x: x + w * 0.2, y: y + h * 0.28, width: w * 0.6, height: h * 0.52 };
          case 'hexagon':
            // Hexagon: narrower at left/right edges (25% each side)
            return { x: x + w * 0.18, y: y + h * 0.1, width: w * 0.64, height: h * 0.8 };
          case 'trapezoid':
            // Trapezoid: narrower at top (~10% each side)
            return { x: x + w * 0.15, y: y + h * 0.12, width: w * 0.7, height: h * 0.76 };
          case 'speech_bubble':
            // Speech bubble: main body is top 75%, with 8px padding
            return { x: x + w * 0.08, y: y + h * 0.06, width: w * 0.84, height: h * 0.62 };
          case 'cloud':
            // Cloud: irregular edges, safe inner area is central portion
            return { x: x + w * 0.18, y: y + h * 0.2, width: w * 0.64, height: h * 0.55 };
          case 'cylinder':
            // Cylinder: top/bottom have ellipse caps (~18% height each)
            return { x: x + w * 0.08, y: y + h * 0.22, width: w * 0.84, height: h * 0.56 };
          case 'starburst':
            // Starburst: spiky, safe inner area ~40% centered
            return { x: x + w * 0.3, y: y + h * 0.3, width: w * 0.4, height: h * 0.4 };
          case 'circle':
          case 'ellipse':
            // Ellipse: inscribed rect is 70% of each dimension
            return { x: x + w * 0.15, y: y + h * 0.15, width: w * 0.7, height: h * 0.7 };
          default:
            // rectangle and others: full area minus standard padding
            return { x: x + 8, y: y + 8, width: w - 16, height: h - 16 };
        }
      }

      static getShapePathD(shapeType, x, y, width, height) {
        const w = Math.max(width, 2);
        const h = Math.max(height, 2);
        const cx = x + w / 2;
        const cy = y + h / 2;

        switch (shapeType) {
          case 'rectangle':
            return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;

          case 'circle':
            return `M ${cx} ${y} A ${w / 2} ${h / 2} 0 0 0 ${cx} ${y + h} A ${w / 2} ${h / 2} 0 0 0 ${cx} ${y} Z`;

          case 'diamond':
            return `M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`;

          case 'triangle':
            return `M ${cx} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;

          case 'star': {
            const rx = w / 2;
            const ry = h / 2;
            const innerRx = rx * 0.4;
            const innerRy = ry * 0.4;
            let d = '';
            for (let i = 0; i < 10; i++) {
              const angle = (i * Math.PI) / 5 - Math.PI / 2;
              const rX = i % 2 === 0 ? rx : innerRx;
              const rY = i % 2 === 0 ? ry : innerRy;
              const px = cx + rX * Math.cos(angle);
              const py = cy + rY * Math.sin(angle);
              d += (i === 0 ? 'M ' : 'L ') + px.toFixed(2) + ' ' + py.toFixed(2) + ' ';
            }
            return d + 'Z';
          }

          case 'hexagon':
            return `M ${x + w * 0.25} ${y} L ${x + w * 0.75} ${y} L ${x + w} ${cy} L ${x + w * 0.75} ${y + h} L ${x + w * 0.25} ${y + h} L ${x} ${cy} Z`;

          case 'pentagon': {
            const rx = w / 2;
            const ry = h / 2;
            let d = '';
            for (let i = 0; i < 5; i++) {
              const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
              const px = cx + rx * Math.cos(angle);
              const py = cy + ry * Math.sin(angle);
              d += (i === 0 ? 'M ' : 'L ') + px.toFixed(2) + ' ' + py.toFixed(2) + ' ';
            }
            return d + 'Z';
          }

          case 'parallelogram':
            return `M ${x + w * 0.25} ${y} L ${x + w} ${y} L ${x + w * 0.75} ${y + h} L ${x} ${y + h} Z`;

          case 'cylinder': {
            const ry = Math.min(h * 0.18, 25);
            return `M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} L ${x + w} ${y + h - ry} A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x} ${y + ry}`;
          }

          case 'speech_bubble': {
            const bodyH = h * 0.75;
            const r = Math.min(10, w * 0.1, bodyH * 0.2);
            return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + bodyH - r} Q ${x + w} ${y + bodyH} ${x + w - r} ${y + bodyH} L ${x + w * 0.45} ${y + bodyH} L ${x + w * 0.2} ${y + h} L ${x + w * 0.28} ${y + bodyH} L ${x + r} ${y + bodyH} Q ${x} ${y + bodyH} ${x} ${y + bodyH - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
          }

          case 'cloud':
            return `M ${x + w * 0.25} ${y + h * 0.7} ` +
                   `A ${w * 0.2} ${h * 0.2} 0 0 1 ${x + w * 0.15} ${y + h * 0.35} ` +
                   `A ${w * 0.25} ${h * 0.25} 0 0 1 ${x + w * 0.5} ${y + h * 0.2} ` +
                   `A ${w * 0.25} ${h * 0.25} 0 0 1 ${x + w * 0.85} ${y + h * 0.4} ` +
                   `A ${w * 0.18} ${h * 0.18} 0 0 1 ${x + w * 0.8} ${y + h * 0.75} ` +
                   `A ${w * 0.25} ${h * 0.18} 0 0 1 ${x + w * 0.25} ${y + h * 0.7} Z`;

          case 'heart':
            return `M ${cx} ${y + h * 0.82} ` +
                   `C ${x + w * 0.1} ${y + h * 0.55}, ${x} ${y + h * 0.28}, ${x + w * 0.25} ${y + h * 0.1} ` +
                   `C ${x + w * 0.4} ${y}, ${cx} ${y + h * 0.22}, ${cx} ${y + h * 0.22} ` +
                   `C ${cx} ${y + h * 0.22}, ${x + w * 0.6} ${y}, ${x + w * 0.75} ${y + h * 0.1} ` +
                   `C ${x + w} ${y + h * 0.28}, ${x + w * 0.9} ${y + h * 0.55}, ${cx} ${y + h * 0.82} Z`;

          case 'plus': {
            const w3 = w / 3;
            const h3 = h / 3;
            return `M ${x + w3} ${y} L ${x + 2 * w3} ${y} L ${x + 2 * w3} ${y + h3} L ${x + w} ${y + h3} L ${x + w} ${y + 2 * h3} L ${x + 2 * w3} ${y + 2 * h3} L ${x + 2 * w3} ${y + h} L ${x + w3} ${y + h} L ${x + w3} ${y + 2 * h3} L ${x} ${y + 2 * h3} L ${x} ${y + h3} L ${x + w3} ${y + h3} Z`;
          }

          case 'arrow_right':
            return `M ${x} ${y + h * 0.25} L ${x + w * 0.6} ${y + h * 0.25} L ${x + w * 0.6} ${y} L ${x + w} ${cy} L ${x + w * 0.6} ${y + h} L ${x + w * 0.6} ${y + h * 0.75} L ${x} ${y + h * 0.75} Z`;

          case 'arrow_left':
            return `M ${x} ${cy} L ${x + w * 0.4} ${y} L ${x + w * 0.4} ${y + h * 0.25} L ${x + w} ${y + h * 0.25} L ${x + w} ${y + h * 0.75} L ${x + w * 0.4} ${y + h * 0.75} L ${x + w * 0.4} ${y + h} Z`;

          case 'chevron':
            return `M ${x} ${y} L ${x + w * 0.75} ${y} L ${x + w} ${cy} L ${x + w * 0.75} ${y + h} L ${x} ${y + h} L ${x + w * 0.25} ${cy} Z`;

          case 'trapezoid':
            return `M ${x + w * 0.2} ${y} L ${x + w * 0.8} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;

          case 'octagon':
            return `M ${x + w * 0.3} ${y} L ${x + w * 0.7} ${y} L ${x + w} ${y + h * 0.3} L ${x + w} ${y + h * 0.7} L ${x + w * 0.7} ${y + h} L ${x + w * 0.3} ${y + h} L ${x} ${y + h * 0.7} L ${x} ${y + h * 0.3} Z`;

          case 'document':
            return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h * 0.8} Q ${x + w * 0.75} ${y + h * 0.65} ${cx} ${y + h * 0.8} Q ${x + w * 0.25} ${y + h * 0.95} ${x} ${y + h * 0.8} Z`;

          case 'lightning':
            return `M ${x + w * 0.55} ${y} L ${x + w * 0.15} ${y + h * 0.55} L ${x + w * 0.48} ${y + h * 0.55} L ${x + w * 0.4} ${y + h} L ${x + w * 0.85} ${y + h * 0.42} L ${x + w * 0.52} ${y + h * 0.42} Z`;

          case 'cross_x': {
            const w4 = w / 4;
            const h4 = h / 4;
            return `M ${x + w4} ${y} L ${cx} ${y + h4} L ${x + w - w4} ${y} L ${x + w} ${y + h4} L ${x + w - w4} ${cy} L ${x + w} ${y + h - h4} L ${x + w - w4} ${y + h} L ${cx} ${y + h - h4} L ${x + w4} ${y + h} L ${x} ${y + h - h4} L ${x + w4} ${cy} L ${x} ${y + h4} Z`;
          }

          case 'arrow_up':
            return `M ${cx} ${y} L ${x + w * 0.75} ${y + h * 0.4} L ${x + w * 0.6} ${y + h * 0.4} L ${x + w * 0.6} ${y + h} L ${x + w * 0.4} ${y + h} L ${x + w * 0.4} ${y + h * 0.4} L ${x + w * 0.25} ${y + h * 0.4} Z`;

          case 'arrow_double':
            return `M ${x} ${cy} L ${x + w * 0.25} ${y} L ${x + w * 0.25} ${y + h * 0.3} L ${x + w * 0.75} ${y + h * 0.3} L ${x + w * 0.75} ${y} L ${x + w} ${cy} L ${x + w * 0.75} ${y + h} L ${x + w * 0.75} ${y + h * 0.7} L ${x + w * 0.25} ${y + h * 0.7} L ${x + w * 0.25} ${y + h} Z`;

          case 'stadium': {
            const r = Math.min(w / 2, h / 2);
            return `M ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} L ${x + r} ${y + h} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
          }

          case 'ribbon':
            return `M ${x} ${y} L ${x + w} ${y} L ${x + w * 0.88} ${cy} L ${x + w} ${y + h} L ${x} ${y + h} L ${x + w * 0.12} ${cy} Z`;

          case 'starburst': {
            const rx = w / 2;
            const ry = h / 2;
            let d = '';
            const numPoints = 12;
            for (let i = 0; i < numPoints * 2; i++) {
              const angle = (i * Math.PI) / numPoints - Math.PI / 2;
              const rX = i % 2 === 0 ? rx : rx * 0.75;
              const rY = i % 2 === 0 ? ry : ry * 0.75;
              const px = cx + rX * Math.cos(angle);
              const py = cy + rY * Math.sin(angle);
              d += (i === 0 ? 'M ' : 'L ') + px.toFixed(2) + ' ' + py.toFixed(2) + ' ';
            }
            return d + 'Z';
          }

          case 'thought_bubble':
            return `M ${x + w * 0.25} ${y + h * 0.65} ` +
                   `A ${w * 0.18} ${h * 0.18} 0 0 1 ${x + w * 0.18} ${y + h * 0.35} ` +
                   `A ${w * 0.22} ${h * 0.22} 0 0 1 ${x + w * 0.5} ${y + h * 0.15} ` +
                   `A ${w * 0.22} ${h * 0.22} 0 0 1 ${x + w * 0.82} ${y + h * 0.35} ` +
                   `A ${w * 0.18} ${h * 0.18} 0 0 1 ${x + w * 0.8} ${y + h * 0.65} ` +
                   `A ${w * 0.22} ${h * 0.22} 0 0 1 ${x + w * 0.25} ${y + h * 0.65} Z`;

          case 'funnel':
            return `M ${x} ${y} L ${x + w} ${y} L ${x + w * 0.62} ${y + h * 0.55} L ${x + w * 0.62} ${y + h} L ${x + w * 0.38} ${y + h} L ${x + w * 0.38} ${y + h * 0.55} Z`;

          case 'cube':
            return `M ${cx} ${y} L ${x + w} ${y + h * 0.25} L ${x + w} ${y + h * 0.75} L ${cx} ${y + h} L ${x} ${y + h * 0.75} L ${x} ${y + h * 0.25} Z ` +
                   `M ${cx} ${cy} L ${x} ${y + h * 0.25} M ${cx} ${cy} L ${x + w} ${y + h * 0.25} M ${cx} ${cy} L ${cx} ${y + h}`;

          case 'graduated_cylinder':
            return `M ${x + w * 0.3} ${y} L ${x + w * 0.7} ${y} M ${x + w * 0.35} ${y} L ${x + w * 0.35} ${y + h * 0.9} Q ${x + w * 0.35} ${y + h} ${x + w * 0.5} ${y + h} Q ${x + w * 0.65} ${y + h} ${x + w * 0.65} ${y + h * 0.9} L ${x + w * 0.65} ${y} M ${x + w * 0.35} ${y + h * 0.2} L ${x + w * 0.52} ${y + h * 0.2} M ${x + w * 0.35} ${y + h * 0.38} L ${x + w * 0.58} ${y + h * 0.38} M ${x + w * 0.35} ${y + h * 0.56} L ${x + w * 0.52} ${y + h * 0.56} M ${x + w * 0.35} ${y + h * 0.74} L ${x + w * 0.58} ${y + h * 0.74} M ${x + w * 0.35} ${y + h * 0.6} C ${x + w * 0.45} ${y + h * 0.63}, ${x + w * 0.55} ${y + h * 0.57}, ${x + w * 0.65} ${y + h * 0.6}`;

          case 'erlenmeyer_flask':
            return `M ${x + w * 0.38} ${y} L ${x + w * 0.62} ${y} L ${x + w * 0.62} ${y + h * 0.22} L ${x + w * 0.92} ${y + h * 0.86} Q ${x + w} ${y + h} ${x + w * 0.84} ${y + h} L ${x + w * 0.16} ${y + h} Q ${x} ${y + h} ${x + w * 0.08} ${y + h * 0.86} L ${x + w * 0.38} ${y + h * 0.22} Z M ${x + w * 0.32} ${y} L ${x + w * 0.68} ${y} M ${x + w * 0.18} ${y + h * 0.68} L ${x + w * 0.82} ${y + h * 0.68}`;

          case 'beaker':
            return `M ${x + w * 0.12} ${y} L ${x + w * 0.05} ${y} L ${x + w * 0.15} ${y + h * 0.1} L ${x + w * 0.15} ${y + h * 0.92} Q ${x + w * 0.15} ${y + h} ${x + w * 0.25} ${y + h} L ${x + w * 0.75} ${y + h} Q ${x + w * 0.85} ${y + h} ${x + w * 0.85} ${y + h * 0.92} L ${x + w * 0.85} ${y + h * 0.1} L ${x + w * 0.92} ${y + h * 0.04} L ${x + w * 0.85} ${y} M ${x + w * 0.15} ${y + h * 0.1} L ${x + w * 0.85} ${y + h * 0.1} M ${x + w * 0.15} ${y + h * 0.3} L ${x + w * 0.32} ${y + h * 0.3} M ${x + w * 0.15} ${y + h * 0.5} L ${x + w * 0.38} ${y + h * 0.5} M ${x + w * 0.15} ${y + h * 0.7} L ${x + w * 0.32} ${y + h * 0.7}`;

          case 'test_tube': {
            const tw = w * 0.32;
            const tx = cx - tw / 2;
            const tr = tw / 2;
            return `M ${tx - w * 0.08} ${y} L ${tx + tw + w * 0.08} ${y} M ${tx} ${y + h * 0.06} L ${tx} ${y + h - tr} A ${tr} ${tr} 0 0 0 ${tx + tw} ${y + h - tr} L ${tx + tw} ${y + h * 0.06} M ${tx} ${y + h * 0.45} L ${tx + tw} ${y + h * 0.45}`;
          }

          case 'dna':
            return `M ${x + w * 0.2} ${y} C ${x + w * 0.8} ${y + h * 0.25}, ${x + w * 0.8} ${y + h * 0.75}, ${x + w * 0.2} ${y + h} M ${x + w * 0.8} ${y} C ${x + w * 0.2} ${y + h * 0.25}, ${x + w * 0.2} ${y + h * 0.75}, ${x + w * 0.8} ${y + h} M ${x + w * 0.32} ${y + h * 0.15} L ${x + w * 0.68} ${y + h * 0.15} M ${x + w * 0.45} ${y + h * 0.35} L ${x + w * 0.55} ${y + h * 0.35} M ${x + w * 0.32} ${y + h * 0.5} L ${x + w * 0.68} ${y + h * 0.5} M ${x + w * 0.45} ${y + h * 0.65} L ${x + w * 0.55} ${y + h * 0.65} M ${x + w * 0.32} ${y + h * 0.85} L ${x + w * 0.68} ${y + h * 0.85}`;

          case 'magnet':
            return `M ${x + w * 0.15} ${y + h * 0.88} L ${x + w * 0.15} ${y + h * 0.4} A ${w * 0.35} ${h * 0.35} 0 0 1 ${x + w * 0.85} ${y + h * 0.4} L ${x + w * 0.85} ${y + h * 0.88} L ${x + w * 0.62} ${y + h * 0.88} L ${x + w * 0.62} ${y + h * 0.4} A ${w * 0.12} ${h * 0.12} 0 0 0 ${x + w * 0.38} ${y + h * 0.4} L ${x + w * 0.38} ${y + h * 0.88} Z M ${x + w * 0.15} ${y + h * 0.68} L ${x + w * 0.38} ${y + h * 0.68} M ${x + w * 0.62} ${y + h * 0.68} L ${x + w * 0.85} ${y + h * 0.68}`;

          case 'microscope':
            return `M ${x + w * 0.15} ${y + h * 0.92} L ${x + w * 0.85} ${y + h * 0.92} L ${x + w * 0.85} ${y + h * 0.82} L ${x + w * 0.15} ${y + h * 0.82} Z M ${cx} ${y + h * 0.82} L ${cx} ${y + h * 0.58} M ${x + w * 0.2} ${y + h * 0.58} L ${x + w * 0.8} ${y + h * 0.58} M ${x + w * 0.68} ${y + h * 0.82} C ${x + w * 0.92} ${y + h * 0.42}, ${x + w * 0.8} ${y + h * 0.16}, ${x + w * 0.55} ${y + h * 0.16} M ${x + w * 0.42} ${y + h * 0.08} L ${x + w * 0.62} ${y + h * 0.22} M ${x + w * 0.38} ${y + h * 0.34} L ${x + w * 0.54} ${y + h * 0.5}`;

          case 'battery':
            return `M ${x + w * 0.38} ${y} L ${x + w * 0.62} ${y} L ${x + w * 0.62} ${y + h * 0.1} L ${x + w * 0.38} ${y + h * 0.1} Z M ${x + w * 0.2} ${y + h * 0.1} L ${x + w * 0.8} ${y + h * 0.1} L ${x + w * 0.8} ${y + h} L ${x + w * 0.2} ${y + h} Z M ${cx - w * 0.12} ${y + h * 0.32} L ${cx + w * 0.12} ${y + h * 0.32} M ${cx} ${y + h * 0.2} L ${cx} ${y + h * 0.44} M ${cx - w * 0.12} ${y + h * 0.78} L ${cx + w * 0.12} ${y + h * 0.78}`;

          case 'lightbulb':
            return `M ${cx} ${y + h * 0.08} C ${x + w * 0.82} ${y + h * 0.08}, ${x + w * 0.82} ${y + h * 0.52}, ${x + w * 0.62} ${y + h * 0.65} L ${x + w * 0.62} ${y + h * 0.82} L ${x + w * 0.38} ${y + h * 0.82} L ${x + w * 0.38} ${y + h * 0.65} C ${x + w * 0.18} ${y + h * 0.52}, ${x + w * 0.18} ${y + h * 0.08}, ${cx} ${y + h * 0.08} Z M ${x + w * 0.38} ${y + h * 0.9} L ${x + w * 0.62} ${y + h * 0.9} M ${x + w * 0.42} ${y + h * 0.65} L ${cx} ${y + h * 0.38} L ${x + w * 0.58} ${y + h * 0.65}`;

          case 'gear': {
            const rx = w / 2;
            const ry = h / 2;
            const teeth = 8;
            const toothAngle = (2 * Math.PI) / teeth;
            const outerRx = rx;
            const outerRy = ry;
            const innerRx = rx * 0.74;
            const innerRy = ry * 0.74;
            const holeRx = rx * 0.32;
            const holeRy = ry * 0.32;

            let d = '';
            for (let i = 0; i < teeth; i++) {
              const baseA = i * toothAngle;
              const a0 = baseA - toothAngle * 0.10;
              const a1 = baseA + toothAngle * 0.10;
              const a2 = baseA + toothAngle * 0.32;
              const a3 = baseA + toothAngle * 0.68;

              const p0x = cx + outerRx * Math.cos(a0);
              const p0y = cy + outerRy * Math.sin(a0);
              const p1x = cx + outerRx * Math.cos(a1);
              const p1y = cy + outerRy * Math.sin(a1);
              const p2x = cx + innerRx * Math.cos(a2);
              const p2y = cy + innerRy * Math.sin(a2);
              const p3x = cx + innerRx * Math.cos(a3);
              const p3y = cy + innerRy * Math.sin(a3);

              if (i === 0) {
                d += `M ${p0x.toFixed(2)} ${p0y.toFixed(2)} `;
              } else {
                d += `L ${p0x.toFixed(2)} ${p0y.toFixed(2)} `;
              }
              d += `L ${p1x.toFixed(2)} ${p1y.toFixed(2)} `;
              d += `L ${p2x.toFixed(2)} ${p2y.toFixed(2)} `;
              d += `L ${p3x.toFixed(2)} ${p3y.toFixed(2)} `;
            }
            d += 'Z ';
            d += `M ${(cx + holeRx).toFixed(2)} ${cy.toFixed(2)} A ${holeRx.toFixed(2)} ${holeRy.toFixed(2)} 0 1 0 ${(cx - holeRx).toFixed(2)} ${cy.toFixed(2)} A ${holeRx.toFixed(2)} ${holeRy.toFixed(2)} 0 1 0 ${(cx + holeRx).toFixed(2)} ${cy.toFixed(2)} Z`;
            return d;
          }

          case 'thermometer':
            return `M ${x + w * 0.38} ${y + h * 0.12} A ${w * 0.12} ${h * 0.12} 0 0 1 ${x + w * 0.62} ${y + h * 0.12} L ${x + w * 0.62} ${y + h * 0.65} A ${w * 0.22} ${h * 0.22} 0 1 1 ${x + w * 0.38} ${y + h * 0.65} Z M ${cx} ${y + h * 0.35} L ${cx} ${y + h * 0.78} M ${x + w * 0.62} ${y + h * 0.22} L ${x + w * 0.75} ${y + h * 0.22} M ${x + w * 0.62} ${y + h * 0.35} L ${x + w * 0.78} ${y + h * 0.35} M ${x + w * 0.62} ${y + h * 0.48} L ${x + w * 0.75} ${y + h * 0.48}`;

          case 'solar_system': {
            const minDim = Math.min(w, h);
            const prx = minDim * 0.24;
            const pry = minDim * 0.24;

            const orx = w * 0.46;
            const ory = h * 0.20;
            const tiltDeg = -20;
            const tiltRad = (tiltDeg * Math.PI) / 180;
            const cosT = Math.cos(tiltRad);
            const sinT = Math.sin(tiltRad);

            const x0 = cx + orx * cosT;
            const y0 = cy + orx * sinT;
            const x1 = cx - orx * cosT;
            const y1 = cy - orx * sinT;

            const moonTheta = 40 * Math.PI / 180;
            const moonCos = Math.cos(moonTheta);
            const moonSin = Math.sin(moonTheta);
            const mx = cx + orx * moonCos * cosT - ory * moonSin * sinT;
            const my = cy + orx * moonCos * sinT + ory * moonSin * cosT;
            const mr = minDim * 0.07;

            return `M ${(cx + prx).toFixed(2)} ${cy.toFixed(2)} A ${prx.toFixed(2)} ${pry.toFixed(2)} 0 1 0 ${(cx - prx).toFixed(2)} ${cy.toFixed(2)} A ${prx.toFixed(2)} ${pry.toFixed(2)} 0 1 0 ${(cx + prx).toFixed(2)} ${cy.toFixed(2)} Z ` +
                   `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${orx.toFixed(2)} ${ory.toFixed(2)} ${tiltDeg} 1 0 ${x1.toFixed(2)} ${y1.toFixed(2)} A ${orx.toFixed(2)} ${ory.toFixed(2)} ${tiltDeg} 1 0 ${x0.toFixed(2)} ${y0.toFixed(2)} Z ` +
                   `M ${(mx + mr).toFixed(2)} ${my.toFixed(2)} A ${mr.toFixed(2)} ${mr.toFixed(2)} 0 1 0 ${(mx - mr).toFixed(2)} ${my.toFixed(2)} A ${mr.toFixed(2)} ${mr.toFixed(2)} 0 1 0 ${(mx + mr).toFixed(2)} ${my.toFixed(2)} Z`;
          }

          case 'resistor':
            return `M ${x} ${cy} L ${x + w * 0.18} ${cy} L ${x + w * 0.27} ${y + h * 0.1} L ${x + w * 0.42} ${y + h * 0.9} L ${x + w * 0.57} ${y + h * 0.1} L ${x + w * 0.72} ${y + h * 0.9} L ${x + w * 0.82} ${cy} L ${x + w} ${cy}`;

          default:
            return `M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`;
        }
      }

      static distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.hypot(dx, dy);
      }

      /**
       * Calculates minimum distance from point P to line segment AB
       */
      static distanceToSegment(p, a, b) {
        const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        if (l2 === 0) return MathUtils.distance(p, a);
        let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        return MathUtils.distance(p, proj);
      }

      /**
       * Computes combined bounding box for an array of points or objects
       */
      static getBounds(points) {
        if (!points || points.length === 0) {
          return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        return {
          minX, minY, maxX, maxY,
          width: maxX - minX,
          height: maxY - minY
        };
      }

      static getObjectsBounds(objects) {
        if (!objects || objects.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const obj of objects) {
          if (!obj.bounds) continue;
          if (obj.bounds.minX < minX) minX = obj.bounds.minX;
          if (obj.bounds.minY < minY) minY = obj.bounds.minY;
          if (obj.bounds.maxX > maxX) maxX = obj.bounds.maxX;
          if (obj.bounds.maxY > maxY) maxY = obj.bounds.maxY;
        }
        if (minX === Infinity) return null;
        return {
          minX, minY, maxX, maxY,
          width: maxX - minX,
          height: maxY - minY
        };
      }

      static isConnectableShape(obj) {
        if (!obj || !obj.type) return false;
        const nonConnectable = ['stroke', 'calligraphy', 'line', 'arrow', 'laser'];
        return !nonConnectable.includes(obj.type);
      }

      static getObjectConnectionPoints(obj) {
        if (!obj || !MathUtils.isConnectableShape(obj)) return [];
        const x = obj.x !== undefined ? obj.x : (obj.bounds ? obj.bounds.minX : 0);
        const y = obj.y !== undefined ? obj.y : (obj.bounds ? obj.bounds.minY : 0);
        const w = obj.width !== undefined ? obj.width : (obj.bounds ? obj.bounds.width : 0);
        const h = obj.height !== undefined ? obj.height : (obj.bounds ? obj.bounds.height : 0);

        if (w <= 0 && h <= 0) return [];

        const cx = x + w / 2;
        const cy = y + h / 2;
        const shapeType = obj.type === 'shape' ? (obj.shapeType || 'rectangle') : (obj.type || 'rectangle');

        let rawPoints = [];

        switch (shapeType) {
          case 'triangle':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.75, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.25, y: cy }
            ];
            break;

          case 'parallelogram':
            rawPoints = [
              { id: 'top', x: x + w * 0.625, y: y },
              { id: 'right', x: x + w * 0.875, y: cy },
              { id: 'bottom', x: x + w * 0.375, y: y + h },
              { id: 'left', x: x + w * 0.125, y: cy }
            ];
            break;

          case 'trapezoid':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.9, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.1, y: cy }
            ];
            break;

          case 'star':
          case 'pentagon':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.975, y: y + h * 0.345 },
              { id: 'bottom', x: cx, y: y + h * 0.905 },
              { id: 'left', x: x + w * 0.025, y: y + h * 0.345 }
            ];
            break;

          case 'speech_bubble':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w, y: y + h * 0.375 },
              { id: 'bottom', x: x + w * 0.2, y: y + h },
              { id: 'left', x: x, y: y + h * 0.375 }
            ];
            break;

          case 'cloud':
            rawPoints = [
              { id: 'top', x: x + w * 0.5, y: y + h * 0.05 },
              { id: 'right', x: x + w * 0.92, y: y + h * 0.45 },
              { id: 'bottom', x: cx, y: y + h * 0.82 },
              { id: 'left', x: x + w * 0.08, y: y + h * 0.45 }
            ];
            break;

          case 'heart':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.22 },
              { id: 'right', x: x + w * 0.92, y: y + h * 0.35 },
              { id: 'bottom', x: cx, y: y + h * 0.82 },
              { id: 'left', x: x + w * 0.08, y: y + h * 0.35 }
            ];
            break;

          case 'arrow_right':
            rawPoints = [
              { id: 'top', x: x + w * 0.3, y: y + h * 0.25 },
              { id: 'right', x: x + w, y: cy },
              { id: 'bottom', x: x + w * 0.3, y: y + h * 0.75 },
              { id: 'left', x: x, y: cy }
            ];
            break;

          case 'arrow_left':
            rawPoints = [
              { id: 'top', x: x + w * 0.7, y: y + h * 0.25 },
              { id: 'right', x: x + w, y: cy },
              { id: 'bottom', x: x + w * 0.7, y: y + h * 0.75 },
              { id: 'left', x: x, y: cy }
            ];
            break;

          case 'chevron':
            rawPoints = [
              { id: 'top', x: x + w * 0.375, y: y },
              { id: 'right', x: x + w, y: cy },
              { id: 'bottom', x: x + w * 0.375, y: y + h },
              { id: 'left', x: x + w * 0.25, y: cy }
            ];
            break;

          case 'document':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w, y: y + h * 0.4 },
              { id: 'bottom', x: cx, y: y + h * 0.8 },
              { id: 'left', x: x, y: y + h * 0.4 }
            ];
            break;

          case 'lightning':
            rawPoints = [
              { id: 'top', x: x + w * 0.55, y: y },
              { id: 'right', x: x + w * 0.85, y: y + h * 0.42 },
              { id: 'bottom', x: x + w * 0.4, y: y + h },
              { id: 'left', x: x + w * 0.15, y: y + h * 0.55 }
            ];
            break;

          case 'cross_x':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.25 },
              { id: 'right', x: x + w * 0.75, y: cy },
              { id: 'bottom', x: cx, y: y + h * 0.75 },
              { id: 'left', x: x + w * 0.25, y: cy }
            ];
            break;

          case 'arrow_up':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.75, y: y + h * 0.4 },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.25, y: y + h * 0.4 }
            ];
            break;

          case 'arrow_double':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.3 },
              { id: 'right', x: x + w, y: cy },
              { id: 'bottom', x: cx, y: y + h * 0.7 },
              { id: 'left', x: x, y: cy }
            ];
            break;

          case 'ribbon':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.88, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.12, y: cy }
            ];
            break;

          case 'thought_bubble':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w, y: y + h * 0.4 },
              { id: 'bottom', x: cx, y: y + h * 0.8 },
              { id: 'left', x: x + w * 0.05, y: y + h * 0.4 }
            ];
            break;

          case 'funnel':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.125 },
              { id: 'right', x: x + w * 0.8, y: y + h * 0.5 },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.2, y: y + h * 0.5 }
            ];
            break;

          case 'cube':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w, y: y + h * 0.25 },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x, y: y + h * 0.25 }
            ];
            break;

          case 'graduated_cylinder':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.65, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.35, y: cy }
            ];
            break;

          case 'erlenmeyer_flask':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.84, y: y + h * 0.86 },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.16, y: y + h * 0.86 }
            ];
            break;

          case 'beaker':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.85, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.15, y: cy }
            ];
            break;

          case 'test_tube':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: cx + w * 0.16, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: cx - w * 0.16, y: cy }
            ];
            break;

          case 'dna':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.8, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.2, y: cy }
            ];
            break;

          case 'magnet':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.05 },
              { id: 'right', x: x + w * 0.85, y: cy },
              { id: 'bottom', x: x + w * 0.735, y: y + h * 0.88 },
              { id: 'left', x: x + w * 0.15, y: cy }
            ];
            break;

          case 'microscope':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.08 },
              { id: 'right', x: x + w * 0.85, y: y + h * 0.58 },
              { id: 'bottom', x: cx, y: y + h * 0.92 },
              { id: 'left', x: x + w * 0.15, y: y + h * 0.58 }
            ];
            break;

          case 'battery':
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w * 0.8, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x + w * 0.2, y: cy }
            ];
            break;

          case 'lightbulb':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.08 },
              { id: 'right', x: x + w * 0.82, y: y + h * 0.35 },
              { id: 'bottom', x: cx, y: y + h * 0.9 },
              { id: 'left', x: x + w * 0.18, y: y + h * 0.35 }
            ];
            break;

          case 'thermometer':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.02 },
              { id: 'right', x: x + w * 0.62, y: cy },
              { id: 'bottom', x: cx, y: y + h * 0.98 },
              { id: 'left', x: x + w * 0.38, cy }
            ];
            break;

          case 'solar_system':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.22 },
              { id: 'right', x: x + w, y: cy },
              { id: 'bottom', x: cx, y: y + h * 0.78 },
              { id: 'left', x: x, y: cy }
            ];
            break;

          case 'resistor':
            rawPoints = [
              { id: 'top', x: cx, y: y + h * 0.1 },
              { id: 'right', x: x + w, y: cy },
              { id: 'bottom', x: cx, y: y + h * 0.9 },
              { id: 'left', x: x, y: cy }
            ];
            break;

          default:
            rawPoints = [
              { id: 'top', x: cx, y: y },
              { id: 'right', x: x + w, y: cy },
              { id: 'bottom', x: cx, y: y + h },
              { id: 'left', x: x, y: cy }
            ];
            break;
        }

        if (obj.rotation) {
          const rad = (obj.rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          return rawPoints.map(p => {
            const rx = p.x - cx;
            const ry = p.y - cy;
            return {
              id: p.id,
              x: cx + (rx * cos - ry * sin),
              y: cy + (rx * sin + ry * cos)
            };
          });
        }

        return rawPoints;
      }

      static getObjectConnectionPoint(obj, pointId, targetPt) {
        const points = MathUtils.getObjectConnectionPoints(obj);
        const found = points.find(p => p.id === pointId);
        if (found) return { x: found.x, y: found.y };

        if (targetPt && MathUtils.getShapeBoundaryIntersection) {
          return MathUtils.getShapeBoundaryIntersection(obj, targetPt);
        }

        const x = obj.x !== undefined ? obj.x : 0;
        const y = obj.y !== undefined ? obj.y : 0;
        const w = obj.width !== undefined ? obj.width : 0;
        const h = obj.height !== undefined ? obj.height : 0;
        return { x: x + w / 2, y: y + h / 2 };
      }

      static getShapeBoundaryIntersection(obj, fromPt) {
        if (!obj) return { x: 0, y: 0 };
        const x = obj.x !== undefined ? obj.x : (obj.bounds ? obj.bounds.minX : 0);
        const y = obj.y !== undefined ? obj.y : (obj.bounds ? obj.bounds.minY : 0);
        const w = obj.width !== undefined ? obj.width : (obj.bounds ? obj.bounds.width : 0);
        const h = obj.height !== undefined ? obj.height : (obj.bounds ? obj.bounds.height : 0);
        const cx = x + w / 2;
        const cy = y + h / 2;

        if (!fromPt) return { x: cx, y: cy };

        let fx = fromPt.x;
        let fy = fromPt.y;

        if (obj.rotation) {
          const rad = (-obj.rotation * Math.PI) / 180;
          const cosR = Math.cos(rad);
          const sinR = Math.sin(rad);
          const rx = fx - cx;
          const ry = fy - cy;
          fx = cx + (rx * cosR - ry * sinR);
          fy = cy + (rx * sinR + ry * cosR);
        }

        const angle = Math.atan2(fy - cy, fx - cx);
        let bx = cx, by = cy;
        const shapeType = obj.type === 'shape' ? (obj.shapeType || 'rectangle') : (obj.type || 'rectangle');

        if (shapeType === 'circle' || shapeType === 'ellipse') {
          const rx = w / 2;
          const ry = h / 2;
          bx = cx + rx * Math.cos(angle);
          by = cy + ry * Math.sin(angle);
        } else {
          const pts = MathUtils.getObjectConnectionPoints({ ...obj, rotation: 0 });
          const rayX = cx + Math.cos(angle) * Math.max(w, h) * 10;
          const rayY = cy + Math.sin(angle) * Math.max(w, h) * 10;

          let minDist = Infinity;
          let bestPt = null;

          for (let i = 0; i < pts.length; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length];
            const hit = MathUtils.rayLineIntersection(cx, cy, rayX, rayY, p1.x, p1.y, p2.x, p2.y);
            if (hit) {
              const d = MathUtils.distance({ x: cx, y: cy }, hit);
              if (d < minDist) {
                minDist = d;
                bestPt = hit;
              }
            }
          }

          if (bestPt) {
            bx = bestPt.x;
            by = bestPt.y;
          } else {
            bx = cx + (w / 2) * Math.cos(angle);
            by = cy + (h / 2) * Math.sin(angle);
          }
        }

        if (obj.rotation) {
          const rad = (obj.rotation * Math.PI) / 180;
          const cosR = Math.cos(rad);
          const sinR = Math.sin(rad);
          const rx = bx - cx;
          const ry = by - cy;
          return {
            x: cx + (rx * cosR - ry * sinR),
            y: cy + (rx * sinR + ry * cosR)
          };
        }

        return { x: bx, y: by };
      }

      static rayLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (Math.abs(denom) < 1e-6) return null;
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
          return {
            x: x1 + ua * (x2 - x1),
            y: y1 + ua * (y2 - y1)
          };
        }
        return null;
      }

      /**
       * Fast axis-aligned bounding box intersection test
       */
      static boundsIntersect(b1, b2, margin = 0) {
        return !(
          b2.minX - margin > b1.maxX + margin ||
          b2.maxX + margin < b1.minX - margin ||
          b2.minY - margin > b1.maxY + margin ||
          b2.maxY + margin < b1.minY - margin
        );
      }

      /**
       * Calculates dynamic font size for sticky note text so it fits inside container bounds.
       */
      static calculateStickyFontSize(text, width, height) {
        if (!text || !text.trim()) return 18;
        const padX = 24; // 12px padding left/right
        const padY = 24; // 12px padding top/bottom
        const availW = Math.max(width - padX, 20);
        const availH = Math.max(height - padY, 20);

        const paragraphs = text.split('\n');
        const maxFs = Math.min(availH * 0.45, availW * 0.4, 48);
        const minFs = 8;

        for (let fs = maxFs; fs >= minFs; fs -= 0.5) {
          const charW = fs * 0.58;
          const lineH = fs * 1.3;
          let totalLines = 0;

          for (const para of paragraphs) {
            if (!para) {
              totalLines += 1;
              continue;
            }
            const words = para.split(' ');
            let currentLineWidth = 0;
            let paraLines = 1;

            for (const word of words) {
              const wordW = word.length * charW;
              if (wordW > availW) {
                // Long continuous string: break at character level
                if (currentLineWidth > 0) {
                  paraLines += 1;
                  currentLineWidth = 0;
                }
                const charsPerLine = Math.max(1, Math.floor(availW / charW));
                const chunks = Math.ceil(word.length / charsPerLine);
                paraLines += chunks - 1;
                currentLineWidth = (word.length % charsPerLine) * charW;
                if (currentLineWidth === 0 && word.length > 0) currentLineWidth = charsPerLine * charW;
              } else if (currentLineWidth + (currentLineWidth > 0 ? charW : 0) + wordW <= availW) {
                currentLineWidth += (currentLineWidth > 0 ? charW : 0) + wordW;
              } else {
                paraLines += 1;
                currentLineWidth = wordW;
              }
            }
            totalLines += paraLines;
          }

          if (totalLines * lineH <= availH) {
            return Math.round(fs * 10) / 10;
          }
        }
        return minFs;
      }

      /**
       * Calculates dynamic font size for shape/rectangle/ellipse labels.
       * Unlike calculateStickyFontSize, the passed width/height IS the available
       * text area (either shapeInset dims, or full obj dims minus the shape's own
       * internal padding). No additional padding is subtracted here.
       * Uses line-height 1.2 to match the shape canvas CSS.
       */
      static calculateShapeFontSize(text, availW, availH) {
        if (!text || !text.trim()) return 18;
        const w = Math.max(availW, 20);
        const h = Math.max(availH, 20);

        const paragraphs = text.split('\n');
        const maxFs = Math.min(h * 0.45, w * 0.4, 48);
        const minFs = 12;

        for (let fs = maxFs; fs >= minFs; fs -= 0.5) {
          const charW = fs * 0.58;
          const lineH = fs * 1.2; // shape canvas uses line-height:1.2
          let totalLines = 0;

          for (const para of paragraphs) {
            if (!para) { totalLines += 1; continue; }
            const words = para.split(' ');
            let currentLineWidth = 0;
            let paraLines = 1;
            for (const word of words) {
              const wordW = word.length * charW;
              if (wordW > w) {
                if (currentLineWidth > 0) { paraLines += 1; currentLineWidth = 0; }
                const charsPerLine = Math.max(1, Math.floor(w / charW));
                const chunks = Math.ceil(word.length / charsPerLine);
                paraLines += chunks - 1;
                currentLineWidth = (word.length % charsPerLine) * charW;
                if (currentLineWidth === 0 && word.length > 0) currentLineWidth = charsPerLine * charW;
              } else if (currentLineWidth + (currentLineWidth > 0 ? charW : 0) + wordW <= w) {
                currentLineWidth += (currentLineWidth > 0 ? charW : 0) + wordW;
              } else {
                paraLines += 1;
                currentLineWidth = wordW;
              }
            }
            totalLines += paraLines;
          }

          if (totalLines * lineH <= h) {
            return Math.round(fs * 10) / 10;
          }
        }
        return minFs;
      }

      /**
       * Backwards-compatible sticky layout helper. Sticky notes no longer grow
       * while typing: their fixed boundaries drive responsive font sizing.
       */
      static calculateStickyLayout(text, width, height) {
        const layout = MathUtils.getStickyTextLayout(text, width, height);
        return { fontSize: layout.fontSize, width, height };
      }

      /**
       * Checks if bounding box b1 is entirely inside b2
       */
      static boundsContains(outer, inner) {
        return (
          inner.minX >= outer.minX &&
          inner.maxX <= outer.maxX &&
          inner.minY >= outer.minY &&
          inner.maxY <= outer.maxY
        );
      }

      /**
       * Reconstructs SVG path string from point array with optional smooth Béziers.
       */
      static rebuildPathFromPoints(points, isClosed = true, isSmooth = false) {
        if (!points || points.length === 0) return '';
        if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

        if (isSmooth && points.length > 2) {
          if (isClosed) {
            const n = points.length;
            const midPoints = [];
            for (let i = 0; i < n; i++) {
              const p1 = points[i];
              const p2 = points[(i + 1) % n];
              midPoints.push({
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
              });
            }
            let d = `M ${midPoints[0].x.toFixed(1)} ${midPoints[0].y.toFixed(1)}`;
            for (let i = 0; i < n; i++) {
              const controlPt = points[(i + 1) % n];
              const nextMid = midPoints[(i + 1) % n];
              d += ` Q ${controlPt.x.toFixed(1)} ${controlPt.y.toFixed(1)}, ${nextMid.x.toFixed(1)} ${nextMid.y.toFixed(1)}`;
            }
            d += ' Z';
            return d;
          } else {
            let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
            for (let i = 0; i < points.length - 1; i++) {
              const p1 = points[i];
              const p2 = points[i + 1];
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              d += ` Q ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
            }
            d += ` L ${points[points.length - 1].x.toFixed(1)} ${points[points.length - 1].y.toFixed(1)}`;
            return d;
          }
        }

        let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
        for (let i = 1; i < points.length; i++) {
          d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
        }
        if (isClosed) {
          d += ' Z';
        }
        return d;
      }

      static translatePathData(pathData, dx, dy) {
        if (!pathData) return '';
        return pathData.replace(/([0-9.-]+)[,\s]+([0-9.-]+)/g, (match, x, y) => {
          const nx = (parseFloat(x) + dx).toFixed(1);
          const ny = (parseFloat(y) + dy).toFixed(1);
          return `${nx} ${ny}`;
        });
      }

      static getObjectBounds(obj) {
        if (!obj) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
        if (obj.type === 'stroke' || obj.type === 'calligraphy' || (obj.type === 'shape' && obj.points && obj.points.length > 0)) {
          if (obj.rotation && obj.points && obj.points.length > 0) {
            const w = obj.width || 0;
            const h = obj.height || 0;
            const cx = (obj.x || 0) + w / 2;
            const cy = (obj.y || 0) + h / 2;
            const rotRad = (obj.rotation * Math.PI) / 180;
            const cosR = Math.cos(rotRad);
            const sinR = Math.sin(rotRad);
            const rotated = obj.points.map(p => {
              const rx = p.x - cx;
              const ry = p.y - cy;
              return {
                x: cx + (rx * cosR - ry * sinR),
                y: cy + (rx * sinR + ry * cosR)
              };
            });
            return MathUtils.getBounds(rotated);
          }
          return MathUtils.getBounds(obj.points || []);
        }
        if (obj.type === 'line' || obj.type === 'arrow') {
          const x1 = obj.x1 || 0;
          const y1 = obj.y1 || 0;
          const x2 = obj.x2 || 0;
          const y2 = obj.y2 || 0;
          const cx = obj.cx !== undefined ? obj.cx : (x1 + x2) / 2;
          const cy = obj.cy !== undefined ? obj.cy : (y1 + y2) / 2;

          let minX = Math.min(x1, x2);
          let maxX = Math.max(x1, x2);
          let minY = Math.min(y1, y2);
          let maxY = Math.max(y1, y2);

          if (obj.arrowType === 'elbow') {
            for (const p of MathUtils.getElbowDrawnPoints(obj)) {
              minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
              minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            }
            return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
          }

          // Find quadratic Bezier extremum along X axis if critical t is in (0, 1)
          const denomX = x1 - 2 * cx + x2;
          if (Math.abs(denomX) > 1e-5) {
            const tx = (x1 - cx) / denomX;
            if (tx > 0 && tx < 1) {
              const xExt = (1 - tx) * (1 - tx) * x1 + 2 * (1 - tx) * tx * cx + tx * tx * x2;
              minX = Math.min(minX, xExt);
              maxX = Math.max(maxX, xExt);
            }
          }

          // Find quadratic Bezier extremum along Y axis if critical t is in (0, 1)
          const denomY = y1 - 2 * cy + y2;
          if (Math.abs(denomY) > 1e-5) {
            const ty = (y1 - cy) / denomY;
            if (ty > 0 && ty < 1) {
              const yExt = (1 - ty) * (1 - ty) * y1 + 2 * (1 - ty) * ty * cy + ty * ty * y2;
              minY = Math.min(minY, yExt);
              maxY = Math.max(maxY, yExt);
            }
          }

          return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
        }
        // For text objects the authoritative bounds come from getBBox() stored on
        // obj.bounds during render.  Use them directly so the selection box aligns
        // with the actual glyph bounding box, not the baseline-derived obj.y.
        if (obj.type === 'text' && obj.bounds) {
          const b = obj.bounds;
          if (obj.rotation) {
            const cx = (b.minX + b.maxX) / 2;
            const cy = (b.minY + b.maxY) / 2;
            const rotRad = (obj.rotation * Math.PI) / 180;
            const cosR = Math.cos(rotRad);
            const sinR = Math.sin(rotRad);
            const w2 = b.width / 2;
            const h2 = b.height / 2;
            const corners = [
              { x: -w2, y: -h2 }, { x: w2, y: -h2 },
              { x: w2, y: h2 },   { x: -w2, y: h2 }
            ];
            return MathUtils.getBounds(corners.map(c => ({
              x: cx + (c.x * cosR - c.y * sinR),
              y: cy + (c.x * sinR + c.y * cosR)
            })));
          }
          return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, width: b.width, height: b.height };
        }
        const w = obj.width || 0;
        const h = obj.height || 0;
        if (obj.rotation) {
          const cx = (obj.x || 0) + w / 2;
          const cy = (obj.y || 0) + h / 2;
          const rotRad = (obj.rotation * Math.PI) / 180;
          const cosR = Math.cos(rotRad);
          const sinR = Math.sin(rotRad);
          const w2 = w / 2;
          const h2 = h / 2;
          const corners = [
            { x: -w2, y: -h2 },
            { x: w2, y: -h2 },
            { x: w2, y: h2 },
            { x: -w2, y: h2 }
          ];
          const rotatedCorners = corners.map(c => ({
            x: cx + (c.x * cosR - c.y * sinR),
            y: cy + (c.x * sinR + c.y * cosR)
          }));
          return MathUtils.getBounds(rotatedCorners);
        }
        // For text without rendered bounds yet, apply ascender correction so the
        // pre-render fallback box is close to where glyphs will actually appear.
        if (obj.type === 'text') {
          const fs = obj.fontSize || 24;
          const ascenderOffset = fs * 0.15;
          const minX = obj.x || 0;
          const minY = (obj.y || 0) + ascenderOffset;
          return { minX, minY, maxX: minX + w, maxY: minY + h, width: w, height: h };
        }
        return { minX: obj.x || 0, minY: obj.y || 0, maxX: (obj.x || 0) + w, maxY: (obj.y || 0) + h, width: w, height: h };
      }

      /**
       * Vector hit testing for stroke paths, shapes, text, and sticky notes
       */
      static hitTestShape(obj, point, radius) {
        if (!obj) return false;
        if (!obj.bounds) {
          if (obj.points) {
            obj.bounds = MathUtils.getBounds(obj.points);
          } else {
            obj.bounds = MathUtils.getObjectBounds(obj);
          }
        }
        if (!obj.bounds) return false;
        const margin = (obj.strokeWidth || 4) / 2 + radius;
        if (!MathUtils.boundsIntersect({ minX: point.x - radius, minY: point.y - radius, maxX: point.x + radius, maxY: point.y + radius }, obj.bounds, margin)) {
          return false;
        }

        const type = obj.type || 'stroke';

        let testPt = point;
        if (obj.rotation && (type === 'rectangle' || type === 'sticky' || type === 'text' || type === 'image' || type === 'ellipse' || type === 'shape' || type === 'table')) {
          const cx = (obj.x || 0) + (obj.width || 0) / 2;
          const cy = (obj.y || 0) + (obj.height || 0) / 2;
          const rad = (-obj.rotation * Math.PI) / 180;
          const cosR = Math.cos(rad);
          const sinR = Math.sin(rad);
          const rx = point.x - cx;
          const ry = point.y - cy;
          testPt = {
            x: cx + (rx * cosR - ry * sinR),
            y: cy + (rx * sinR + ry * cosR)
          };
        }

        if (type === 'stroke' || type === 'calligraphy') {
          const points = obj.points;
          if (!points || points.length === 0) return false;
          if (points.length === 1) {
            return MathUtils.distance(point, points[0]) <= radius + margin;
          }
          for (let i = 0; i < points.length - 1; i++) {
            if (MathUtils.distanceToSegment(point, points[i], points[i + 1]) <= radius + margin) {
              return true;
            }
          }
          return false;
        }

        if (type === 'shape') {
          const pathD = obj.pathData || MathUtils.getShapePathD(obj.shapeType || 'diamond', obj.x, obj.y, obj.width, obj.height);
          if (typeof Path2D !== 'undefined') {
            const ctx = MathUtils.getHitCanvasCtx();
            if (ctx && ctx.isPointInPath(new Path2D(pathD), testPt.x, testPt.y)) {
              return true;
            }
          }
          const localMinX = obj.x;
          const localMinY = obj.y;
          const localMaxX = obj.x + (obj.width || 0);
          const localMaxY = obj.y + (obj.height || 0);
          if (obj.fill && obj.fill !== 'none') {
            return testPt.x >= localMinX && testPt.x <= localMaxX && testPt.y >= localMinY && testPt.y <= localMaxY;
          } else {
            const top = MathUtils.distanceToSegment(testPt, { x: localMinX, y: localMinY }, { x: localMaxX, y: localMinY });
            const right = MathUtils.distanceToSegment(testPt, { x: localMaxX, y: localMinY }, { x: localMaxX, y: localMaxY });
            const bottom = MathUtils.distanceToSegment(testPt, { x: localMaxX, y: localMaxY }, { x: localMinX, y: localMaxY });
            const left = MathUtils.distanceToSegment(testPt, { x: localMinX, y: localMaxY }, { x: localMinX, y: localMinY });
            return Math.min(top, right, bottom, left) <= margin;
          }
        }

        if (type === 'rectangle' || type === 'sticky' || type === 'text' || type === 'image' || type === 'table') {
          const localMinX = obj.x;
          const localMinY = obj.y;
          const localMaxX = obj.x + obj.width;
          const localMaxY = obj.y + obj.height;
          if ((obj.fill && obj.fill !== 'none') || type === 'image' || type === 'sticky' || type === 'text' || type === 'shape' || type === 'table') {
            return testPt.x >= localMinX && testPt.x <= localMaxX &&
                   testPt.y >= localMinY && testPt.y <= localMaxY;
          } else {
            const top = MathUtils.distanceToSegment(testPt, { x: localMinX, y: localMinY }, { x: localMaxX, y: localMinY });
            const right = MathUtils.distanceToSegment(testPt, { x: localMaxX, y: localMinY }, { x: localMaxX, y: localMaxY });
            const bottom = MathUtils.distanceToSegment(testPt, { x: localMaxX, y: localMaxY }, { x: localMinX, y: localMaxY });
            const left = MathUtils.distanceToSegment(testPt, { x: localMinX, y: localMaxY }, { x: localMinX, y: localMinY });
            return Math.min(top, right, bottom, left) <= margin;
          }
        }

        if (type === 'ellipse') {
          const cx = obj.x + obj.width / 2;
          const cy = obj.y + obj.height / 2;
          const rx = Math.max(obj.width / 2, 1);
          const ry = Math.max(obj.height / 2, 1);
          const normalizedDist = ((testPt.x - cx) / rx) ** 2 + ((testPt.y - cy) / ry) ** 2;
          if (obj.fill && obj.fill !== 'none') {
            return normalizedDist <= 1.1;
          } else {
            return Math.abs(Math.sqrt(normalizedDist) - 1.0) * Math.min(rx, ry) <= margin;
          }
        }

        if (type === 'line' || type === 'arrow') {
          const cx = obj.cx !== undefined ? obj.cx : (obj.x1 + obj.x2) / 2;
          const cy = obj.cy !== undefined ? obj.cy : (obj.y1 + obj.y2) / 2;
          if (obj.arrowType === 'elbow') {
            const pts = MathUtils.getElbowDrawnPoints(obj);
            for (let i = 0; i < pts.length - 1; i++) {
              if (MathUtils.distanceToSegment(testPt, pts[i], pts[i + 1]) <= margin) return true;
            }
            return false;
          }
          const steps = 12;
          let prevPt = { x: obj.x1, y: obj.y1 };
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const invT = 1 - t;
            const currPt = {
              x: invT * invT * obj.x1 + 2 * invT * t * cx + t * t * obj.x2,
              y: invT * invT * obj.y1 + 2 * invT * t * cy + t * t * obj.y2
            };
            if (MathUtils.distanceToSegment(point, prevPt, currPt) <= margin) {
              return true;
            }
            prevPt = currPt;
          }
          return false;
        }

        return false;
      }

      /**
       * Point-in-polygon ray-casting test for closed shapes and freehand loops
       */
      static pointInPolygon(point, points) {
        if (!points || points.length < 3) return false;
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const xi = points[i].x, yi = points[i].y;
          const xj = points[j].x, yj = points[j].y;
          const intersect = ((yi > point.y) !== (yj > point.y))
              && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }

      /**
       * Returns a cached 2D canvas context for exact SVG Path point-in-path testing
       */
      static getHitCanvasCtx() {
        if (!MathUtils._hitCanvasCtx) {
          const c = document.createElement('canvas');
          c.width = 1;
          c.height = 1;
          MathUtils._hitCanvasCtx = c.getContext('2d');
        }
        return MathUtils._hitCanvasCtx;
      }

      /**
       * Tests if point is strictly inside the closed shape geometry or closed stroke boundary
       */
      static isPointInsideShape(obj, point) {
        if (!obj) return false;
        const type = obj.type || 'stroke';

        let testPt = point;
        if (obj.rotation && (type === 'rectangle' || type === 'sticky' || type === 'text' || type === 'image' || type === 'ellipse' || type === 'shape' || type === 'frame' || type === 'table')) {
          const cx = (obj.x || 0) + (obj.width || 0) / 2;
          const cy = (obj.y || 0) + (obj.height || 0) / 2;
          const rad = (-obj.rotation * Math.PI) / 180;
          const cosR = Math.cos(rad);
          const sinR = Math.sin(rad);
          const rx = point.x - cx;
          const ry = point.y - cy;
          testPt = {
            x: cx + (rx * cosR - ry * sinR),
            y: cy + (rx * sinR + ry * cosR)
          };
        }

        if (type === 'rectangle' || type === 'sticky' || type === 'text' || type === 'image' || type === 'frame' || type === 'table') {
          const localMinX = obj.x;
          const localMinY = obj.y;
          const localMaxX = obj.x + (obj.width || 0);
          const localMaxY = obj.y + (obj.height || 0);
          return testPt.x >= localMinX && testPt.x <= localMaxX &&
                 testPt.y >= localMinY && testPt.y <= localMaxY;
        }

        if (type === 'ellipse') {
          const cx = obj.x + (obj.width || 0) / 2;
          const cy = obj.y + (obj.height || 0) / 2;
          const rx = Math.max((obj.width || 0) / 2, 1);
          const ry = Math.max((obj.height || 0) / 2, 1);
          const normalizedDist = ((testPt.x - cx) / rx) ** 2 + ((testPt.y - cy) / ry) ** 2;
          return normalizedDist <= 1.0;
        }

        if (type === 'shape') {
          const pathD = obj.pathData || MathUtils.getShapePathD(obj.shapeType || 'diamond', obj.x, obj.y, obj.width, obj.height);
          if (typeof Path2D !== 'undefined') {
            const ctx = MathUtils.getHitCanvasCtx();
            if (ctx) {
              return ctx.isPointInPath(new Path2D(pathD), testPt.x, testPt.y);
            }
          }
          const localMinX = obj.x;
          const localMinY = obj.y;
          const localMaxX = obj.x + (obj.width || 0);
          const localMaxY = obj.y + (obj.height || 0);
          return testPt.x >= localMinX && testPt.x <= localMaxX && testPt.y >= localMinY && testPt.y <= localMaxY;
        }

        if (type === 'line' || type === 'arrow') {
          return MathUtils.hitTestShape(obj, point, 14);
        }

        if (type === 'stroke' || type === 'calligraphy') {
          const points = obj.points;
          if (points && points.length >= 3) {
            const p0 = points[0];
            const pN = points[points.length - 1];
            const closeDist = Math.hypot(p0.x - pN.x, p0.y - pN.y);
            const closeThreshold = Math.max((obj.strokeWidth || 4) * 3, 24);
            if (closeDist <= closeThreshold) {
              if (MathUtils.pointInPolygon(point, points)) {
                return true;
              }
            }
          }
          return false;
        }

        return false;
      }

      /**
       * Finds an enclosed boundary-constrained region around a seed point formed by any drawn strokes/shapes,
       * ensuring zero spillover outside the enclosing boundaries.
       */
      static findEnclosedRegionPath(seedPt, allObjects) {
        if (!allObjects || allObjects.length === 0) return null;

        const maxRadius = 450;
        const minX = seedPt.x - maxRadius;
        const minY = seedPt.y - maxRadius;
        const maxX = seedPt.x + maxRadius;
        const maxY = seedPt.y + maxRadius;
        const boxW = maxX - minX;
        const boxH = maxY - minY;

        const candidateObjs = allObjects.filter(obj => {
          const b = obj.bounds || MathUtils.getObjectBounds(obj);
          if (!b) return false;
          return !(b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY);
        });

        if (candidateObjs.length === 0) return null;

        const scale = 1.0;
        const w = Math.round(boxW * scale);
        const h = Math.round(boxH * scale);

        if (!MathUtils._floodCanvas) {
          MathUtils._floodCanvas = document.createElement('canvas');
        }
        const canvas = MathUtils._floodCanvas;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.scale(scale, scale);
        ctx.translate(-minX, -minY);

        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const obj of candidateObjs) {
          const sw = Math.max(obj.strokeWidth || 2, 2);
          ctx.lineWidth = sw;

          if (obj.type === 'rectangle' || obj.type === 'frame' || obj.type === 'sticky' || obj.type === 'table') {
            const rx = obj.x, ry = obj.y, rw = Math.max(obj.width, 2), rh = Math.max(obj.height, 2);
            if (obj.rotation) {
              ctx.save();
              ctx.translate(rx + rw / 2, ry + rh / 2);
              ctx.rotate((obj.rotation * Math.PI) / 180);
              ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
              ctx.restore();
            } else {
              ctx.strokeRect(rx, ry, rw, rh);
            }
          } else if (obj.type === 'ellipse') {
            const cx = obj.x + obj.width / 2;
            const cy = obj.y + obj.height / 2;
            const rx = Math.max(obj.width / 2, 1);
            const ry = Math.max(obj.height / 2, 1);
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, (obj.rotation || 0) * Math.PI / 180, 0, 2 * Math.PI);
            ctx.stroke();
          } else if (obj.type === 'shape') {
            const pathD = obj.pathData || MathUtils.getShapePathD(obj.shapeType || 'diamond', obj.x, obj.y, obj.width, obj.height);
            if (typeof Path2D !== 'undefined') {
              ctx.stroke(new Path2D(pathD));
            }
          } else if (obj.type === 'line' || obj.type === 'arrow') {
            const x1 = obj.x1 || 0, y1 = obj.y1 || 0, x2 = obj.x2 || 0, y2 = obj.y2 || 0;
            const pathD = MathUtils.getArrowPathD(obj.arrowType || 'single', x1, y1, x2, y2, obj.cx, obj.cy, obj.elbowDir, obj.elbowTracks, MathUtils.getElbowSide(obj, 'start'), MathUtils.getElbowSide(obj, 'end'));
            if (typeof Path2D !== 'undefined') {
              ctx.stroke(new Path2D(pathD));
            }
          } else if (obj.pathData) {
            if (typeof Path2D !== 'undefined') {
              ctx.stroke(new Path2D(obj.pathData));
            }
          }
        }
        ctx.restore();

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        let seedX = Math.round((seedPt.x - minX) * scale);
        let seedY = Math.round((seedPt.y - minY) * scale);

        if (seedX < 2 || seedX >= w - 2 || seedY < 2 || seedY >= h - 2) return null;

        // If clicked on stroke boundary wall, nudge to empty pixel
        let seedIdx = (seedY * w + seedX) * 4;
        if (data[seedIdx + 3] > 60) {
          let found = false;
          for (let r = 1; r <= 5 && !found; r++) {
            const offsets = [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]];
            for (const [ox, oy] of offsets) {
              const nx = seedX + ox;
              const ny = seedY + oy;
              if (nx >= 2 && nx < w - 2 && ny >= 2 && ny < h - 2) {
                const nIdx = (ny * w + nx) * 4;
                if (data[nIdx + 3] < 50) {
                  seedX = nx;
                  seedY = ny;
                  seedIdx = nIdx;
                  found = true;
                  break;
                }
              }
            }
          }
          if (!found) return null;
        }

        const visited = new Uint8Array(w * h);
        const queue = new Int32Array(w * h);
        let qHead = 0, qTail = 0;

        queue[qTail++] = seedY * w + seedX;
        visited[seedY * w + seedX] = 1;

        let leaked = false;
        let minFx = w, minFy = h, maxFx = 0, maxFy = 0;
        let filledCount = 0;
        const maxAllowedFilled = Math.round((w * h) * 0.82);

        while (qHead < qTail) {
          const idx = queue[qHead++];
          const py = (idx / w) | 0;
          const px = idx % w;
          filledCount++;

          if (px < minFx) minFx = px;
          if (px > maxFx) maxFx = px;
          if (py < minFy) minFy = py;
          if (py > maxFy) maxFy = py;

          // Strict boundary leak detection: touching outer borders means open canvas
          if (px <= 1 || px >= w - 2 || py <= 1 || py >= h - 2) {
            leaked = true;
            break;
          }

          if (filledCount > maxAllowedFilled) {
            leaked = true;
            break;
          }

          if (py > 0) {
            const nIdx = (py - 1) * w + px;
            if (!visited[nIdx] && data[nIdx * 4 + 3] < 60) {
              visited[nIdx] = 1;
              queue[qTail++] = nIdx;
            }
          }
          if (py < h - 1) {
            const sIdx = (py + 1) * w + px;
            if (!visited[sIdx] && data[sIdx * 4 + 3] < 60) {
              visited[sIdx] = 1;
              queue[qTail++] = sIdx;
            }
          }
          if (px > 0) {
            const wIdx = py * w + (px - 1);
            if (!visited[wIdx] && data[wIdx * 4 + 3] < 60) {
              visited[wIdx] = 1;
              queue[qTail++] = wIdx;
            }
          }
          if (px < w - 1) {
            const eIdx = py * w + (px + 1);
            if (!visited[eIdx] && data[eIdx * 4 + 3] < 60) {
              visited[eIdx] = 1;
              queue[qTail++] = eIdx;
            }
          }
        }

        if (leaked || filledCount < 12) {
          return null;
        }

        // Dilate the visited mask into adjacent boundary stroke pixels to eliminate any transparent gap
        const dilated = new Uint8Array(visited);
        for (let pass = 0; pass < 2; pass++) {
          const current = new Uint8Array(dilated);
          const yStart = Math.max(1, minFy - 2);
          const yEnd = Math.min(h - 2, maxFy + 2);
          const xStart = Math.max(1, minFx - 2);
          const xEnd = Math.min(w - 2, maxFx + 2);

          for (let y = yStart; y <= yEnd; y++) {
            for (let x = xStart; x <= xEnd; x++) {
              const idx = y * w + x;
              if (current[idx] === 1) continue;
              // Expand only into opaque stroke boundary pixels, never into unvisited transparent space
              if (data[idx * 4 + 3] > 25) {
                if (current[(y - 1) * w + x] === 1 ||
                    current[(y + 1) * w + x] === 1 ||
                    current[y * w + (x - 1)] === 1 ||
                    current[y * w + (x + 1)] === 1 ||
                    current[(y - 1) * w + (x - 1)] === 1 ||
                    current[(y - 1) * w + (x + 1)] === 1 ||
                    current[(y + 1) * w + (x - 1)] === 1 ||
                    current[(y + 1) * w + (x + 1)] === 1) {
                  dilated[idx] = 1;
                  if (x < minFx) minFx = x;
                  if (x > maxFx) maxFx = x;
                  if (y < minFy) minFy = y;
                  if (y > maxFy) maxFy = y;
                }
              }
            }
          }
        }

        const polygon = MathUtils.traceMaskBoundary(dilated, w, h, minFx, minFy, maxFx, maxFy, minX, minY, scale);
        if (!polygon || polygon.length < 3) return null;

        const simplified = MathUtils.simplifyDouglasPeucker(polygon, 0.65);
        if (!simplified || simplified.length < 3) return null;

        // Construct a continuous, C1-smooth closed Bezier path from simplified polygon points
        const n = simplified.length;
        let d = '';
        if (n >= 3) {
          const pLast = simplified[n - 1];
          const pFirst = simplified[0];
          const startX = (pLast.x + pFirst.x) / 2;
          const startY = (pLast.y + pFirst.y) / 2;
          d = `M ${startX.toFixed(2)} ${startY.toFixed(2)}`;
          for (let i = 0; i < n; i++) {
            const curr = simplified[i];
            const next = simplified[(i + 1) % n];
            const midX = (curr.x + next.x) / 2;
            const midY = (curr.y + next.y) / 2;
            d += ` Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
          }
          d += ' Z';
        } else {
          d = `M ${simplified[0].x.toFixed(2)} ${simplified[0].y.toFixed(2)}`;
          for (let i = 1; i < simplified.length; i++) {
            d += ` L ${simplified[i].x.toFixed(2)} ${simplified[i].y.toFixed(2)}`;
          }
          d += ' Z';
        }

        const rMinX = Math.min(...simplified.map(p => p.x));
        const rMinY = Math.min(...simplified.map(p => p.y));
        const rMaxX = Math.max(...simplified.map(p => p.x));
        const rMaxY = Math.max(...simplified.map(p => p.y));

        return {
          pathData: d,
          bounds: { minX: rMinX, minY: rMinY, maxX: rMaxX, maxY: rMaxY, width: rMaxX - rMinX, height: rMaxY - rMinY },
          points: simplified,
          candidateObjs: candidateObjs
        };
      }

      /**
       * Traces the outer closed perimeter of a binary mask
       */
      static traceMaskBoundary(visited, w, h, minFx, minFy, maxFx, maxFy, minX, minY, scale) {
        let startX = -1, startY = -1;
        for (let y = minFy; y <= maxFy; y++) {
          for (let x = minFx; x <= maxFx; x++) {
            if (visited[y * w + x] === 1) {
              startX = x;
              startY = y;
              break;
            }
          }
          if (startX !== -1) break;
        }
        if (startX === -1) return null;

        const dx = [1, 1, 0, -1, -1, -1, 0, 1];
        const dy = [0, 1, 1, 1, 0, -1, -1, -1];

        const points = [];
        let currX = startX;
        let currY = startY;
        let backtrackDir = 4;
        const maxSteps = w * h;
        let steps = 0;

        do {
          points.push({
            x: minX + (currX + 0.5) / scale,
            y: minY + (currY + 0.5) / scale
          });

          let foundNext = false;
          for (let i = 0; i < 8; i++) {
            const nextDir = (backtrackDir + 1 + i) % 8;
            const nx = currX + dx[nextDir];
            const ny = currY + dy[nextDir];

            if (nx >= 0 && nx < w && ny >= 0 && ny < h && visited[ny * w + nx] === 1) {
              currX = nx;
              currY = ny;
              backtrackDir = (nextDir + 4) % 8;
              foundNext = true;
              break;
            }
          }

          if (!foundNext) break;
          steps++;
        } while ((currX !== startX || currY !== startY) && steps < maxSteps);

        return points.length >= 3 ? points : null;
      }

      /**
       * Simplifies a 2D polyline using the Ramer-Douglas-Peucker algorithm
       */
      static simplifyDouglasPeucker(points, tolerance = 1.2) {
        if (!points || points.length <= 2) return points;

        function perpendicularDistance(p, p1, p2) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const mag = Math.hypot(dx, dy);
          if (mag === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
          return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / mag;
        }

        function dpRecursive(pts, tol) {
          let maxDist = 0;
          let index = 0;
          const last = pts.length - 1;

          for (let i = 1; i < last; i++) {
            const dist = perpendicularDistance(pts[i], pts[0], pts[last]);
            if (dist > maxDist) {
              maxDist = dist;
              index = i;
            }
          }

          if (maxDist > tol) {
            const left = dpRecursive(pts.slice(0, index + 1), tol);
            const right = dpRecursive(pts.slice(index), tol);
            return left.slice(0, left.length - 1).concat(right);
          } else {
            return [pts[0], pts[last]];
          }
        }

        return dpRecursive(points, tolerance);
      }

    }

    /* ==========================================================================
       2. CAMERA & INFINITE CANVAS MANAGER (PHASE 2)
       ========================================================================== */
    class Camera {
      constructor(svgStage, viewportGroup, gridPattern, onTransformChange) {
        this.svgStage = svgStage;
        this.viewportGroup = viewportGroup;
        this.gridPattern = gridPattern;
        this.onTransformChange = onTransformChange || (() => {});

        this.x = 0;
        this.y = 0;
        this.zoom = 1;

        this.minZoom = 0.1;
        this.maxZoom = 10.0;

        this.applyTransform();
      }

      screenToSvg(clientX, clientY) {
        const rect = this.svgStage.getBoundingClientRect();
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;

        return {
          x: (screenX - this.x) / this.zoom,
          y: (screenY - this.y) / this.zoom
        };
      }

      svgToScreen(worldX, worldY) {
        const rect = this.svgStage.getBoundingClientRect();
        return {
          x: worldX * this.zoom + this.x + rect.left,
          y: worldY * this.zoom + this.y + rect.top
        };
      }

      panBy(dx, dy) {
        this.x += dx;
        this.y += dy;
        this.applyTransform();
      }

      zoomAtPoint(newZoom, clientX, clientY) {
        const clampedZoom = Math.min(Math.max(newZoom, this.minZoom), this.maxZoom);
        if (Math.abs(clampedZoom - this.zoom) < 0.0001) return;

        const rect = this.svgStage.getBoundingClientRect();
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;

        const worldX = (screenX - this.x) / this.zoom;
        const worldY = (screenY - this.y) / this.zoom;

        this.zoom = clampedZoom;

        this.x = screenX - worldX * this.zoom;
        this.y = screenY - worldY * this.zoom;

        this.applyTransform();
      }

      setZoom(newZoom) {
        const rect = this.svgStage.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        this.zoomAtPoint(newZoom, centerX, centerY);
      }

      getCenter() {
        if (!this.svgStage) return { x: 0, y: 0 };
        const rect = this.svgStage.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return this.screenToSvg(centerX, centerY);
      }

      reset() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this.applyTransform();
      }

      zoomToFit(objects) {
        const bounds = MathUtils.getObjectsBounds(objects);
        if (!bounds) {
          this.reset();
          return;
        }

        const rect = this.svgStage.getBoundingClientRect();
        const padding = 60;

        const contentW = Math.max(bounds.width, 100);
        const contentH = Math.max(bounds.height, 100);

        const scaleX = (rect.width - padding * 2) / contentW;
        const scaleY = (rect.height - padding * 2) / contentH;
        let fitZoom = Math.min(scaleX, scaleY);
        fitZoom = Math.min(Math.max(fitZoom, 0.2), 2.5);

        const contentCenterX = (bounds.minX + bounds.maxX) / 2;
        const contentCenterY = (bounds.minY + bounds.maxY) / 2;

        this.zoom = fitZoom;
        this.x = rect.width / 2 - contentCenterX * this.zoom;
        this.y = rect.height / 2 - contentCenterY * this.zoom;

        this.applyTransform();
      }

      animateTo(targetX, targetY, targetZoom, duration = 400) {
        if (this._animId) cancelAnimationFrame(this._animId);
        const startX = this.x;
        const startY = this.y;
        const startZoom = this.zoom;
        const startTime = performance.now();

        const animate = (now) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 3);

          this.x = startX + (targetX - startX) * ease;
          this.y = startY + (targetY - startY) * ease;
          this.zoom = startZoom + (targetZoom - startZoom) * ease;
          this.applyTransform();

          if (progress < 1) {
            this._animId = requestAnimationFrame(animate);
          } else {
            this._animId = null;
          }
        };
        this._animId = requestAnimationFrame(animate);
      }

      zoomToFitBoundsAnimated(bounds, duration = 450) {
        if (!bounds) {
          this.animateTo(0, 0, 1, duration);
          return;
        }
        const rect = this.svgStage.getBoundingClientRect();
        const padding = 100;

        const contentW = Math.max(bounds.width || 0, 100);
        const contentH = Math.max(bounds.height || 0, 100);

        const scaleX = (rect.width - padding * 2) / contentW;
        const scaleY = (rect.height - padding * 2) / contentH;
        let fitZoom = Math.min(scaleX, scaleY);
        fitZoom = Math.min(Math.max(fitZoom, 0.2), 2.5);

        const contentCenterX = bounds.minX !== undefined ? (bounds.minX + bounds.maxX) / 2 : 0;
        const contentCenterY = bounds.minY !== undefined ? (bounds.minY + bounds.maxY) / 2 : 0;

        const targetX = rect.width / 2 - contentCenterX * fitZoom;
        const targetY = rect.height / 2 - contentCenterY * fitZoom;

        this.animateTo(targetX, targetY, fitZoom, duration);
      }

      applyTransform() {
        this.viewportGroup.setAttribute('transform', `translate(${this.x.toFixed(2)}, ${this.y.toFixed(2)}) scale(${this.zoom.toFixed(4)})`);

        if (this.gridPattern) {
          this.gridPattern.setAttribute('patternTransform', `translate(${this.x.toFixed(2)}, ${this.y.toFixed(2)}) scale(${this.zoom.toFixed(4)})`);
        }

        this.onTransformChange({
          x: this.x,
          y: this.y,
          zoom: this.zoom,
          zoomPercent: Math.round(this.zoom * 100)
        });
      }
    }

    /* ==========================================================================
       3. STROKE MANAGER (SMOOTHING & SVG PATH GENERATION)
       ========================================================================== */
    class StrokeManager {
      static generatePathData(points) {
        if (!points || points.length === 0) return '';
        if (points.length === 1) {
          return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
        }
        if (points.length === 2) {
          return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
        }

        let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
        const len = points.length;

        for (let i = 1; i < len - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          path += ` Q ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}, ${midX.toFixed(2)} ${midY.toFixed(2)}`;
        }

        // Final segment: smooth bezier to last point using second-to-last as control,
        // eliminating the hard kink that a raw L command would produce.
        const secondLast = points[len - 2];
        const last = points[len - 1];
        path += ` Q ${secondLast.x.toFixed(2)} ${secondLast.y.toFixed(2)}, ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
        return path;
      }

      static generateCalligraphyPathData(points, nibWidth = 12, nibAngle = Math.PI / 4) {
        if (!points || points.length === 0) return '';

        const cosAngle = Math.cos(nibAngle);
        const sinAngle = Math.sin(nibAngle);

        if (points.length === 1) {
          const p = points[0];
          const pressure = p.pressure !== undefined ? p.pressure : 0.5;
          const w = nibWidth * (0.4 + 0.8 * pressure);
          const dx = (w / 2) * cosAngle;
          const dy = (w / 2) * sinAngle;

          const x1 = p.x - dx, y1 = p.y - dy;
          const x2 = p.x + dx, y2 = p.y + dy;
          const perpX = -dy * 0.5;
          const perpY = dx * 0.5;

          return `M ${(x1 - perpX).toFixed(2)} ${(y1 - perpY).toFixed(2)} L ${(x2 - perpX).toFixed(2)} ${(y2 - perpY).toFixed(2)} L ${(x2 + perpX).toFixed(2)} ${(y2 + perpY).toFixed(2)} L ${(x1 + perpX).toFixed(2)} ${(y1 + perpY).toFixed(2)} Z`;
        }

        // Filter out duplicate or extremely close points for smooth curve calculation
        const pts = [points[0]];
        for (let i = 1; i < points.length; i++) {
          const prev = pts[pts.length - 1];
          const curr = points[i];
          if (MathUtils.distance(prev, curr) >= 0.8) {
            pts.push(curr);
          }
        }

        const len = pts.length;
        if (len === 1) return this.generateCalligraphyPathData([pts[0]], nibWidth, nibAngle);

        // Interpolate smooth dense points along the spline
        const densePts = [];
        if (len === 2) {
          const p0 = pts[0];
          const p1 = pts[1];
          const dist = MathUtils.distance(p0, p1);
          const steps = Math.max(2, Math.ceil(dist / 1.5));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            densePts.push({
              x: p0.x + (p1.x - p0.x) * t,
              y: p0.y + (p1.y - p0.y) * t,
              pressure: (p0.pressure !== undefined ? p0.pressure : 0.5) * (1 - t) + (p1.pressure !== undefined ? p1.pressure : 0.5) * t
            });
          }
        } else {
          for (let i = 0; i < len - 1; i++) {
            const p0 = (i === 0) ? pts[0] : {
              x: (pts[i - 1].x + pts[i].x) / 2,
              y: (pts[i - 1].y + pts[i].y) / 2,
              pressure: ((pts[i - 1].pressure !== undefined ? pts[i - 1].pressure : 0.5) + (pts[i].pressure !== undefined ? pts[i].pressure : 0.5)) / 2
            };
            const p1 = pts[i];
            const p2 = (i === len - 2) ? pts[len - 1] : {
              x: (pts[i].x + pts[i + 1].x) / 2,
              y: (pts[i].y + pts[i + 1].y) / 2,
              pressure: ((pts[i].pressure !== undefined ? pts[i].pressure : 0.5) + (pts[i + 1].pressure !== undefined ? pts[i + 1].pressure : 0.5)) / 2
            };

            const dist = MathUtils.distance(p0, p1) + MathUtils.distance(p1, p2);
            const steps = Math.max(2, Math.ceil(dist / 1.5));

            const startIdx = (i === 0) ? 0 : 1;
            for (let s = startIdx; s <= steps; s++) {
              const t = s / steps;
              const invT = 1 - t;
              const x = invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x;
              const y = invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y;
              const press = invT * invT * (p0.pressure !== undefined ? p0.pressure : 0.5) + 2 * invT * t * (p1.pressure !== undefined ? p1.pressure : 0.5) + t * t * (p2.pressure !== undefined ? p2.pressure : 0.5);
              densePts.push({ x, y, pressure: press });
            }
          }
        }

        if (densePts.length < 2) return '';

        let path = '';
        for (let i = 0; i < densePts.length - 1; i++) {
          const ptA = densePts[i];
          const ptB = densePts[i + 1];

          const pressA = ptA.pressure !== undefined ? ptA.pressure : 0.5;
          const wA = nibWidth * (0.4 + 0.8 * pressA);
          const dxA = (wA / 2) * cosAngle;
          const dyA = (wA / 2) * sinAngle;

          const pressB = ptB.pressure !== undefined ? ptB.pressure : 0.5;
          const wB = nibWidth * (0.4 + 0.8 * pressB);
          const dxB = (wB / 2) * cosAngle;
          const dyB = (wB / 2) * sinAngle;

          const leftA_x = (ptA.x - dxA).toFixed(2);
          const leftA_y = (ptA.y - dyA).toFixed(2);
          const rightA_x = (ptA.x + dxA).toFixed(2);
          const rightA_y = (ptA.y + dyA).toFixed(2);

          const leftB_x = (ptB.x - dxB).toFixed(2);
          const leftB_y = (ptB.y - dyB).toFixed(2);
          const rightB_x = (ptB.x + dxB).toFixed(2);
          const rightB_y = (ptB.y + dyB).toFixed(2);

          path += `M ${leftA_x} ${leftA_y} L ${leftB_x} ${leftB_y} L ${rightB_x} ${rightB_y} L ${rightA_x} ${rightA_y} Z `;
        }

        return path.trim();
      }

      static filterPoints(points, minDistance = 2) {
        if (points.length <= 1) return points;
        const filtered = [points[0]];
        for (let i = 1; i < points.length; i++) {
          const prev = filtered[filtered.length - 1];
          const curr = points[i];
          if (MathUtils.distance(prev, curr) >= minDistance) {
            filtered.push(curr);
          }
        }
        return filtered;
      }
    }

    /* ==========================================================================
       4.3 SHAPE RECOGNIZER (DRAW TO SHAPE / SMART SHAPES)
       ========================================================================== */
    class ObjectManager {
      constructor() {
        this.objects = new Map();
      }

      addObject(obj) {
        this.objects.set(obj.id, obj);
      }

      removeObject(id) {
        const existed = this.objects.has(id);
        this.objects.delete(id);
        return existed;
      }

      getObject(id) {
        return this.objects.get(id);
      }

      getAllObjects() {
        return Array.from(this.objects.values()).sort((a, b) => a.zIndex - b.zIndex);
      }

      clear() {
        this.objects.clear();
      }

      get count() {
        return this.objects.size;
      }

      /**
       * Vector Hit Testing in World Space Coordinates
       */
      hitTestStroke(point, radius, includeLocked = true) {
        const hitIds = [];
        for (const obj of this.objects.values()) {
          if (obj.hidden) continue;
          if (!includeLocked && obj.locked) continue;
          if (MathUtils.hitTestShape(obj, point, radius)) {
            hitIds.push(obj.id);
          }
        }
        return hitIds;
      }

      /**
       * Finds all objects inside or intersecting a selection box
       */
      findObjectsInBox(box, includeLocked = true) {
        const result = [];
        for (const obj of this.objects.values()) {
          if (obj.hidden) continue;
          if (!includeLocked && obj.locked) continue;
          if (MathUtils.boundsIntersect(box, obj.bounds)) {
            result.push(obj);
          }
        }
        return result;
      }

      updateBoundConnectors(app) {
        const activeApp = app || this.app;
        const allObjs = this.getAllObjects();
        let changed = false;

        for (const obj of allObjs) {
          if (obj.type !== 'line' && obj.type !== 'arrow') continue;
          if (!obj.startBinding && !obj.endBinding) continue;

          let updated = false;

          if (obj.startBinding && obj.startBinding.objectId) {
            const startShape = this.getObject(obj.startBinding.objectId);
            if (startShape && MathUtils.isConnectableShape(startShape)) {
              const pt = MathUtils.getObjectConnectionPoint(startShape, obj.startBinding.pointId, { x: obj.x2, y: obj.y2 });
              if (obj.x1 !== pt.x || obj.y1 !== pt.y) {
                const dx = pt.x - obj.x1;
                const dy = pt.y - obj.y1;
                obj.x1 = pt.x;
                obj.y1 = pt.y;
                if (obj.cx !== undefined) obj.cx += dx * 0.5;
                if (obj.cy !== undefined) obj.cy += dy * 0.5;
                updated = true;
              }
            } else {
              delete obj.startBinding;
              updated = true;
            }
          }

          if (obj.endBinding && obj.endBinding.objectId) {
            const endShape = this.getObject(obj.endBinding.objectId);
            if (endShape && MathUtils.isConnectableShape(endShape)) {
              const pt = MathUtils.getObjectConnectionPoint(endShape, obj.endBinding.pointId, { x: obj.x1, y: obj.y1 });
              if (obj.x2 !== pt.x || obj.y2 !== pt.y) {
                const dx = pt.x - obj.x2;
                const dy = pt.y - obj.y2;
                obj.x2 = pt.x;
                obj.y2 = pt.y;
                if (obj.cx !== undefined) obj.cx += dx * 0.5;
                if (obj.cy !== undefined) obj.cy += dy * 0.5;
                updated = true;
              }
            } else {
              delete obj.endBinding;
              updated = true;
            }
          }

          if (obj.arrowType === 'elbow') {
            if (MathUtils.isElbowAuto(obj)) {
              if (MathUtils.autoRouteElbow(obj, this)) updated = true;
            } else if (MathUtils.repairElbowEnds(obj, this)) {
              updated = true;
            }
            if (MathUtils.syncElbowSides(obj, this)) updated = true;
          }

          if (updated) {
            obj.bounds = MathUtils.getObjectBounds(obj);
            if (activeApp && activeApp.renderer) {
              activeApp.renderer.renderObject(obj);
            }
            changed = true;
          }
        }

        return changed;
      }
    }

    /* ==========================================================================
       5. STORAGE MANAGER (INDEXEDDB OFFLINE STORAGE ENGINE)
       ========================================================================== */
    class StorageManager {
      constructor(onStatusChange) {
        this.dbName = 'VectorWhiteboardDB';
        this.storeName = 'board_objects';
        this.db = null;
        this.saveTimeout = null;
        this.onStatusChange = onStatusChange || (() => {});
      }

      async init() {
        if (this.db) {
        zqGateCheck(); // ZQ-GATE: 2 - storage init
          try { this.db.close(); } catch (e) {}
          this.db = null;
        }
        return new Promise((resolve) => {
          try {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains(this.storeName)) {
                db.createObjectStore(this.storeName, { keyPath: 'id' });
              }
            };

            request.onsuccess = (e) => {
              this.db = e.target.result;
              this.db.onclose = () => {
                this.db = null;
              };
              this.db.onversionchange = () => {
                if (this.db) {
                  try { this.db.close(); } catch (err) {}
                  this.db = null;
                }
              };
              resolve();
            };

            request.onerror = (e) => {
              console.error('IndexedDB error:', e);
              this.db = null;
              resolve();
            };
          } catch (e) {
            console.error('IndexedDB open error:', e);
            this.db = null;
            resolve();
          }
        });
      }

      async getDB() {
        if (!this.db) {
          await this.init();
        }
        return this.db;
      }

      async loadAllObjects() {
        try {
          const db = await this.getDB();
          if (!db) return [];
          return new Promise((resolve) => {
            try {
              const transaction = db.transaction(this.storeName, 'readonly');
              const store = transaction.objectStore(this.storeName);
              const request = store.getAll();

              request.onsuccess = () => {
                resolve(request.result || []);
              };

              request.onerror = () => {
                resolve([]);
              };
            } catch (e) {
              console.warn('IDB loadAllObjects failed:', e);
              this.db = null;
              resolve([]);
            }
          });
        } catch (e) {
          return [];
        }
      }

      async loadObjectsForBoard(boardId) {
        const allObjects = await this.loadAllObjects();
        return allObjects.filter(obj => {
          if (obj.boardId) {
            return obj.boardId === boardId;
          }
          // Backward compatibility for legacy objects created before boards feature
          return boardId === 'default_board' || boardId === 'board_1';
        });
      }

      async deleteObjectsForBoard(boardId) {
        const allObjects = await this.loadAllObjects();
        const toDelete = allObjects.filter(obj => {
          if (obj.boardId) return obj.boardId === boardId;
          return boardId === 'default_board' || boardId === 'board_1';
        });
        for (const obj of toDelete) {
          await this.deleteObject(obj.id);
        }
      }

      async duplicateObjectsForBoard(sourceBoardId, targetBoardId) {
        const sourceObjects = await this.loadObjectsForBoard(sourceBoardId);
        if (!sourceObjects || sourceObjects.length === 0) return [];

        const newObjects = sourceObjects.map(obj => {
          const copy = JSON.parse(JSON.stringify(obj));
          copy.id = (obj.type || 'stroke') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          copy.boardId = targetBoardId;
          return copy;
        });

        await this.saveObjectsBatch(newObjects);
        return newObjects;
      }

      async saveObjectsBatch(objects) {
        zqGateCheck(); // ZQ-GATE: 4 - every save
        if (!objects || objects.length === 0) return;
        const currentActiveBoardId = SafeStorage.getItem('vector_active_board_id') || 'default_board';
        for (const obj of objects) {
          if (!obj.boardId) {
            obj.boardId = currentActiveBoardId;
          }
        }
        this.onStatusChange('saving');
        try {
          let db = await this.getDB();
          if (!db) return;

          const executeTx = (dbConn) => {
            return new Promise((resolve, reject) => {
              const transaction = dbConn.transaction(this.storeName, 'readwrite');
              const store = transaction.objectStore(this.storeName);
              for (const obj of objects) {
                store.put(obj);
              }
              transaction.oncomplete = () => {
                this.onStatusChange('saved');
                resolve(true);
              };
              transaction.onerror = (e) => {
                reject(e);
              };
            });
          };

          try {
            await executeTx(db);
          } catch (e) {
            this.db = null;
            db = await this.getDB();
            if (db) {
              await executeTx(db).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('IDB saveObjectsBatch error:', e);
          this.onStatusChange('saved');
        }
      }

      async saveObject(obj) {
        return this.saveObjectsBatch([obj]);
      }

      async saveAll(objects) {
        return this.saveObjectsBatch(objects);
      }

      async deleteObject(id) {
        if (!id) return;
        this.onStatusChange('saving');
        try {
          let db = await this.getDB();
          if (!db) return;

          const executeTx = (dbConn) => {
            return new Promise((resolve, reject) => {
              const transaction = dbConn.transaction(this.storeName, 'readwrite');
              const store = transaction.objectStore(this.storeName);
              store.delete(id);
              transaction.oncomplete = () => {
                this.onStatusChange('saved');
                resolve(true);
              };
              transaction.onerror = (e) => reject(e);
            });
          };

          try {
            await executeTx(db);
          } catch (e) {
            this.db = null;
            db = await this.getDB();
            if (db) {
              await executeTx(db).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('IDB deleteObject error:', e);
          this.onStatusChange('saved');
        }
      }

      async clearAll() {
        this.onStatusChange('saving');
        try {
          let db = await this.getDB();
          if (!db) return;

          const executeTx = (dbConn) => {
            return new Promise((resolve, reject) => {
              const transaction = dbConn.transaction(this.storeName, 'readwrite');
              const store = transaction.objectStore(this.storeName);
              store.clear();
              transaction.oncomplete = () => {
                this.onStatusChange('saved');
                resolve(true);
              };
              transaction.onerror = (e) => reject(e);
            });
          };

          try {
            await executeTx(db);
          } catch (e) {
            this.db = null;
            db = await this.getDB();
            if (db) {
              await executeTx(db).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('IDB clearAll error:', e);
          this.onStatusChange('saved');
        }
      }
    }

    /* ==========================================================================
       6. HISTORY MANAGER (COMMAND PATTERN UNDO / REDO)
       ========================================================================== */
    class AddObjectCommand {
      constructor(objectManager, storageManager, renderer, object) {
        this.objectManager = objectManager;
        this.storageManager = storageManager;
        this.renderer = renderer;
        this.object = object;
      }

      execute() {
        this.objectManager.addObject(this.object);
        this.renderer.renderObject(this.object);
        this.storageManager.saveObject(this.object);
      }

      undo() {
        this.objectManager.removeObject(this.object.id);
        this.renderer.removeObjectElement(this.object.id);
        this.storageManager.deleteObject(this.object.id);
      }
    }

    class AddObjectsCommand {
      constructor(objectManager, storageManager, renderer, objects) {
        this.objectManager = objectManager;
        this.storageManager = storageManager;
        this.renderer = renderer;
        this.objects = Array.isArray(objects) ? objects : [objects];
      }

      execute() {
        for (const obj of this.objects) {
          this.objectManager.addObject(obj);
          this.renderer.renderObject(obj);
        }
        this.storageManager.saveObjectsBatch(this.objects);
      }

      undo() {
        for (const obj of this.objects) {
          this.objectManager.removeObject(obj.id);
          this.renderer.removeObjectElement(obj.id);
          this.storageManager.deleteObject(obj.id);
        }
      }
    }

    class DeleteObjectsCommand {
      constructor(objectManager, storageManager, renderer, objects) {
        this.objectManager = objectManager;
        this.storageManager = storageManager;
        this.renderer = renderer;
        this.objects = Array.isArray(objects) ? objects : [objects];
      }

      execute() {
        for (const obj of this.objects) {
          this.objectManager.removeObject(obj.id);
          this.renderer.removeObjectElement(obj.id);
          this.storageManager.deleteObject(obj.id);
        }
        this.objectManager.updateBoundConnectors({ renderer: this.renderer });
      }

      undo() {
        for (const obj of this.objects) {
          this.objectManager.addObject(obj);
          this.renderer.renderObject(obj);
          this.storageManager.saveObject(obj);
        }
        this.objectManager.updateBoundConnectors({ renderer: this.renderer });
      }
    }

    class TransformObjectsCommand {
      constructor(objectManager, storageManager, renderer, oldStateArray, newStateArray) {
        this.objectManager = objectManager;
        this.storageManager = storageManager;
        this.renderer = renderer;
        this.oldStateArray = oldStateArray;
        this.newStateArray = newStateArray;
      }

      execute() {
        for (const newObj of this.newStateArray) {
          this.objectManager.addObject(newObj);
          this.renderer.renderObject(newObj);
        }
        this.objectManager.updateBoundConnectors({ renderer: this.renderer });
        this.storageManager.saveObjectsBatch(this.newStateArray);
      }

      undo() {
        for (const oldObj of this.oldStateArray) {
          this.objectManager.addObject(oldObj);
          this.renderer.renderObject(oldObj);
        }
        this.objectManager.updateBoundConnectors({ renderer: this.renderer });
        this.storageManager.saveObjectsBatch(this.oldStateArray);
      }
    }

    class ClearCanvasCommand {
      constructor(objectManager, storageManager, renderer) {
        this.objectManager = objectManager;
        this.storageManager = storageManager;
        this.renderer = renderer;
        this.previousObjects = objectManager.getAllObjects().map(o => JSON.parse(JSON.stringify(o)));
      }

      execute() {
        this.objectManager.clear();
        this.renderer.clearObjectsLayer();
        this.storageManager.clearAll();
      }

      undo() {
        for (const obj of this.previousObjects) {
          const cloned = JSON.parse(JSON.stringify(obj));
          this.objectManager.addObject(cloned);
          this.renderer.renderObject(cloned);
        }
        this.storageManager.saveObjectsBatch(this.previousObjects);
      }
    }

    class HistoryManager {
      constructor(onChange) {
        this.undoStack = [];
        this.redoStack = [];
        this.onChange = onChange || (() => {});
      }

      push(command) {
        this.undoStack.push(command);
        this.redoStack = [];
        this.notify();
      }

      execute(command) {
        command.execute();
        this.undoStack.push(command);
        this.redoStack = [];
        this.notify();
      }

      undo() {
        if (!this.canUndo) return;
        const cmd = this.undoStack.pop();
        cmd.undo();
        this.redoStack.push(cmd);
        this.notify();
      }

      redo() {
        if (!this.canRedo) return;
        const cmd = this.redoStack.pop();
        cmd.execute();
        this.undoStack.push(cmd);
        this.notify();
      }

      clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.notify();
      }

      get canUndo() {
        return this.undoStack.length > 0;
      }

      get canRedo() {
        return this.redoStack.length > 0;
      }

      notify() {
        this.onChange({ canUndo: this.canUndo, canRedo: this.canRedo });
      }
    }

    /* ==========================================================================
       7. SVG RENDERER (DOM ELEMENT MANAGEMENT & SELECTION OVERLAY)
       ========================================================================== */
    class SVGRenderer {
      constructor(svgStage) {
        this.svgStage = svgStage;
        this.objectsLayer = document.getElementById('objects-layer');
        this.previewLayer = document.getElementById('preview-layer');
        this.overlayLayer = document.getElementById('overlay-layer');
        this.selectionOverlayGroup = document.getElementById('selection-overlay-group');
        this.eraserCursor = document.getElementById('eraser-cursor');
        this.elementsMap = new Map();
        this.currentPreviewEl = null;
      }

      getFillValue(fillColor, patternStyle) {
        if (!patternStyle || patternStyle === 'solid') {
          return fillColor || 'none';
        }

        let baseColor = fillColor;
        if (!baseColor || baseColor === 'none' || baseColor === 'transparent') {
          baseColor = '#3b82f6';
        }

        const cleanColor = baseColor.replace(/[^a-zA-Z0-9]/g, '');
        const patternId = `pat_${patternStyle}_${cleanColor}`;

        let patternDefs = document.getElementById('dynamic-pattern-defs');
        if (!patternDefs) {
          const svgDefs = this.svgStage ? this.svgStage.querySelector('defs') : document.querySelector('#svg-stage defs');
          if (svgDefs) {
            patternDefs = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            patternDefs.setAttribute('id', 'dynamic-pattern-defs');
            svgDefs.appendChild(patternDefs);
          }
        }

        if (patternDefs && !document.getElementById(patternId)) {
          const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
          pattern.setAttribute('id', patternId);
          pattern.setAttribute('patternUnits', 'userSpaceOnUse');

          if (patternStyle === 'stripes') {
            pattern.setAttribute('width', '16');
            pattern.setAttribute('height', '16');
            pattern.setAttribute('patternTransform', 'rotate(45)');
            pattern.innerHTML = `
              <rect width="16" height="16" fill="${baseColor}" fill-opacity="0.12" />
              <line x1="0" y1="0" x2="0" y2="16" stroke="${baseColor}" stroke-width="3" />
            `;
          } else if (patternStyle === 'crosshatch') {
            pattern.setAttribute('width', '16');
            pattern.setAttribute('height', '16');
            pattern.innerHTML = `
              <rect width="16" height="16" fill="${baseColor}" fill-opacity="0.12" />
              <line x1="0" y1="0" x2="16" y2="0" stroke="${baseColor}" stroke-width="2" />
              <line x1="0" y1="0" x2="0" y2="16" stroke="${baseColor}" stroke-width="2" />
            `;
          } else if (patternStyle === 'dots') {
            pattern.setAttribute('width', '18');
            pattern.setAttribute('height', '18');
            pattern.innerHTML = `
              <rect width="18" height="18" fill="${baseColor}" fill-opacity="0.10" />
              <circle cx="9" cy="9" r="3.5" fill="${baseColor}" />
            `;
          }

          patternDefs.appendChild(pattern);
        }

        return `url(#${patternId})`;
      }

      renderObject(obj) {
        let el = this.elementsMap.get(obj.id);

        if (obj.type === 'rectangle') {
          if (!el || el.tagName.toLowerCase() !== 'g') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }
          const rxVal = obj.cornerRadius !== undefined ? obj.cornerRadius : 0;
          const fillVal = this.getFillValue(obj.fill, obj.patternStyle);
          const strokeColor = obj.stroke || '#0f172a';
          const strokeWidth = obj.strokeWidth || 2;
          const rectDash = MathUtils.getDashArray(obj.strokeStyle, strokeWidth);
          const dashAttr = rectDash ? `stroke-dasharray="${rectDash}"` : '';
          const opacity = obj.opacity !== undefined ? obj.opacity : 1;
          const labelText = obj.text || '';
          const textEscaped = MathUtils.escapeHtml(labelText);
          const fontSize = obj.fontSize || MathUtils.calculateStickyFontSize(obj.text || '', obj.width, obj.height);
          const fontW = obj.bold ? '700' : (obj.isMindMapNode ? '600' : '500');
          const fontS = obj.italic ? 'italic' : 'normal';
          const textDeco = (obj.underline && obj.strike) ? 'underline line-through' : (obj.underline ? 'underline' : (obj.strike ? 'line-through' : 'none'));
          const textColor = obj.textColor || (obj.isMindMapNode ? strokeColor : '#0f172a');

          el.setAttribute('opacity', opacity);
          if (obj.blendMode) el.style.mixBlendMode = obj.blendMode;
          else el.style.mixBlendMode = 'normal';

          const mmOverflowWrap = obj.isMindMapNode ? ' overflow-wrap:anywhere;' : '';
          const labelHtml = labelText ? `
            <foreignObject x="${obj.x}" y="${obj.y}" width="${Math.max(obj.width, 2)}" height="${Math.max(obj.height, 2)}" pointer-events="none">
              <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; padding:6px 12px; font-size:${fontSize}px; font-weight:${fontW}; font-style:${fontS}; text-decoration:${textDeco}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:${textColor}; word-break:break-word; overflow-wrap:anywhere; overflow:hidden; display:flex; align-items:center; justify-content:center; text-align:center; box-sizing:border-box; line-height:1.25; user-select:none;">
                <span style="display:inline-block; max-width:100%; max-height:100%; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">${textEscaped}</span>
              </div>
            </foreignObject>
          ` : '';

          el.innerHTML = `
            <rect x="${obj.x}" y="${obj.y}" width="${Math.max(obj.width, 2)}" height="${Math.max(obj.height, 2)}" ${rxVal > 0 ? `rx="${rxVal}"` : ''} fill="${fillVal}" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${dashAttr} />
            ${labelHtml}
          `;
        } else if (obj.type === 'frame') {
          if (!el || el.tagName.toLowerCase() !== 'g') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }
          const strokeColor = obj.stroke || '#3b82f6';
          const fillColor = this.getFillValue(obj.fill || 'rgba(59, 130, 246, 0.03)', obj.patternStyle);
          const titleText = (obj.title || 'Frame').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const strokeW = obj.strokeWidth || 2;
          const frameDash = MathUtils.getDashArray('dashed', strokeW);
          const opac = obj.opacity !== undefined ? obj.opacity : 1;

          el.innerHTML = `
            <rect x="${obj.x}" y="${obj.y}" width="${Math.max(obj.width, 10)}" height="${Math.max(obj.height, 10)}"
                  rx="8" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-dasharray="${frameDash}"
                  opacity="${opac}"/>
            <foreignObject x="${obj.x}" y="${obj.y - 28}" width="${Math.max(obj.width, 180)}" height="26" pointer-events="none">
              <div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-flex; align-items:center; gap:4px; background:${strokeColor}; color:#ffffff; font-size:12px; font-weight:700; padding:3px 10px 3px 6px; border-radius:6px 6px 0 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; pointer-events:none; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; max-width:100%; box-shadow:0 2px 5px rgba(0,0,0,0.12); box-sizing:border-box;">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="opacity:0.7;flex-shrink:0;" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="5" cy="4" r="1.3"/><circle cx="11" cy="4" r="1.3"/>
                  <circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>
                  <circle cx="5" cy="12" r="1.3"/><circle cx="11" cy="12" r="1.3"/>
                </svg>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/><path d="M3 9h18"/></svg>
                <span style="overflow:hidden; text-overflow:ellipsis;">${titleText}</span>
              </div>
            </foreignObject>
            <rect x="${obj.x}" y="${obj.y - 28}" width="${Math.min(Math.max(obj.width, 180), 300)}" height="26"
                  rx="0" fill="transparent" stroke="none"
                  data-handle="frame-header-drag" data-frame-id="${obj.id}"
                  style="cursor:grab;" pointer-events="all"/>
          `;
        } else if (obj.type === 'ellipse') {
          if (!el || el.tagName.toLowerCase() !== 'g') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }
          const cx = obj.x + obj.width / 2;
          const cy = obj.y + obj.height / 2;
          const rx = Math.max(obj.width / 2, 1);
          const ry = Math.max(obj.height / 2, 1);
          const fillVal = this.getFillValue(obj.fill, obj.patternStyle);
          const strokeColor = obj.stroke || '#0f172a';
          const strokeWidth = obj.strokeWidth || 2;
          const ellipseDash = MathUtils.getDashArray(obj.strokeStyle, strokeWidth);
          const dashAttr = ellipseDash ? `stroke-dasharray="${ellipseDash}"` : '';
          const opacity = obj.opacity !== undefined ? obj.opacity : 1;
          const labelText = obj.text || '';
          const textEscaped = MathUtils.escapeHtml(labelText);
          const fontSize = obj.fontSize || MathUtils.calculateStickyFontSize(obj.text || '', obj.width, obj.height);
          const fontW = obj.bold ? '700' : '500';
          const fontS = obj.italic ? 'italic' : 'normal';
          const textDeco = (obj.underline && obj.strike) ? 'underline line-through' : (obj.underline ? 'underline' : (obj.strike ? 'line-through' : 'none'));
          const textColor = obj.textColor || strokeColor;

          el.setAttribute('opacity', opacity);
          if (obj.blendMode) el.style.mixBlendMode = obj.blendMode;
          else el.style.mixBlendMode = 'normal';

          const labelHtml = labelText ? `
            <foreignObject x="${obj.x}" y="${obj.y}" width="${Math.max(obj.width, 2)}" height="${Math.max(obj.height, 2)}" pointer-events="none">
              <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; padding:10px 16px; font-size:${fontSize}px; font-weight:${fontW}; font-style:${fontS}; text-decoration:${textDeco}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:${textColor}; word-break:break-word; overflow-wrap:anywhere; overflow:hidden; display:flex; align-items:center; justify-content:center; text-align:center; box-sizing:border-box; line-height:1.25; user-select:none;">
                <span style="display:inline-block; max-width:100%; max-height:100%; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">${textEscaped}</span>
              </div>
            </foreignObject>
          ` : '';

          el.innerHTML = `
            <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fillVal}" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${dashAttr} />
            ${labelHtml}
          `;
        } else if (obj.type === 'line' || obj.type === 'arrow') {
          const x1 = obj.x1 || 0;
          const y1 = obj.y1 || 0;
          const x2 = obj.x2 || 0;
          const y2 = obj.y2 || 0;
          const cx = obj.cx !== undefined ? obj.cx : (x1 + x2) / 2;
          const cy = obj.cy !== undefined ? obj.cy : (y1 + y2) / 2;
          let midX, midY;
          if (obj.arrowType === 'elbow') {
            const em = MathUtils.getElbowMid(obj);
            midX = em.x;
            midY = em.y;
          } else {
            midX = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
            midY = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
          }

          if (!el || el.tagName !== 'g') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }

          const strokeWidth = obj.strokeWidth || 2;
          const markerAttr = obj.type === 'arrow' ? MathUtils.getArrowMarkers(obj.arrowType || 'single') : '';
          const dashAttr = MathUtils.getDashAttr(obj.strokeStyle, strokeWidth);
          const strokeColor = obj.stroke || '#0f172a';
          const opacity = obj.opacity !== undefined ? obj.opacity : 1;

          let textMarkup = '';
          if (obj.text && obj.text.trim()) {
            const textEscaped = obj.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
            const lines = obj.text.split('\n');
            const maxLineLen = Math.max(...lines.map(l => l.length), 1);
            const fs = 14;
            const labelWidth = Math.max(maxLineLen * 9 + 20, 50);
            const labelHeight = Math.max(lines.length * 18 + 8, 26);
            const lx = midX - labelWidth / 2;
            const ly = midY - labelHeight / 2;

            textMarkup = `
              <foreignObject x="${lx}" y="${ly}" width="${labelWidth}" height="${labelHeight}">
                <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:rgba(255, 255, 255, 0.95); border:1.5px solid ${strokeColor}; border-radius:6px; padding:2px 6px; font-size:${fs}px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:${strokeColor}; box-shadow:0 2px 6px rgba(0,0,0,0.12); white-space:pre-wrap; word-break:break-word; text-align:center; box-sizing:border-box; line-height:1.2; pointer-events:none;">
                  ${textEscaped}
                </div>
              </foreignObject>
            `;
          }

          const pathD = MathUtils.getArrowPathD(obj.arrowType || 'single', x1, y1, x2, y2, cx, cy, obj.elbowDir, obj.elbowTracks, MathUtils.getElbowSide(obj, 'start'), MathUtils.getElbowSide(obj, 'end'));

          el.innerHTML = `
            <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${dashAttr} ${markerAttr} opacity="${opacity}" />
            ${textMarkup}
          `;

        } else if (obj.type === 'text') {
          // Gemini-style: render as SVG <g class="text-group"> with <rect> bg + <text>/<tspan>
          let groupEl = el;
          if (!groupEl || groupEl.tagName !== 'g' || !groupEl.classList.contains('text-group')) {
            if (groupEl && groupEl.parentNode) groupEl.parentNode.removeChild(groupEl);
            groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            groupEl.setAttribute('id', `obj-${obj.id}`);
            groupEl.setAttribute('class', 'text-group');
            groupEl.style.cursor = 'move';
            el = groupEl;
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }

          const fs = obj.fontSize || 24;
          const lines = MathUtils.wrapTextToWidth(obj.text || ' ', fs, obj.bold, obj.italic, obj.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
          const lineHeight = fs * 1.2;
          const bgVal = (obj.fill && obj.fill !== 'none' && obj.fill !== 'transparent') ? obj.fill : 'transparent';
          const hasBg = bgVal !== 'transparent';
          const fontW = obj.bold ? '700' : '400';
          const fontS = obj.italic ? 'italic' : 'normal';
          const textDeco = (obj.underline && obj.strike) ? 'underline line-through' : (obj.underline ? 'underline' : (obj.strike ? 'line-through' : 'none'));
          const opVal = obj.opacity !== undefined ? obj.opacity : 1;

          // Get or create text node
          let textNode = groupEl.querySelector('text.gemini-text');
          if (!textNode) {
            textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textNode.setAttribute('class', 'gemini-text');
            textNode.setAttribute('dominant-baseline', 'alphabetic');
            textNode.style.pointerEvents = 'none';
            groupEl.appendChild(textNode);
          }

          const objFontFamily = obj.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const objTextAlign = obj.textAlign || 'left';

          // First pass: render at obj.x with start anchor so getBBox gives accurate width
          textNode.setAttribute('font-family', objFontFamily);
          textNode.setAttribute('font-size', fs);
          textNode.setAttribute('font-weight', fontW);
          textNode.setAttribute('font-style', fontS);
          textNode.setAttribute('text-decoration', textDeco);
          textNode.setAttribute('fill', obj.stroke || '#0f172a');
          textNode.setAttribute('opacity', opVal);
          textNode.setAttribute('text-anchor', 'start');
          textNode.setAttribute('x', obj.x);

          const baselineY = obj.y + (fs * 0.85);
          textNode.setAttribute('y', baselineY);
          textNode.innerHTML = '';

          lines.forEach((line, index) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', obj.x);
            if (index === 0) {
              tspan.setAttribute('y', baselineY);
            } else {
              tspan.setAttribute('dy', `${lineHeight}px`);
            }
            tspan.textContent = line || ' ';
            textNode.appendChild(tspan);
          });

          // Second pass: apply alignment now that getBBox can give real width
          try {
            const bbox = textNode.getBBox();
            const textW = bbox.width || 0;
            let anchorVal = 'start';
            let anchorX = obj.x;
            if (objTextAlign === 'center') { anchorVal = 'middle'; anchorX = obj.x + textW / 2; }
            else if (objTextAlign === 'right') { anchorVal = 'end'; anchorX = obj.x + textW; }
            if (objTextAlign !== 'left') {
              textNode.setAttribute('text-anchor', anchorVal);
              textNode.setAttribute('x', anchorX);
              textNode.querySelectorAll('tspan').forEach(ts => ts.setAttribute('x', anchorX));
            }
          } catch(e) {}

          // Background rect
          let rectNode = groupEl.querySelector('rect.text-bg');
          if (hasBg && obj.text) {
            try {
              const bbox = textNode.getBBox();
              const padding = 4;
              if (!rectNode) {
                rectNode = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rectNode.setAttribute('class', 'text-bg');
                rectNode.setAttribute('rx', '4');
                groupEl.insertBefore(rectNode, textNode);
              }
              rectNode.setAttribute('x', bbox.x - padding);
              rectNode.setAttribute('y', bbox.y - padding);
              rectNode.setAttribute('width', bbox.width + padding * 2);
              rectNode.setAttribute('height', bbox.height + padding * 2);
              rectNode.setAttribute('fill', bgVal);
              rectNode.setAttribute('opacity', opVal);
            } catch(e) {}
          } else if (rectNode) {
            rectNode.remove();
          }

          // Update bounds based on text — use getBBox() so bounds match the actual
          // rendered glyph position, not the baseline-derived obj.y which is offset.
          try {
            const bbox = textNode.getBBox();
            const bgPad = hasBg ? 4 : 0;
            const bx = bbox.x - bgPad;
            const by = bbox.y - bgPad;
            const bw = Math.max(bbox.width + bgPad * 2, 24);
            const bh = Math.max(bbox.height + bgPad * 2, fs * 1.2);
            obj.width = bw;
            obj.height = bh;
            obj.bounds = { minX: bx, minY: by, maxX: bx + bw, maxY: by + bh, width: bw, height: bh };
          } catch(e) {
            obj.width = obj.width || 40;
            obj.height = obj.height || fs * 1.2;
            obj.bounds = { minX: obj.x, minY: obj.y, maxX: obj.x + obj.width, maxY: obj.y + obj.height, width: obj.width, height: obj.height };
          }

          // Store data for drag/edit
          groupEl.dataset.objId = obj.id;
          groupEl.dataset.y = obj.y;
        } else if (obj.type === 'image') {
          // Use a <g> wrapper so we can apply clipPath for cropping
          let groupEl = el;
          let imgEl;
          if (!groupEl || groupEl.tagName !== 'g' || !groupEl.classList.contains('image-group')) {
            if (groupEl && groupEl.parentNode) groupEl.parentNode.removeChild(groupEl);
            groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            groupEl.setAttribute('class', 'image-group');
            groupEl.setAttribute('id', `obj-${obj.id}`);
            imgEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            imgEl.setAttribute('class', 'image-el');
            groupEl.appendChild(imgEl);
            el = groupEl;
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          } else {
            imgEl = groupEl.querySelector('image.image-el');
            if (!imgEl) {
              imgEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
              imgEl.setAttribute('class', 'image-el');
              groupEl.appendChild(imgEl);
            }
          }

          const cx = obj.cropX || 0, cy = obj.cropY || 0;
          const cw = obj.cropW || 1, ch = obj.cropH || 1;
          const w = Math.max(obj.width, 10);
          const h = Math.max(obj.height, 10);
          // The full image is drawn larger so the cropped region fills obj bounds
          const fullW = w / cw, fullH = h / ch;
          const imgX = obj.x - cx * fullW, imgY = obj.y - cy * fullH;

          imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', obj.src);
          imgEl.setAttribute('href', obj.src);
          imgEl.setAttribute('x', imgX);
          imgEl.setAttribute('y', imgY);
          imgEl.setAttribute('width', fullW);
          imgEl.setAttribute('height', fullH);
          imgEl.setAttribute('preserveAspectRatio', 'none');
          imgEl.setAttribute('opacity', obj.opacity !== undefined ? obj.opacity : 1);

          // clipPath pinned to obj bounds
          const clipId = `img-clip-${obj.id}`;
          let clipEl = document.getElementById(clipId);
          if (!clipEl) {
            const defs = this.svgStage.querySelector('defs') || (() => {
              const d = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
              this.svgStage.insertBefore(d, this.svgStage.firstChild);
              return d;
            })();
            clipEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clipEl.setAttribute('id', clipId);
            const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            clipEl.appendChild(clipRect);
            defs.appendChild(clipEl);
          }
          const clipRect = clipEl.querySelector('rect');
          const cr = obj.cornerRadius !== undefined ? obj.cornerRadius : 0;
          clipRect.setAttribute('x', obj.x);
          clipRect.setAttribute('y', obj.y);
          clipRect.setAttribute('width', w);
          clipRect.setAttribute('height', h);
          clipRect.setAttribute('rx', cr);
          clipRect.setAttribute('ry', cr);
          groupEl.setAttribute('clip-path', `url(#${clipId})`);
          el = groupEl;
        } else if (obj.type === 'table') {
          if (!el || el.tagName !== 'g') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }

          const x = obj.x || 0;
          const y = obj.y || 0;
          const w = Math.max(obj.width || 180, 40);
          const h = Math.max(obj.height || 100, 30);
          const rows = Math.max(1, obj.rows || 3);
          const cols = Math.max(1, obj.cols || 3);
          const headerRow = obj.headerRow !== false;
          const stroke = obj.stroke || '#cbd5e1';
          const strokeWidth = obj.strokeWidth || 1.5;
          const opacity = obj.opacity !== undefined ? obj.opacity : 1;
          const baseFill = this.getFillValue(obj.fill || '#ffffff', obj.patternStyle);
          const headerFill = obj.headerFill || '#f1f5f9';
          const colW = w / cols;
          const rowH = h / rows;
          const cells = obj.cells || [];
          const preferredFontSize = obj.fontSize || Math.max(11, Math.min(16, Math.round(rowH * 0.42)));

          let gridD = '';
          for (let r = 1; r < rows; r++) {
            const ry = (y + r * rowH).toFixed(1);
            gridD += `M ${x.toFixed(1)} ${ry} L ${(x + w).toFixed(1)} ${ry} `;
          }
          for (let c = 1; c < cols; c++) {
            const cx = (x + c * colW).toFixed(1);
            gridD += `M ${cx} ${y.toFixed(1)} L ${cx} ${(y + h).toFixed(1)} `;
          }

          const paddingX = 8;
          const paddingY = 4;

          let cellsHTML = '';
          for (let r = 0; r < rows; r++) {
            const isH = headerRow && r === 0;
            const cellY = y + r * rowH;
            for (let c = 0; c < cols; c++) {
              const cellX = x + c * colW;
              const cellText = (cells[r] && cells[r][c] !== undefined) ? String(cells[r][c]) : (isH ? `Header ${c + 1}` : '');
              const fw = isH ? '700' : '500';
              const textCol = isH ? (obj.headerTextColor || '#0f172a') : (obj.textColor || '#1e293b');
              const textLayout = MathUtils.getFittedTextLayout(cellText, colW, rowH, { fontSize: preferredFontSize, paddingX, paddingY, lineHeight: 1.25 });

              cellsHTML += `
                <foreignObject x="${cellX.toFixed(1)}" y="${cellY.toFixed(1)}" width="${colW.toFixed(1)}" height="${rowH.toFixed(1)}" pointer-events="none">
                  <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; padding:${textLayout.paddingY}px ${textLayout.paddingX}px; font-size:${textLayout.fontSize}px; font-weight:${fw}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:${textCol}; overflow:hidden; display:flex; align-items:center; justify-content:flex-start; box-sizing:border-box; line-height:1.25; user-select:none;">
                    <span style="display:block; max-width:100%; overflow:hidden; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">${MathUtils.textLinesToHtml(textLayout.lines)}</span>
                  </div>
                </foreignObject>
              `;
            }
          }

          el.innerHTML = `
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${baseFill}" opacity="${opacity}" style="filter: drop-shadow(0 1px 3px rgba(0,0,0,0.06));" />
            ${headerRow ? `<path d="M ${x} ${y + 6} A 6 6 0 0 1 ${x + 6} ${y} L ${x + w - 6} ${y} A 6 6 0 0 1 ${x + w} ${y + 6} L ${x + w} ${y + rowH} L ${x} ${y + rowH} Z" fill="${headerFill}" opacity="${opacity}" />` : ''}
            <path d="${gridD}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, strokeWidth * 0.75)}" opacity="${opacity}" pointer-events="none" />
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="${stroke}" stroke-width="${Math.max(strokeWidth, 1.5)}" opacity="${opacity}" pointer-events="none" />
            ${cellsHTML}
          `;
        } else if (obj.type === 'sticky') {
          if (!el || el.tagName !== 'g') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }
          const textVal = obj.text || '';
          const textLayout = MathUtils.getStickyTextLayout(textVal, obj.width || 180, obj.height || 180);
          const stickyFill = this.getFillValue(obj.fill || '#fef08a', obj.patternStyle);

          el.innerHTML = `
            <rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="10" fill="${stickyFill}" filter="url(#sticky-shadow)" opacity="${obj.opacity !== undefined ? obj.opacity : 1}" />
            <foreignObject x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" pointer-events="none">
              <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; padding:${textLayout.paddingY}px ${textLayout.paddingX}px; font-size:${textLayout.fontSize}px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:${obj.textColor || obj.stroke || '#0f172a'}; overflow:hidden; display:flex; align-items:center; justify-content:center; text-align:center; box-sizing:border-box; line-height:1.3;">
                <span style="display:block; max-width:100%; overflow:hidden; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">${MathUtils.textLinesToHtml(textLayout.lines)}</span>
              </div>
            </foreignObject>
          `;
        } else if (obj.type === 'shape') {
          if (!el || el.tagName !== 'g') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);

            if (obj.shapeType === 'custom_fill') {
              const boundaryChild = Array.from(this.objectsLayer.children).find(c => {
                const id = c.id ? c.id.replace('obj-', '') : '';
                const o = this.app?.objectManager?.getObject(id);
                return o && o.type !== 'frame' && o.shapeType !== 'custom_fill';
              });
              if (boundaryChild) {
                this.objectsLayer.insertBefore(el, boundaryChild);
              } else {
                this.objectsLayer.appendChild(el);
              }
            } else {
              this.objectsLayer.appendChild(el);
            }
          } else if (obj.shapeType === 'custom_fill' && el.parentNode === this.objectsLayer) {
            const boundaryChild = Array.from(this.objectsLayer.children).find(c => {
              const id = c.id ? c.id.replace('obj-', '') : '';
              const o = this.app?.objectManager?.getObject(id);
              return o && o.type !== 'frame' && o.shapeType !== 'custom_fill';
            });
            if (boundaryChild && boundaryChild !== el) {
              const elIndex = Array.from(this.objectsLayer.children).indexOf(el);
              const boundaryIndex = Array.from(this.objectsLayer.children).indexOf(boundaryChild);
              if (elIndex > boundaryIndex) {
                this.objectsLayer.insertBefore(el, boundaryChild);
              }
            }
          }

          const labelText = obj.text || '';
          const textEscaped = MathUtils.escapeHtml(labelText);
          const shapeD = obj.pathData || MathUtils.getShapePathD(obj.shapeType || 'diamond', obj.x, obj.y, obj.width, obj.height);
          const strokeColor = obj.stroke === 'none' ? 'none' : (obj.stroke || '#0f172a');
          const strokeWidth = obj.strokeWidth !== undefined ? obj.strokeWidth : 2;
          const dashAttr = strokeColor !== 'none' && strokeWidth > 0 ? MathUtils.getDashAttr(obj.strokeStyle, strokeWidth) : '';
          const shapeFill = this.getFillValue(obj.fill || 'none', obj.patternStyle);

          el.setAttribute('opacity', obj.opacity !== undefined ? obj.opacity : 1);
          if (obj.blendMode) {
            el.style.mixBlendMode = obj.blendMode;
          } else {
            el.style.mixBlendMode = 'normal';
          }

          const shapeInset = MathUtils.getShapeTextInset(obj.shapeType || 'rectangle', obj.x, obj.y, obj.width, obj.height);
          const textLayout = MathUtils.getFittedTextLayout(labelText, shapeInset.width, shapeInset.height, { fontSize: obj.fontSize || 18, paddingX: 0, paddingY: 0, lineHeight: 1.2 });
          const labelHtml = labelText ? `
            <foreignObject x="${shapeInset.x}" y="${shapeInset.y}" width="${Math.max(shapeInset.width, 2)}" height="${Math.max(shapeInset.height, 2)}" pointer-events="none">
              <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; font-size:${textLayout.fontSize}px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:${obj.textColor || obj.stroke || '#0f172a'}; overflow:hidden; display:flex; align-items:center; justify-content:center; text-align:center; box-sizing:border-box; line-height:1.2;">
                <span style="display:block; max-width:100%; overflow:hidden; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">${MathUtils.textLinesToHtml(textLayout.lines)}</span>
              </div>
            </foreignObject>
          ` : '';

          el.innerHTML = `
            <path d="${shapeD}" fill="${shapeFill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${dashAttr} />
            ${labelHtml}
          `;
        } else if (obj.type === 'calligraphy') {
          if (!el || el.tagName !== 'path') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }

          el.setAttribute('d', obj.pathData || '');
          el.setAttribute('fill', obj.fill || obj.stroke || '#0f172a');
          el.setAttribute('stroke', obj.stroke || '#0f172a');
          el.setAttribute('stroke-width', '2');
          el.setAttribute('stroke-linecap', 'round');
          el.setAttribute('stroke-linejoin', 'round');
          el.setAttribute('fill-rule', 'nonzero');
          el.setAttribute('opacity', obj.opacity !== undefined ? obj.opacity : 1);
          if (obj.blendMode) {
            el.style.mixBlendMode = obj.blendMode;
          } else {
            el.style.mixBlendMode = 'normal';
          }
        } else {
          // Default: Freehand Stroke Path
          if (!el || el.tagName !== 'path') {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            el.setAttribute('id', `obj-${obj.id}`);
            this.elementsMap.set(obj.id, el);
            this.objectsLayer.appendChild(el);
          }

          el.setAttribute('d', obj.pathData || '');
          el.setAttribute('stroke', obj.stroke || '#0f172a');
          el.setAttribute('stroke-width', obj.strokeWidth || 4);
          el.setAttribute('stroke-linecap', 'round');
          el.setAttribute('stroke-linejoin', 'round');
          el.setAttribute('fill', this.getFillValue(obj.fill || 'none', obj.patternStyle));
          const strokeDash = MathUtils.getDashArray(obj.strokeStyle, obj.strokeWidth || 4);
          if (strokeDash) el.setAttribute('stroke-dasharray', strokeDash);
          else el.removeAttribute('stroke-dasharray');
          el.setAttribute('opacity', obj.opacity !== undefined ? obj.opacity : 1);
          
          if (obj.blendMode) {
            el.style.mixBlendMode = obj.blendMode;
          } else {
            el.style.mixBlendMode = 'normal';
          }
        }

        if (el && (obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'sticky' || obj.type === 'text' || obj.type === 'image' || obj.type === 'shape' || obj.type === 'table' || obj.type === 'frame')) {
          if (obj.rotation) {
            const cx = (obj.x || 0) + (obj.width || 0) / 2;
            const cy = (obj.y || 0) + (obj.height || 0) / 2;
            el.setAttribute('transform', `rotate(${obj.rotation.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})`);
          } else {
            el.removeAttribute('transform');
          }
        }
        this.renderObjectLinkBadge(obj);
      }

      renderObjectLinkBadge(obj) {
        const badgeId = `obj-link-badge-${obj.id}`;
        let badgeEl = document.getElementById(badgeId);

        if (!obj.link || !obj.link.trim()) {
          if (badgeEl && badgeEl.parentNode) {
            badgeEl.parentNode.removeChild(badgeEl);
          }
          return;
        }

        const bounds = obj.bounds || MathUtils.getObjectBounds(obj);
        if (!bounds || (bounds.width <= 0 && bounds.height <= 0)) return;

        let host = '';
        try {
          const urlObj = new URL(obj.link.startsWith('http') ? obj.link : 'https://' + obj.link);
          host = urlObj.hostname.replace(/^www\./, '');
        } catch(e) {
          host = obj.link.replace(/^https?:\/\//i, '').split('/')[0];
        }
        if (host.length > 18) host = host.substring(0, 16) + '…';

        const textWidth = Math.max(host.length * 6.5 + 28, 56);
        const bx = bounds.maxX - textWidth + 8;
        const by = bounds.minY - 14;

        if (!badgeEl) {
          badgeEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          badgeEl.setAttribute('id', badgeId);
          badgeEl.setAttribute('class', 'canvas-object-link-badge');
          this.objectsLayer.appendChild(badgeEl);
        }

        badgeEl.style.cursor = 'pointer';
        badgeEl.style.pointerEvents = 'all';

        const safeLink = MathUtils.escapeHtml(obj.link);
        const safeHost = MathUtils.escapeHtml(host);

        badgeEl.innerHTML = `
          <title>Open link: ${safeLink}</title>
          <rect x="${bx}" y="${by}" width="${textWidth}" height="22" rx="11" fill="#0284c7" stroke="#ffffff" stroke-width="1.5" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));" />
          <path d="M ${bx + 8} ${by + 11} l 2 -2 a 2.5 2.5 0 0 1 3.5 3.5 l -2 2 M ${bx + 11} ${by + 14} l 2 -2 a 2.5 2.5 0 0 1 3.5 3.5 l -2 2" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <text x="${bx + 20}" y="${by + 15}" fill="#ffffff" font-size="11" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">${safeHost} ↗</text>
        `;

        ['pointerdown', 'mousedown', 'touchstart'].forEach(evtName => {
          badgeEl.addEventListener(evtName, (e) => {
            e.stopPropagation();
          });
        });

        badgeEl.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const targetUrl = obj.link.startsWith('http') ? obj.link : 'https://' + obj.link;
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        };
      }

      removeObjectElement(id) {
        const el = this.elementsMap.get(id);
        if (el) {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
          this.elementsMap.delete(id);
        }
        const badgeEl = document.getElementById(`obj-link-badge-${id}`);
        if (badgeEl && badgeEl.parentNode) {
          badgeEl.parentNode.removeChild(badgeEl);
        }
        const noteBadgeEl = document.getElementById(`obj-note-badge-${id}`);
        if (noteBadgeEl && noteBadgeEl.parentNode) {
          noteBadgeEl.parentNode.removeChild(noteBadgeEl);
        }
      }

      removeObject(id) {
        this.removeObjectElement(id);
      }

      clearObjectsLayer() {
        this.objectsLayer.innerHTML = '';
        this.elementsMap.clear();
      }

      clear() {
        this.clearObjectsLayer();
        this.clearPreview();
        if (this.selectionOverlayGroup) {
          this.selectionOverlayGroup.innerHTML = '';
        }
      }

      renderAll(objects) {
        const sorted = [...objects].sort((a, b) => {
          const zA = a.zIndex !== undefined ? a.zIndex : (a.shapeType === 'custom_fill' ? 0.5 : 1);
          const zB = b.zIndex !== undefined ? b.zIndex : (b.shapeType === 'custom_fill' ? 0.5 : 1);
          return zA - zB;
        });
        for (const obj of sorted) {
          this.renderObject(obj);
          const el = this.elementsMap.get(obj.id);
          if (el && el.parentNode === this.objectsLayer) {
            this.objectsLayer.appendChild(el);
          }
        }
      }

      updatePreviewPath(pathData, stroke, strokeWidth, opacity = 1, blendMode = 'normal', strokeStyle = 'solid', isCalligraphy = false) {
        if (!this.currentPreviewEl) {
          this.currentPreviewEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          this.previewLayer.appendChild(this.currentPreviewEl);
        }

        this.currentPreviewEl.setAttribute('d', pathData);
        if (isCalligraphy) {
          this.currentPreviewEl.setAttribute('fill', stroke);
          this.currentPreviewEl.setAttribute('stroke', stroke);
          this.currentPreviewEl.setAttribute('stroke-width', '2');
          this.currentPreviewEl.setAttribute('stroke-linecap', 'round');
          this.currentPreviewEl.setAttribute('stroke-linejoin', 'round');
          this.currentPreviewEl.setAttribute('fill-rule', 'nonzero');
          this.currentPreviewEl.removeAttribute('stroke-dasharray');
        } else {
          this.currentPreviewEl.setAttribute('stroke-linecap', 'round');
          this.currentPreviewEl.setAttribute('stroke-linejoin', 'round');
          this.currentPreviewEl.setAttribute('fill', 'none');
          this.currentPreviewEl.setAttribute('stroke', stroke);
          this.currentPreviewEl.setAttribute('stroke-width', strokeWidth);
          const previewDash = MathUtils.getDashArray(strokeStyle, strokeWidth);
          if (previewDash) this.currentPreviewEl.setAttribute('stroke-dasharray', previewDash);
          else this.currentPreviewEl.removeAttribute('stroke-dasharray');
        }
        this.currentPreviewEl.setAttribute('opacity', opacity);
        this.currentPreviewEl.style.mixBlendMode = blendMode;
      }

      updatePreviewShape(type, params) {
        this.clearPreview();
        let el;
        if (type === 'rectangle') {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          el.setAttribute('x', params.x);
          el.setAttribute('y', params.y);
          el.setAttribute('width', Math.max(params.width, 2));
          el.setAttribute('height', Math.max(params.height, 2));
          if (params.cornerRadius) {
            el.setAttribute('rx', params.cornerRadius);
          } else {
            el.removeAttribute('rx');
          }
          el.setAttribute('fill', this.getFillValue(params.fill, params.patternStyle));
          el.setAttribute('stroke', params.stroke || '#0f172a');
          el.setAttribute('stroke-width', params.strokeWidth || 2);
          const rectDash = MathUtils.getDashArray(params.strokeStyle, params.strokeWidth || 2);
          if (rectDash) el.setAttribute('stroke-dasharray', rectDash);
          el.setAttribute('opacity', params.opacity !== undefined ? params.opacity : 1);
        } else if (type === 'shape') {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          const d = MathUtils.getShapePathD(params.shapeType || 'diamond', params.x, params.y, params.width, params.height);
          const dash = MathUtils.getDashAttr(params.strokeStyle, params.strokeWidth || 2);
          const labelText = params.text || '';
          const textEscaped = MathUtils.escapeHtml(labelText);
          const fontSize = MathUtils.calculateShapeFontSize(params.text || '', Math.max(params.width - 16, 20), Math.max(params.height - 16, 20));
          const shapeFill = this.getFillValue(params.fill || 'none', params.patternStyle);
          const labelHtml = labelText ? `
            <foreignObject x="${params.x}" y="${params.y}" width="${params.width}" height="${params.height}" pointer-events="none">
              <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; padding:8px; font-size:${fontSize}px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:${params.stroke || '#0f172a'}; word-break:break-word; overflow-wrap:anywhere; overflow:hidden; display:flex; align-items:center; justify-content:center; text-align:center; box-sizing:border-box; line-height:1.2; opacity:${params.opacity !== undefined ? params.opacity : 1}">
                <span style="display:inline-block; max-width:100%; max-height:100%; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">${textEscaped}</span>
              </div>
            </foreignObject>
          ` : '';
          el.innerHTML = `
            <path d="${d}" fill="${shapeFill}" stroke="${params.stroke || '#0f172a'}" stroke-width="${params.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round" ${dash} opacity="${params.opacity !== undefined ? params.opacity : 1}" />
            ${labelHtml}
          `;
        } else if (type === 'ellipse') {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
          el.setAttribute('cx', params.x + params.width / 2);
          el.setAttribute('cy', params.y + params.height / 2);
          el.setAttribute('rx', Math.max(params.width / 2, 1));
          el.setAttribute('ry', Math.max(params.height / 2, 1));
          el.setAttribute('fill', this.getFillValue(params.fill, params.patternStyle));
          el.setAttribute('stroke', params.stroke || '#0f172a');
          el.setAttribute('stroke-width', params.strokeWidth || 2);
          const ellipseDash = MathUtils.getDashArray(params.strokeStyle, params.strokeWidth || 2);
          if (ellipseDash) el.setAttribute('stroke-dasharray', ellipseDash);
          el.setAttribute('opacity', params.opacity !== undefined ? params.opacity : 1);
        } else if (type === 'line' || type === 'arrow') {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const cx = params.cx !== undefined ? params.cx : (params.x1 + params.x2) / 2;
          const cy = params.cy !== undefined ? params.cy : (params.y1 + params.y2) / 2;
          const pathD = MathUtils.getArrowPathD(params.arrowType || 'single', params.x1, params.y1, params.x2, params.y2, cx, cy, params.elbowDir, params.elbowTracks, params.startBinding && params.startBinding.pointId, params.endBinding && params.endBinding.pointId);
          el.setAttribute('d', pathD);
          if (type === 'arrow') {
            const aType = params.arrowType || 'single';
            if (aType === 'double') {
              el.setAttribute('marker-start', 'url(#arrowhead)');
              el.setAttribute('marker-end', 'url(#arrowhead)');
            } else if (aType === 'start') {
              el.setAttribute('marker-start', 'url(#arrowhead)');
              el.removeAttribute('marker-end');
            } else if (aType === 'dot') {
              el.removeAttribute('marker-start');
              el.setAttribute('marker-end', 'url(#arrow-dot)');
            } else if (aType === 'diamond') {
              el.removeAttribute('marker-start');
              el.setAttribute('marker-end', 'url(#arrow-diamond)');
            } else if (aType === 'barbed') {
              el.removeAttribute('marker-start');
              el.setAttribute('marker-end', 'url(#arrow-barb)');
            } else {
              el.removeAttribute('marker-start');
              el.setAttribute('marker-end', 'url(#arrowhead)');
            }
          }
          el.setAttribute('fill', 'none');
          el.setAttribute('stroke', params.stroke || '#0f172a');
          el.setAttribute('stroke-width', params.strokeWidth || 2);
          const lineDash = MathUtils.getDashArray(params.strokeStyle, params.strokeWidth || 2);
          if (lineDash) el.setAttribute('stroke-dasharray', lineDash);
          el.setAttribute('opacity', params.opacity !== undefined ? params.opacity : 1);
        } else if (type === 'table') {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          const x = params.x;
          const y = params.y;
          const w = Math.max(params.width, 40);
          const h = Math.max(params.height, 30);
          const rows = Math.max(1, params.rows || 3);
          const cols = Math.max(1, params.cols || 3);
          const headerRow = params.headerRow !== false;
          const fill = params.fill || '#ffffff';
          const headerFill = params.headerFill || '#f1f5f9';
          const stroke = params.stroke || '#cbd5e1';
          const strokeWidth = params.strokeWidth || 1.5;
          const opacity = params.opacity !== undefined ? params.opacity : 0.85;
          const colW = w / cols;
          const rowH = h / rows;

          let pathD = '';
          for (let r = 1; r < rows; r++) {
            const ry = (y + r * rowH).toFixed(1);
            pathD += `M ${x.toFixed(1)} ${ry} L ${(x + w).toFixed(1)} ${ry} `;
          }
          for (let c = 1; c < cols; c++) {
            const cx = (x + c * colW).toFixed(1);
            pathD += `M ${cx} ${y.toFixed(1)} L ${cx} ${(y + h).toFixed(1)} `;
          }

          el.innerHTML = `
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" opacity="${opacity}" />
            ${headerRow ? `<path d="M ${x} ${y + 6} A 6 6 0 0 1 ${x + 6} ${y} L ${x + w - 6} ${y} A 6 6 0 0 1 ${x + w} ${y + 6} L ${x + w} ${y + rowH} L ${x} ${y + rowH} Z" fill="${headerFill}" opacity="${opacity}" />` : ''}
            <path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, strokeWidth * 0.75)}" opacity="${opacity}" pointer-events="none" />
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="${stroke}" stroke-width="${Math.max(strokeWidth, 1.5)}" opacity="${opacity}" pointer-events="none" />
          `;
        } else if (type === 'sticky') {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          el.setAttribute('x', params.x);
          el.setAttribute('y', params.y);
          el.setAttribute('width', params.width);
          el.setAttribute('height', params.height);
          el.setAttribute('rx', 10);
          el.setAttribute('fill', params.fill || '#fef08a');
          el.setAttribute('stroke', '#e2e8f0');
          el.setAttribute('stroke-width', 1);
          el.setAttribute('opacity', 0.8);
        }
        if (el) {
          this.previewLayer.appendChild(el);
          this.currentPreviewEl = el;
        }
      }

      clearPreview() {
        if (this.currentPreviewEl) {
          if (this.currentPreviewEl.parentNode) {
            this.currentPreviewEl.parentNode.removeChild(this.currentPreviewEl);
          }
          this.currentPreviewEl = null;
        }
        if (this.currentPreviewCoreEl) {
          if (this.currentPreviewCoreEl.parentNode) {
            this.currentPreviewCoreEl.parentNode.removeChild(this.currentPreviewCoreEl);
          }
          this.currentPreviewCoreEl = null;
        }
      }

      updateEraserCursor(worldPoint, radius, visible) {
        if (!visible) {
          this.eraserCursor.style.display = 'none';
          return;
        }
        this.eraserCursor.style.display = 'block';
        this.eraserCursor.setAttribute('cx', worldPoint.x);
        this.eraserCursor.setAttribute('cy', worldPoint.y);
        this.eraserCursor.setAttribute('r', radius);
      }

      /**
       * Phase 3 Selection Overlay Renderer
       */
      renderSelectionOverlay(selectedObjects, marqueeBox, currentZoom = 1.0) {
        this.selectionOverlayGroup.innerHTML = '';

        const inlineEditor = document.getElementById('inline-text-editor');
        if (inlineEditor && inlineEditor.style.display !== 'none') return;

        // 1. Render Drag Marquee if active
        if (marqueeBox) {
          const marquee = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          marquee.setAttribute('class', 'selection-marquee');
          marquee.setAttribute('x', marqueeBox.minX);
          marquee.setAttribute('y', marqueeBox.minY);
          marquee.setAttribute('width', marqueeBox.width);
          marquee.setAttribute('height', marqueeBox.height);
          this.selectionOverlayGroup.appendChild(marquee);
        }

        if (!selectedObjects || selectedObjects.length === 0) return;

        const bounds = MathUtils.getObjectsBounds(selectedObjects);
        if (!bounds) return;

        const handleSize = Math.max(6, 8 / currentZoom);
        const hasMindMapHandles = selectedObjects.length === 1 && MathUtils.isConnectableShape(selectedObjects[0]) && !selectedObjects[0].locked;
        const rotOffset = hasMindMapHandles ? Math.max(38, 48 / currentZoom) : Math.max(20, 26 / currentZoom);

        const isOnlyText = selectedObjects.length === 1 && selectedObjects[0].type === 'text';
        const isAnyLocked = selectedObjects.some(o => o.locked);
        const isOnlyLineOrArrow = selectedObjects.length === 1 &&
          (selectedObjects[0].type === 'line' || selectedObjects[0].type === 'arrow');

        // 2. Render Selection Bounding Box — skipped for a single line/arrow (bezier handles replace it)
        if (!isOnlyLineOrArrow) {
          const bbox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          if (isOnlyText) {
            bbox.setAttribute('class', 'text-selection-box');
            bbox.setAttribute('x', bounds.minX - 3);
            bbox.setAttribute('y', bounds.minY - 3);
            bbox.setAttribute('width', bounds.width + 6);
            bbox.setAttribute('height', bounds.height + 6);
            bbox.setAttribute('stroke', isAnyLocked ? '#ef4444' : '#2563eb');
            bbox.setAttribute('stroke-width', '1.5');
            bbox.setAttribute('fill', isAnyLocked ? 'rgba(239, 68, 68, 0.03)' : 'rgba(37, 99, 235, 0.02)');
            bbox.setAttribute('rx', '4');
            bbox.style.strokeDasharray = isAnyLocked ? '6 4' : 'none';
            bbox.style.pointerEvents = 'all';
            bbox.style.cursor = isAnyLocked ? 'not-allowed' : 'move';
          } else {
            bbox.setAttribute('class', 'selection-box');
            bbox.setAttribute('x', bounds.minX);
            bbox.setAttribute('y', bounds.minY);
            bbox.setAttribute('width', bounds.width);
            bbox.setAttribute('height', bounds.height);
            if (isAnyLocked) {
              bbox.setAttribute('stroke', '#ef4444');
              bbox.setAttribute('stroke-dasharray', '6 4');
              bbox.style.cursor = 'not-allowed';
            }
          }
          this.selectionOverlayGroup.appendChild(bbox);
        }

        // 3. If locked, render Lock Badge Icon and skip resize/rotate handles
        if (isAnyLocked) {
          const lockBadge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          const bSize = Math.max(22, 26 / currentZoom);
          const badgeBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          badgeBg.setAttribute('x', bounds.minX - bSize / 2);
          badgeBg.setAttribute('y', bounds.minY - bSize / 2);
          badgeBg.setAttribute('width', bSize);
          badgeBg.setAttribute('height', bSize);
          badgeBg.setAttribute('rx', 5);
          badgeBg.setAttribute('fill', '#ef4444');
          badgeBg.setAttribute('stroke', '#ffffff');
          badgeBg.setAttribute('stroke-width', 1.5);

          const iconG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          const scale = (bSize * 0.6) / 24;
          iconG.setAttribute('transform', `translate(${bounds.minX - (12 * scale)}, ${bounds.minY - (12 * scale)}) scale(${scale})`);

          const lockBody = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          lockBody.setAttribute('x', '3');
          lockBody.setAttribute('y', '11');
          lockBody.setAttribute('width', '18');
          lockBody.setAttribute('height', '11');
          lockBody.setAttribute('rx', '2');
          lockBody.setAttribute('fill', 'none');
          lockBody.setAttribute('stroke', '#ffffff');
          lockBody.setAttribute('stroke-width', '2.5');

          const lockShackle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          lockShackle.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
          lockShackle.setAttribute('fill', 'none');
          lockShackle.setAttribute('stroke', '#ffffff');
          lockShackle.setAttribute('stroke-width', '2.5');
          lockShackle.setAttribute('stroke-linecap', 'round');

          iconG.appendChild(lockBody);
          iconG.appendChild(lockShackle);

          lockBadge.appendChild(badgeBg);
          lockBadge.appendChild(iconG);
          this.selectionOverlayGroup.appendChild(lockBadge);
          return;
        }

        // 4 & 5. Resize handles + rotation — only for non-line/arrow selections
        if (!isOnlyLineOrArrow) {
          const handlePositions = [
            { name: 'nw', x: bounds.minX, y: bounds.minY },
            { name: 'n',  x: bounds.minX + bounds.width / 2, y: bounds.minY },
            { name: 'ne', x: bounds.maxX, y: bounds.minY },
            { name: 'e',  x: bounds.maxX, y: bounds.minY + bounds.height / 2 },
            { name: 'se', x: bounds.maxX, y: bounds.maxY },
            { name: 's',  x: bounds.minX + bounds.width / 2, y: bounds.maxY },
            { name: 'sw', x: bounds.minX, y: bounds.maxY },
            { name: 'w',  x: bounds.minX, y: bounds.minY + bounds.height / 2 },
          ];

          for (const h of handlePositions) {
            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            handle.setAttribute('class', `handle-rect handle-${h.name}`);
            handle.setAttribute('x', h.x - handleSize / 2);
            handle.setAttribute('y', h.y - handleSize / 2);
            handle.setAttribute('width', handleSize);
            handle.setAttribute('height', handleSize);
            handle.setAttribute('rx', 2);
            handle.setAttribute('data-handle', h.name);
            this.selectionOverlayGroup.appendChild(handle);
          }

          // 5. Rotation Handle
          const topMidX = bounds.minX + bounds.width / 2;
          const topMidY = bounds.minY;
          const rotY = topMidY - rotOffset;

          const rotLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          rotLine.setAttribute('class', 'rotation-line');
          rotLine.setAttribute('x1', topMidX);
          rotLine.setAttribute('y1', topMidY);
          rotLine.setAttribute('x2', topMidX);
          rotLine.setAttribute('y2', rotY);
          this.selectionOverlayGroup.appendChild(rotLine);

          const rotHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          rotHandle.setAttribute('class', 'rotation-handle');
          rotHandle.setAttribute('cx', topMidX);
          rotHandle.setAttribute('cy', rotY);
          rotHandle.setAttribute('r', handleSize * 0.7);
          rotHandle.setAttribute('data-handle', 'rotate');
          this.selectionOverlayGroup.appendChild(rotHandle);
        }

        // 6. Bezier endpoint + curve handles for single line/arrow
        if (isOnlyLineOrArrow) {
          const lineObj = selectedObjects[0];
          const P1 = { x: lineObj.x1, y: lineObj.y1 };
          const P2 = { x: lineObj.x2, y: lineObj.y2 };
          const PC = {
            x: lineObj.cx !== undefined ? lineObj.cx : (P1.x + P2.x) / 2,
            y: lineObj.cy !== undefined ? lineObj.cy : (P1.y + P2.y) / 2
          };
          // Calculate midpoint M directly ON the curve (at t = 0.5)
          const M = {
            x: 0.25 * P1.x + 0.5 * PC.x + 0.25 * P2.x,
            y: 0.25 * P1.y + 0.5 * PC.y + 0.25 * P2.y
          };

          // Start endpoint handle
          const hStart = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          hStart.setAttribute('class', 'bezier-endpoint-handle');
          hStart.setAttribute('cx', P1.x); hStart.setAttribute('cy', P1.y);
          hStart.setAttribute('r', Math.max(5, 7.5 / currentZoom));
          hStart.setAttribute('data-handle', 'line-start');
          hStart.setAttribute('title', 'Drag to move start point');
          this.selectionOverlayGroup.appendChild(hStart);

          // End endpoint handle
          const hEnd = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          hEnd.setAttribute('class', 'bezier-endpoint-handle');
          hEnd.setAttribute('cx', P2.x); hEnd.setAttribute('cy', P2.y);
          hEnd.setAttribute('r', Math.max(5, 7.5 / currentZoom));
          hEnd.setAttribute('data-handle', 'line-end');
          hEnd.setAttribute('title', 'Drag to move end point');
          this.selectionOverlayGroup.appendChild(hEnd);

          if (lineObj.arrowType === 'elbow') {
            // Elbow connector: one pill handle on every segment that is long enough on screen.
            // Horizontal segments drag up/down, vertical segments drag left/right.
            const drawnPts = MathUtils.getElbowDrawnPoints(lineObj);
            const logicalCount = MathUtils.getElbowPoints(lineObj).length - 1;
            const MIN_SEGMENT_SCREEN_LENGTH = 44;
            const PILL_LENGTH = 28, PILL_THICKNESS = 10;
            for (let k = 0; k < logicalCount; k++) {
              // Use the segment as DRAWN so the pill sits on the visible line
              const seg = MathUtils.getElbowHandleSegment(lineObj, k, drawnPts);
              if (!seg) continue;
              const a = seg.a, b = seg.b;
              const length = Math.hypot(b.x - a.x, b.y - a.y);
              if (length * currentZoom < MIN_SEGMENT_SCREEN_LENGTH) continue;
              const horizontal = MathUtils.isElbowSegmentHorizontal(lineObj, k);
              const w = (horizontal ? PILL_LENGTH : PILL_THICKNESS) / currentZoom;
              const h = (horizontal ? PILL_THICKNESS : PILL_LENGTH) / currentZoom;
              const pill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              pill.setAttribute('class', 'elbow-seg-handle');
              pill.setAttribute('x', (a.x + b.x) / 2 - w / 2);
              pill.setAttribute('y', (a.y + b.y) / 2 - h / 2);
              pill.setAttribute('width', w);
              pill.setAttribute('height', h);
              pill.setAttribute('rx', PILL_THICKNESS / 2 / currentZoom);
              pill.setAttribute('fill', '#0a5bd3');
              pill.setAttribute('stroke', 'none');
              pill.setAttribute('pointer-events', 'all');
              pill.style.cursor = horizontal ? 'ns-resize' : 'ew-resize';
              pill.setAttribute('data-handle', 'elbow-seg');
              pill.setAttribute('data-seg-index', k);
              pill.setAttribute('title', horizontal ? 'Drag to move up/down' : 'Drag to move left/right');
              this.selectionOverlayGroup.appendChild(pill);
            }
          } else {
            // Middle curve pivot handle positioned directly ON the line/arrow
            const hCurve = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hCurve.setAttribute('class', 'bezier-handle');
            hCurve.setAttribute('cx', M.x); hCurve.setAttribute('cy', M.y);
            hCurve.setAttribute('r', Math.max(6, 9 / currentZoom));
            hCurve.setAttribute('data-handle', 'line-curve');
            hCurve.setAttribute('title', 'Drag to curve line/arrow');
            this.selectionOverlayGroup.appendChild(hCurve);
          }
        }

        // 7. Render Connection Point Handles for connectable selected shapes
        for (const selObj of selectedObjects) {
          if (MathUtils.isConnectableShape(selObj) && !selObj.locked) {
            const connPoints = MathUtils.getObjectConnectionPoints(selObj);
            const cpRadius = Math.max(5, 7 / currentZoom);
            const cpStrokeW = 2 / currentZoom;
            for (const cp of connPoints) {
              const cpCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              cpCircle.setAttribute('class', 'connection-point-handle');
              cpCircle.setAttribute('cx', cp.x);
              cpCircle.setAttribute('cy', cp.y);
              cpCircle.setAttribute('r', cpRadius);
              cpCircle.setAttribute('fill', '#0284c7');
              cpCircle.setAttribute('stroke', '#ffffff');
              cpCircle.setAttribute('stroke-width', cpStrokeW);
              cpCircle.setAttribute('data-handle', 'connection-point');
              cpCircle.setAttribute('data-obj-id', selObj.id);
              cpCircle.setAttribute('data-point-id', cp.id);
              cpCircle.setAttribute('title', `Drag from ${cp.id} connection point`);
              cpCircle.style.cursor = 'crosshair';
              cpCircle.style.pointerEvents = 'all';
              this.selectionOverlayGroup.appendChild(cpCircle);
            }
          }
        }

        // 8. Render Floating Link Banner for objects with embedded link
        if (selectedObjects.length === 1 && selectedObjects[0].link) {
          const selObj = selectedObjects[0];
          let domain = '';
          try {
            const u = new URL(selObj.link.startsWith('http') ? selObj.link : 'https://' + selObj.link);
            domain = u.hostname.replace(/^www\./, '');
          } catch(e) {
            domain = selObj.link.substring(0, 20);
          }

          const bannerWidth = 240 / currentZoom;
          const bannerHeight = 36 / currentZoom;
          const bannerX = (bounds.minX + bounds.maxX) / 2 - bannerWidth / 2;
          const bannerY = bounds.minY - bannerHeight - (12 / currentZoom);

          const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
          fo.setAttribute('x', bannerX);
          fo.setAttribute('y', bannerY);
          fo.setAttribute('width', bannerWidth);
          fo.setAttribute('height', bannerHeight);
          fo.style.pointerEvents = 'all';

          const targetUrl = selObj.link.startsWith('http') ? selObj.link : 'https://' + selObj.link;

          fo.innerHTML = `
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; display:inline-flex; align-items:center; justify-content:space-between; gap:6px; background:#0f172a; color:#ffffff; padding:4px 10px; border-radius:20px; font-size:${11 / currentZoom}px; font-weight:600; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow:0 10px 15px -3px rgba(0,0,0,0.25); box-sizing:border-box; pointer-events:auto; user-select:none;">
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:95px; color:#38bdf8;" title="${MathUtils.escapeHtml(selObj.link)}">🔗 ${MathUtils.escapeHtml(domain)}</span>
              <div style="display:inline-flex; align-items:center; gap:4px;">
                <a id="overlay-open-link-btn" href="${MathUtils.escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; background:#0284c7; padding:2px 8px; border-radius:12px; text-decoration:none; font-size:${10 / currentZoom}px; font-weight:700; white-space:nowrap; cursor:pointer;" title="Open link in new tab">Open ↗</a>
                <button id="overlay-edit-link-btn" type="button" style="background:rgba(255,255,255,0.15); border:none; color:#ffffff; padding:2px 7px; border-radius:12px; cursor:pointer; font-size:${10 / currentZoom}px;" title="Edit Link">✎</button>
                <button id="overlay-remove-link-btn" type="button" style="background:rgba(239,68,68,0.25); border:none; color:#f87171; padding:2px 7px; border-radius:12px; cursor:pointer; font-size:${10 / currentZoom}px;" title="Remove Link">✕</button>
              </div>
            </div>
          `;

          this.selectionOverlayGroup.appendChild(fo);

          ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(evtName => {
            fo.addEventListener(evtName, (e) => {
              e.stopPropagation();
            });
          });

          const openBtn = fo.querySelector('#overlay-open-link-btn');
          if (openBtn) {
            ['pointerdown', 'mousedown', 'touchstart'].forEach(evtName => {
              openBtn.addEventListener(evtName, (e) => {
                e.stopPropagation();
              });
            });
            openBtn.addEventListener('click', (e) => {
              e.stopPropagation();
            });
          }

          const editBtn = fo.querySelector('#overlay-edit-link-btn');
          if (editBtn) {
            ['pointerdown', 'mousedown', 'touchstart'].forEach(evtName => {
              editBtn.addEventListener(evtName, (e) => {
                e.stopPropagation();
              });
            });
            editBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              const app = this.app || window.app;
              if (app && app.openEmbedLinkModal) {
                app.openEmbedLinkModal();
              }
            });
          }

          const removeBtn = fo.querySelector('#overlay-remove-link-btn');
          if (removeBtn) {
            ['pointerdown', 'mousedown', 'touchstart'].forEach(evtName => {
              removeBtn.addEventListener(evtName, (e) => {
                e.stopPropagation();
              });
            });
            removeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              const app = this.app || window.app;
              if (app && app.removeEmbedLink) {
                app.removeEmbedLink();
              }
            });
          }
        }

        // 9. Render Mind Map Quick Action Controls (when single connectable shape selected)
        if (selectedObjects.length === 1 && MathUtils.isConnectableShape(selectedObjects[0]) && !selectedObjects[0].locked) {
          const selObj = selectedObjects[0];
          const midY = (bounds.minY + bounds.maxY) / 2;
          const plusRadius = Math.max(9, 11 / currentZoom);
          const fontSz = Math.max(12, 14 / currentZoom);

          // Right Quick Add Handle
          const rPlusG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          rPlusG.setAttribute('data-handle', 'mindmap-quick-add-right');
          rPlusG.setAttribute('title', 'Add Child Node to Right (Tab)');
          rPlusG.style.cursor = 'pointer';
          rPlusG.style.pointerEvents = 'all';

          const rCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          rCircle.setAttribute('class', 'mindmap-quick-add-circle');
          rCircle.setAttribute('cx', bounds.maxX + plusRadius + (6 / currentZoom));
          rCircle.setAttribute('cy', midY);
          rCircle.setAttribute('r', plusRadius);
          rCircle.setAttribute('fill', '#2563eb');
          rCircle.setAttribute('stroke', '#ffffff');
          rCircle.setAttribute('stroke-width', 2 / currentZoom);
          rCircle.setAttribute('data-handle', 'mindmap-quick-add-right');

          const rText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          rText.setAttribute('x', bounds.maxX + plusRadius + (6 / currentZoom));
          rText.setAttribute('y', midY + (4 / currentZoom));
          rText.setAttribute('text-anchor', 'middle');
          rText.setAttribute('fill', '#ffffff');
          rText.setAttribute('font-size', fontSz);
          rText.setAttribute('font-weight', '700');
          rText.setAttribute('data-handle', 'mindmap-quick-add-right');
          rText.textContent = '+';
          rText.style.pointerEvents = 'none';

          rPlusG.appendChild(rCircle);
          rPlusG.appendChild(rText);
          this.selectionOverlayGroup.appendChild(rPlusG);

          // Left Quick Add Handle
          const lPlusG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          lPlusG.setAttribute('data-handle', 'mindmap-quick-add-left');
          lPlusG.setAttribute('title', 'Add Child Node to Left');
          lPlusG.style.cursor = 'pointer';
          lPlusG.style.pointerEvents = 'all';

          const lCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          lCircle.setAttribute('class', 'mindmap-quick-add-circle');
          lCircle.setAttribute('cx', bounds.minX - plusRadius - (6 / currentZoom));
          lCircle.setAttribute('cy', midY);
          lCircle.setAttribute('r', plusRadius);
          lCircle.setAttribute('fill', '#2563eb');
          lCircle.setAttribute('stroke', '#ffffff');
          lCircle.setAttribute('stroke-width', 2 / currentZoom);
          lCircle.setAttribute('data-handle', 'mindmap-quick-add-left');

          const lText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          lText.setAttribute('x', bounds.minX - plusRadius - (6 / currentZoom));
          lText.setAttribute('y', midY + (4 / currentZoom));
          lText.setAttribute('text-anchor', 'middle');
          lText.setAttribute('fill', '#ffffff');
          lText.setAttribute('font-size', fontSz);
          lText.setAttribute('font-weight', '700');
          lText.setAttribute('data-handle', 'mindmap-quick-add-left');
          lText.textContent = '+';
          lText.style.pointerEvents = 'none';

          lPlusG.appendChild(lCircle);
          lPlusG.appendChild(lText);
          this.selectionOverlayGroup.appendChild(lPlusG);

          // Top Sibling Quick Add Handle (+ Sibling Above)
          const midX = (bounds.minX + bounds.maxX) / 2;
          const tPlusG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          tPlusG.setAttribute('data-handle', 'mindmap-quick-add-sibling-top');
          tPlusG.setAttribute('title', 'Add Sibling Node Above (Shift+Enter)');
          tPlusG.style.cursor = 'pointer';
          tPlusG.style.pointerEvents = 'all';

          const tCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          tCircle.setAttribute('class', 'mindmap-quick-add-sibling-circle');
          tCircle.setAttribute('cx', midX);
          tCircle.setAttribute('cy', bounds.minY - plusRadius - (6 / currentZoom));
          tCircle.setAttribute('r', plusRadius);
          tCircle.setAttribute('fill', '#059669');
          tCircle.setAttribute('stroke', '#ffffff');
          tCircle.setAttribute('stroke-width', 2 / currentZoom);
          tCircle.setAttribute('data-handle', 'mindmap-quick-add-sibling-top');

          const tText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          tText.setAttribute('x', midX);
          tText.setAttribute('y', bounds.minY - plusRadius - (6 / currentZoom) + (4 / currentZoom));
          tText.setAttribute('text-anchor', 'middle');
          tText.setAttribute('fill', '#ffffff');
          tText.setAttribute('font-size', fontSz);
          tText.setAttribute('font-weight', '700');
          tText.setAttribute('data-handle', 'mindmap-quick-add-sibling-top');
          tText.textContent = '+';
          tText.style.pointerEvents = 'none';

          tPlusG.appendChild(tCircle);
          tPlusG.appendChild(tText);
          this.selectionOverlayGroup.appendChild(tPlusG);

          // Bottom Sibling Quick Add Handle (+ Sibling Below)
          const bPlusG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          bPlusG.setAttribute('data-handle', 'mindmap-quick-add-sibling-bottom');
          bPlusG.setAttribute('title', 'Add Sibling Node Below (Enter)');
          bPlusG.style.cursor = 'pointer';
          bPlusG.style.pointerEvents = 'all';

          const bCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          bCircle.setAttribute('class', 'mindmap-quick-add-sibling-circle');
          bCircle.setAttribute('cx', midX);
          bCircle.setAttribute('cy', bounds.maxY + plusRadius + (6 / currentZoom));
          bCircle.setAttribute('r', plusRadius);
          bCircle.setAttribute('fill', '#059669');
          bCircle.setAttribute('stroke', '#ffffff');
          bCircle.setAttribute('stroke-width', 2 / currentZoom);
          bCircle.setAttribute('data-handle', 'mindmap-quick-add-sibling-bottom');

          const bText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          bText.setAttribute('x', midX);
          bText.setAttribute('y', bounds.maxY + plusRadius + (6 / currentZoom) + (4 / currentZoom));
          bText.setAttribute('text-anchor', 'middle');
          bText.setAttribute('fill', '#ffffff');
          bText.setAttribute('font-size', fontSz);
          bText.setAttribute('font-weight', '700');
          bText.setAttribute('data-handle', 'mindmap-quick-add-sibling-bottom');
          bText.textContent = '+';
          bText.style.pointerEvents = 'none';

          bPlusG.appendChild(bCircle);
          bPlusG.appendChild(bText);
          this.selectionOverlayGroup.appendChild(bPlusG);
        }
      }

      renderConnectorPreview(x1, y1, x2, y2, candidate, currentZoom = 1.0) {
        this.clearConnectorPreview();

        const previewG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        previewG.setAttribute('id', 'connector-preview-group');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
        path.setAttribute('d', pathD);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#0284c7');
        path.setAttribute('stroke-width', 2.5 / currentZoom);
        path.setAttribute('stroke-dasharray', `${6 / currentZoom} ${4 / currentZoom}`);
        path.setAttribute('marker-end', 'url(#arrowhead)');
        previewG.appendChild(path);

        if (candidate) {
          const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          ring.setAttribute('cx', candidate.x);
          ring.setAttribute('cy', candidate.y);
          ring.setAttribute('r', Math.max(10, 14 / currentZoom));
          ring.setAttribute('fill', 'rgba(14, 165, 233, 0.25)');
          ring.setAttribute('stroke', '#0284c7');
          ring.setAttribute('stroke-width', 2 / currentZoom);
          previewG.appendChild(ring);

          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', candidate.x);
          dot.setAttribute('cy', candidate.y);
          dot.setAttribute('r', Math.max(6, 8 / currentZoom));
          dot.setAttribute('fill', '#0284c7');
          dot.setAttribute('stroke', '#ffffff');
          dot.setAttribute('stroke-width', 2 / currentZoom);
          previewG.appendChild(dot);
        }

        this.previewLayer.appendChild(previewG);
        this.connectorPreviewEl = previewG;
      }

      clearConnectorPreview() {
        if (this.connectorPreviewEl) {
          if (this.connectorPreviewEl.parentNode) {
            this.connectorPreviewEl.parentNode.removeChild(this.connectorPreviewEl);
          }
          this.connectorPreviewEl = null;
        }
      }
    }

    /* ==========================================================================
       8. TOOL SYSTEM (SELECT, HAND, PEN, HIGHLIGHTER, ERASER)
       ========================================================================== */
    class BaseTool {
      constructor(name, app) {
        this.name = name;
        this.app = app;
      }
      activate() {}
      deactivate() {}
      pointerDown(e, pt) {
        if (e && e.button === 2) return;
      }
      pointerMove(e, pt) {}
      pointerUp(e, pt) {}
      cancel() {}
    }

    /* Phase 3 Selection & Transformation Tool */
    class SelectTool extends BaseTool {
      constructor(app) {
        super('select', app);
        this.selectedIds = new Set();
        this.actionState = null; // 'move', 'resize', 'rotate', 'marquee'
        this.activeHandle = null;
        
        this.startPt = null;
        this.initialObjectsState = [];
        this.marqueeBox = null;

        // Bounding box center & geometry references
        this.initialBounds = null;
        this.initialAngle = 0;
      }

      activate() {
        this.app.svgStage.classList.add('select-mode');
        this.updateOverlay();
      }

      deactivate() {
        this.app.svgStage.classList.remove('select-mode');
        this.clearSelection();
      }

      getSelectedObjects() {
        return Array.from(this.selectedIds).map(id => this.app.objectManager.getObject(id)).filter(Boolean);
      }

      getTopGroupId(obj) {
        if (!obj) return null;
        if (obj.groupIds && Array.isArray(obj.groupIds) && obj.groupIds.length > 0) {
          return obj.groupIds[obj.groupIds.length - 1];
        }
        return obj.groupId || null;
      }

      getGroupMemberIds(obj) {
        if (!obj) return [];
        const topGroupId = this.getTopGroupId(obj);
        if (!topGroupId) return [obj.id];

        const all = this.app.objectManager.getAllObjects();
        const members = all.filter(o => {
          const tId = this.getTopGroupId(o);
          return tId === topGroupId || (o.groupIds && Array.isArray(o.groupIds) && o.groupIds.includes(topGroupId));
        });
        return members.map(m => m.id);
      }

      setSelectedObjects(objectsOrIds) {
        this.selectedIds.clear();
        if (Array.isArray(objectsOrIds)) {
          for (const item of objectsOrIds) {
            const id = typeof item === 'string' ? item : item?.id;
            if (id) {
              const obj = this.app.objectManager.getObject(id);
              if (obj) {
                const memberIds = this.getGroupMemberIds(obj);
                for (const mId of memberIds) {
                  this.selectedIds.add(mId);
                }
              } else {
                this.selectedIds.add(id);
              }
            }
          }
        }
        this.updateOverlay();
      }

      selectObject(id, append = false) {
        if (!append) {
          this.selectedIds.clear();
        }
        if (id) {
          const obj = this.app.objectManager.getObject(id);
          if (obj) {
            const memberIds = this.getGroupMemberIds(obj);
            for (const mId of memberIds) {
              this.selectedIds.add(mId);
            }
          } else {
            this.selectedIds.add(id);
          }
        }
        this.updateOverlay();
      }

      deselectObject(id) {
        if (id) {
          const obj = this.app.objectManager.getObject(id);
          if (obj) {
            const memberIds = this.getGroupMemberIds(obj);
            for (const mId of memberIds) {
              this.selectedIds.delete(mId);
            }
          } else {
            this.selectedIds.delete(id);
          }
        }
        this.updateOverlay();
      }

      clearSelection() {
        this.selectedIds.clear();
        this.updateOverlay();
      }

      cancel() {
        this.actionState = null;
        this.activeHandle = null;
        this.marqueeBox = null;
        this.clearSelection();
      }

      selectAll() {
        const all = this.app.objectManager.getAllObjects();
        this.selectedIds = new Set(all.map(o => o.id));
        this.updateOverlay();
      }

      updateOverlay() {
        const selectedObjs = this.getSelectedObjects();
        this.app.renderer.renderSelectionOverlay(selectedObjs, this.marqueeBox, this.app.camera.zoom);
        this.app.updateSelectionUI(selectedObjs);
      }

      pointerDown(e, pt) {
        if (e && e.button === 2) {
          // Secondary button (right-click): Do not start dragging, resizing, rotating or marquee
          return;
        }

        this.startPt = { x: pt.x, y: pt.y };
        const targetEl = e.target;
        const handleType = targetEl ? targetEl.getAttribute('data-handle') : null;

        // -1. Click on Frame Header Drag Handle -> Select frame and start move
        if (handleType === 'frame-header-drag') {
          const frameId = targetEl ? targetEl.getAttribute('data-frame-id') : null;
          if (frameId) {
            const frameObj = this.app.objectManager.getObject(frameId);
            if (frameObj && !frameObj.locked) {
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                if (this.selectedIds.has(frameId)) {
                  this.deselectObject(frameId);
                } else {
                  this.selectObject(frameId, true);
                }
              } else {
                this.selectObject(frameId, false);
              }
              const currentSelected = this.getSelectedObjects();
              if (currentSelected.length > 0) {
                this.actionState = 'move';
                this.initialObjectsState = currentSelected.map(o => JSON.parse(JSON.stringify(o)));
              }
              return;
            }
          }
        }

        // 0. Click on Connection Point Handle -> Start Dragging Connector
        if (handleType === 'connection-point') {
          const objId = targetEl.getAttribute('data-obj-id');
          const pointId = targetEl.getAttribute('data-point-id');
          const srcObj = this.app.objectManager.getObject(objId);
          if (srcObj) {
            const connPt = MathUtils.getObjectConnectionPoint(srcObj, pointId);
            this.actionState = 'draw-connector';
            this.connectorStart = { objectId: srcObj.id, pointId: pointId, x: connPt.x, y: connPt.y };
            this.connectorEndCandidate = null;
            return;
          }
        }

        // 0.5. Click on Mind Map Quick Add Handles (+ right / + left / + sibling)
        if (handleType === 'mindmap-quick-add-right' || handleType === 'mindmap-quick-add-left') {
          const selected = this.getSelectedObjects();
          if (selected.length === 1 && MathUtils.isConnectableShape(selected[0])) {
            const side = (handleType === 'mindmap-quick-add-left') ? 'left' : 'right';
            this.app.addMindMapChild(selected[0].id, side);
          }
          return;
        }

        if (handleType === 'mindmap-quick-add-sibling-top') {
          const selected = this.getSelectedObjects();
          if (selected.length === 1 && MathUtils.isConnectableShape(selected[0])) {
            this.app.addMindMapSibling(selected[0].id, 'above');
          }
          return;
        }

        if (handleType === 'mindmap-quick-add-sibling-bottom' || handleType === 'mindmap-quick-add-sibling') {
          const selected = this.getSelectedObjects();
          if (selected.length === 1 && MathUtils.isConnectableShape(selected[0])) {
            this.app.addMindMapSibling(selected[0].id, 'below');
          }
          return;
        }

        const selectedObjs = this.getSelectedObjects();

        // 1. Click on Resize / Rotate / Bezier Handles
        if (handleType && selectedObjs.length > 0) {
          if (selectedObjs.some(o => o.locked)) return;
          this.initialObjectsState = selectedObjs.map(o => JSON.parse(JSON.stringify(o)));
          this.initialBounds = MathUtils.getObjectsBounds(selectedObjs);

          if (handleType === 'rotate') {
            this.actionState = 'rotate';
            const center = {
              x: this.initialBounds.minX + this.initialBounds.width / 2,
              y: this.initialBounds.minY + this.initialBounds.height / 2
            };
            this.initialAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
          } else if (handleType === 'line-start' || handleType === 'line-end' || handleType === 'line-curve' || handleType === 'elbow-seg') {
            this.actionState = handleType;
            this.activeHandle = handleType;
            if (handleType === 'elbow-seg') {
              this.elbowSegmentIndex = parseInt(targetEl.getAttribute('data-seg-index'), 10) || 0;
            }
          } else {
            this.actionState = 'resize';
            this.activeHandle = handleType;
          }
          return;
        }

        // 2. Click on existing object stroke
        const hitIds = this.app.objectManager.hitTestStroke(pt, 8 / this.app.camera.zoom);

        if (hitIds.length > 0) {
          const hitId = hitIds[hitIds.length - 1]; // Top-most hit object

          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            if (this.selectedIds.has(hitId)) {
              this.deselectObject(hitId);
            } else {
              this.selectObject(hitId, true);
            }
          } else {
            if (!this.selectedIds.has(hitId)) {
              this.selectObject(hitId, false);
            }
          }

          // Start Move Action
          const currentSelected = this.getSelectedObjects();
          if (currentSelected.length > 0 && !currentSelected.some(o => o.locked)) {
            this.actionState = 'move';
            this.initialObjectsState = currentSelected.map(o => JSON.parse(JSON.stringify(o)));
          }
          return;
        }

        // 3. Click empty space -> Start Marquee Box Selection
        if (!e.shiftKey) {
          this.clearSelection();
        }
        this.actionState = 'marquee';
        this.marqueeBox = { minX: pt.x, minY: pt.y, maxX: pt.x, maxY: pt.y, width: 0, height: 0 };
        this.updateOverlay();
      }

      pointerMove(e, pt) {
        if (!this.actionState || !this.startPt) return;

        // A. CONNECTOR DRAG ACTION
        if (this.actionState === 'draw-connector' && this.connectorStart) {
          let targetPt = { x: pt.x, y: pt.y };
          this.connectorEndCandidate = null;

          const allObjs = this.app.objectManager.getAllObjects();
          let minDist = 28 / this.app.camera.zoom;

          for (const obj of allObjs) {
            if (obj.id === this.connectorStart.objectId) continue;
            if (!MathUtils.isConnectableShape(obj)) continue;

            const points = MathUtils.getObjectConnectionPoints(obj);
            for (const cp of points) {
              const d = MathUtils.distance(pt, cp);
              if (d < minDist) {
                minDist = d;
                targetPt = { x: cp.x, y: cp.y };
                this.connectorEndCandidate = { objectId: obj.id, pointId: cp.id, x: cp.x, y: cp.y };
              }
            }
          }

          this.app.renderer.renderConnectorPreview(
            this.connectorStart.x, this.connectorStart.y,
            targetPt.x, targetPt.y,
            this.connectorEndCandidate,
            this.app.camera.zoom
          );
          return;
        }

        let dx = pt.x - this.startPt.x;
        let dy = pt.y - this.startPt.y;

        if (this.app.snapToGrid) {
          dx = Math.round(dx / 16) * 16;
          dy = Math.round(dy / 16) * 16;
        }

        // B. MOVE ACTION
        if (this.actionState === 'move') {
          for (let i = 0; i < this.initialObjectsState.length; i++) {
            const initObj = this.initialObjectsState[i];
            const liveObj = this.app.objectManager.getObject(initObj.id);
            if (!liveObj) continue;

            if (initObj.type === 'stroke' || initObj.type === 'calligraphy') {
              liveObj.points = initObj.points.map(p => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure }));
              if (initObj.type === 'calligraphy') {
                liveObj.pathData = StrokeManager.generateCalligraphyPathData(liveObj.points, liveObj.strokeWidth, liveObj.nibAngle);
              } else if (initObj.type === 'stroke') {
                // Translate the original path data instead of regenerating from points,
                // so the smooth ink path is preserved exactly as drawn.
                liveObj.pathData = MathUtils.translatePathData(initObj.pathData, dx, dy);
              }
              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            } else if (initObj.type === 'line' || initObj.type === 'arrow') {
              liveObj.x1 = initObj.x1 + dx;
              liveObj.y1 = initObj.y1 + dy;
              liveObj.x2 = initObj.x2 + dx;
              liveObj.y2 = initObj.y2 + dy;
              const initCx = initObj.cx !== undefined ? initObj.cx : (initObj.x1 + initObj.x2) / 2;
              const initCy = initObj.cy !== undefined ? initObj.cy : (initObj.y1 + initObj.y2) / 2;
              liveObj.cx = initCx + dx;
              liveObj.cy = initCy + dy;
              if (initObj.elbowTracks) liveObj.elbowTracks = MathUtils.mapElbowTracks(initObj, v => v + dx, v => v + dy);
              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            } else {
              liveObj.x = initObj.x + dx;
              liveObj.y = initObj.y + dy;
              liveObj.rotation = initObj.rotation;
              if (initObj.points && initObj.points.length > 0) {
                liveObj.points = initObj.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                const isClosed = initObj.type !== 'line' && initObj.type !== 'arrow';
                liveObj.pathData = MathUtils.rebuildPathFromPoints(liveObj.points, isClosed, !!(initObj.isSmooth ?? liveObj.isSmooth));
              } else if (initObj.pathData) {
                liveObj.pathData = MathUtils.translatePathData(initObj.pathData, dx, dy);
              }
              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            }

            this.app.renderer.renderObject(liveObj);
          }
          this.app.objectManager.updateBoundConnectors(this.app);
          this.updateOverlay();
          return;
        }

        // C. RESIZE ACTION
        if (this.actionState === 'resize' && this.initialBounds) {
          const ib = this.initialBounds;
          let newMinX = ib.minX;
          let newMinY = ib.minY;
          let newMaxX = ib.maxX;
          let newMaxY = ib.maxY;

          switch (this.activeHandle) {
            case 'se': newMaxX += dx; newMaxY += dy; break;
            case 'nw': newMinX += dx; newMinY += dy; break;
            case 'ne': newMaxX += dx; newMinY += dy; break;
            case 'sw': newMinX += dx; newMaxY += dy; break;
            case 'e':  newMaxX += dx; break;
            case 'w':  newMinX += dx; break;
            case 's':  newMaxY += dy; break;
            case 'n':  newMinY += dy; break;
          }

          const oldWidth = ib.width || 1;
          const oldHeight = ib.height || 1;
          const newWidth = Math.max(newMaxX - newMinX, 2);
          const newHeight = Math.max(newMaxY - newMinY, 2);

          const scaleX = newWidth / oldWidth;
          const scaleY = newHeight / oldHeight;

          let anchorX = ib.minX;
          let anchorY = ib.minY;
          if (this.activeHandle.includes('w')) anchorX = ib.maxX;
          if (this.activeHandle.includes('n')) anchorY = ib.maxY;

          for (let i = 0; i < this.initialObjectsState.length; i++) {
            const initObj = this.initialObjectsState[i];
            const liveObj = this.app.objectManager.getObject(initObj.id);
            if (!liveObj) continue;

            if (initObj.type === 'stroke' || initObj.type === 'calligraphy') {
              liveObj.points = initObj.points.map(p => ({
                x: anchorX + (p.x - anchorX) * scaleX,
                y: anchorY + (p.y - anchorY) * scaleY,
                pressure: p.pressure
              }));
              if (initObj.type === 'calligraphy') {
                liveObj.pathData = StrokeManager.generateCalligraphyPathData(liveObj.points, liveObj.strokeWidth, liveObj.nibAngle);
              } else if (initObj.type === 'stroke') {
                // Regenerate from scaled points to reflect the resize accurately.
                liveObj.pathData = StrokeManager.generatePathData(liveObj.points);
              }
              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            } else if (initObj.type === 'line' || initObj.type === 'arrow') {
              liveObj.x1 = anchorX + (initObj.x1 - anchorX) * scaleX;
              liveObj.y1 = anchorY + (initObj.y1 - anchorY) * scaleY;
              liveObj.x2 = anchorX + (initObj.x2 - anchorX) * scaleX;
              liveObj.y2 = anchorY + (initObj.y2 - anchorY) * scaleY;
              const initCx = initObj.cx !== undefined ? initObj.cx : (initObj.x1 + initObj.x2) / 2;
              const initCy = initObj.cy !== undefined ? initObj.cy : (initObj.y1 + initObj.y2) / 2;
              liveObj.cx = anchorX + (initCx - anchorX) * scaleX;
              liveObj.cy = anchorY + (initCy - anchorY) * scaleY;
              if (initObj.elbowTracks) {
                liveObj.elbowTracks = MathUtils.mapElbowTracks(initObj,
                  v => anchorX + (v - anchorX) * scaleX,
                  v => anchorY + (v - anchorY) * scaleY);
              }
              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            } else {
              liveObj.x = anchorX + (initObj.x - anchorX) * scaleX;
              liveObj.y = anchorY + (initObj.y - anchorY) * scaleY;
              liveObj.width = Math.max(initObj.width * scaleX, 10);
              liveObj.height = Math.max(initObj.height * scaleY, 10);
              liveObj.rotation = initObj.rotation;
              if (initObj.points && initObj.points.length > 0) {
                liveObj.points = initObj.points.map(p => ({
                  x: anchorX + (p.x - anchorX) * scaleX,
                  y: anchorY + (p.y - anchorY) * scaleY
                }));
                const isClosed = initObj.type !== 'line' && initObj.type !== 'arrow';
                liveObj.pathData = MathUtils.rebuildPathFromPoints(liveObj.points, isClosed, !!(initObj.isSmooth ?? liveObj.isSmooth));
              }
              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            }

            this.app.renderer.renderObject(liveObj);
          }
          this.app.objectManager.updateBoundConnectors(this.app);
          this.updateOverlay();
          return;
        }

        // D. ROTATE ACTION
        if (this.actionState === 'rotate' && this.initialBounds) {
          const center = {
            x: this.initialBounds.minX + this.initialBounds.width / 2,
            y: this.initialBounds.minY + this.initialBounds.height / 2
          };
          const currentAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
          let deltaAngle = currentAngle - this.initialAngle;

          if (e.shiftKey) {
            const step = (15 * Math.PI) / 180;
            deltaAngle = Math.round(deltaAngle / step) * step;
          }

          const cos = Math.cos(deltaAngle);
          const sin = Math.sin(deltaAngle);

          for (let i = 0; i < this.initialObjectsState.length; i++) {
            const initObj = this.initialObjectsState[i];
            const liveObj = this.app.objectManager.getObject(initObj.id);
            if (!liveObj) continue;

            if (initObj.type === 'stroke' || initObj.type === 'calligraphy') {
              liveObj.points = initObj.points.map(p => {
                const rx = p.x - center.x;
                const ry = p.y - center.y;
                return {
                  x: center.x + (rx * cos - ry * sin),
                  y: center.y + (rx * sin + ry * cos),
                  pressure: p.pressure
                };
              });
              if (initObj.type === 'calligraphy') {
                liveObj.pathData = StrokeManager.generateCalligraphyPathData(liveObj.points, liveObj.strokeWidth, liveObj.nibAngle);
              } else if (initObj.type === 'stroke') {
                // Regenerate from rotated points to reflect the rotation accurately.
                liveObj.pathData = StrokeManager.generatePathData(liveObj.points);
              }
              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            } else if (initObj.type === 'line' || initObj.type === 'arrow') {
              const rx1 = initObj.x1 - center.x;
              const ry1 = initObj.y1 - center.y;
              liveObj.x1 = center.x + (rx1 * cos - ry1 * sin);
              liveObj.y1 = center.y + (rx1 * sin + ry1 * cos);

              const rx2 = initObj.x2 - center.x;
              const ry2 = initObj.y2 - center.y;
              liveObj.x2 = center.x + (rx2 * cos - ry2 * sin);
              liveObj.y2 = center.y + (rx2 * sin + ry2 * cos);

              const initCx = initObj.cx !== undefined ? initObj.cx : (initObj.x1 + initObj.x2) / 2;
              const initCy = initObj.cy !== undefined ? initObj.cy : (initObj.y1 + initObj.y2) / 2;
              const rxc = initCx - center.x;
              const ryc = initCy - center.y;
              liveObj.cx = center.x + (rxc * cos - ryc * sin);
              liveObj.cy = center.y + (ryc * sin + ryc * cos);

              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            } else {
              const initCx = initObj.x + (initObj.width || 0) / 2;
              const initCy = initObj.y + (initObj.height || 0) / 2;
              const rx = initCx - center.x;
              const ry = initCy - center.y;
              const newCx = center.x + (rx * cos - ry * sin);
              const newCy = center.y + (rx * sin + ry * cos);

              liveObj.x = newCx - (initObj.width || 0) / 2;
              liveObj.y = newCy - (initObj.height || 0) / 2;
              liveObj.rotation = (initObj.rotation || 0) + (deltaAngle * 180 / Math.PI);
              if (initObj.points && initObj.points.length > 0) {
                liveObj.points = initObj.points.map(p => {
                  const rx = p.x - center.x;
                  const ry = p.y - center.y;
                  return {
                    x: center.x + (rx * cos - ry * sin),
                    y: center.y + (rx * sin + ry * cos)
                  };
                });
                const isClosed = initObj.type !== 'line' && initObj.type !== 'arrow';
                liveObj.pathData = MathUtils.rebuildPathFromPoints(liveObj.points, isClosed, !!(initObj.isSmooth ?? liveObj.isSmooth));
              }
              liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            }

            this.app.renderer.renderObject(liveObj);
          }
          this.app.objectManager.updateBoundConnectors(this.app);
          this.updateOverlay();
          return;
        }

        // E. BEZIER HANDLES ACTION (line-start, line-end, line-curve)
        if (['line-start', 'line-end', 'line-curve', 'elbow-seg'].includes(this.actionState) && this.initialObjectsState.length === 1) {
          const initObj = this.initialObjectsState[0];
          const liveObj = this.app.objectManager.getObject(initObj.id);
          if (liveObj) {
            let curX = pt.x;
            let curY = pt.y;
            if (this.app.snapToGrid) {
              curX = Math.round(curX / 16) * 16;
              curY = Math.round(curY / 16) * 16;
            }

            let endCandidate = null;
            if (['line-start', 'line-end'].includes(this.actionState)) {
              const allObjs = this.app.objectManager.getAllObjects();
              let minDist = 28 / this.app.camera.zoom;

              for (const obj of allObjs) {
                if (obj.id === liveObj.id) continue;
                if (!MathUtils.isConnectableShape(obj)) continue;

                const points = MathUtils.getObjectConnectionPoints(obj);
                for (const cp of points) {
                  const d = MathUtils.distance(pt, cp);
                  if (d < minDist) {
                    minDist = d;
                    curX = cp.x;
                    curY = cp.y;
                    endCandidate = { objectId: obj.id, pointId: cp.id, x: cp.x, y: cp.y };
                  }
                }
              }
            }

            if (this.actionState === 'elbow-seg' && liveObj.arrowType === 'elbow') {
              const route = MathUtils.dragElbowSegment(initObj, this.elbowSegmentIndex, curX, curY);
              liveObj.elbowDir = route.elbowDir;
              liveObj.elbowTracks = route.elbowTracks;
              liveObj.elbowAuto = false; // user took manual control of the route
            } else if (this.actionState === 'line-curve') {
              liveObj.cx = 2 * curX - 0.5 * (liveObj.x1 + liveObj.x2);
              liveObj.cy = 2 * curY - 0.5 * (liveObj.y1 + liveObj.y2);
            } else if (this.actionState === 'line-start') {
              const shiftX = curX - initObj.x1;
              const shiftY = curY - initObj.y1;
              liveObj.x1 = curX;
              liveObj.y1 = curY;
              const initCx = initObj.cx !== undefined ? initObj.cx : (initObj.x1 + initObj.x2) / 2;
              const initCy = initObj.cy !== undefined ? initObj.cy : (initObj.y1 + initObj.y2) / 2;
              liveObj.cx = initCx + shiftX * 0.5;
              liveObj.cy = initCy + shiftY * 0.5;
              liveObj._tempStartBinding = endCandidate ? { objectId: endCandidate.objectId, pointId: endCandidate.pointId } : null;
            } else if (this.actionState === 'line-end') {
              const shiftX = curX - initObj.x2;
              const shiftY = curY - initObj.y2;
              liveObj.x2 = curX;
              liveObj.y2 = curY;
              const initCx = initObj.cx !== undefined ? initObj.cx : (initObj.x1 + initObj.x2) / 2;
              const initCy = initObj.cy !== undefined ? initObj.cy : (initObj.y1 + initObj.y2) / 2;
              liveObj.cx = initCx + shiftX * 0.5;
              liveObj.cy = initCy + shiftY * 0.5;
              liveObj._tempEndBinding = endCandidate ? { objectId: endCandidate.objectId, pointId: endCandidate.pointId } : null;
            }

            if (liveObj.arrowType === 'elbow' && (this.actionState === 'line-start' || this.actionState === 'line-end')) {
              // Keep the rest of the route: only the segment next to the moved end is adjusted
              const which = this.actionState === 'line-start' ? 'start' : 'end';
              const tempBinding = which === 'start' ? liveObj._tempStartBinding : liveObj._tempEndBinding;
              const snapShape = tempBinding ? this.app.objectManager.getObject(tempBinding.objectId) : null;
              const side = snapShape
                ? MathUtils.getConnectionSide(snapShape, tempBinding.pointId,
                    which === 'start' ? { x: liveObj.x1, y: liveObj.y1 } : { x: liveObj.x2, y: liveObj.y2 })
                : null;
              const route = MathUtils.retargetElbowEnd(liveObj, initObj, which, side);
              if (which === 'start') liveObj._tempStartSide = side; else liveObj._tempEndSide = side;
              liveObj.elbowDir = route.elbowDir;
              liveObj.elbowTracks = route.elbowTracks;
              liveObj.elbowAuto = false; // route is now user-controlled, so it is not rebuilt on release
            }

            liveObj.bounds = MathUtils.getObjectBounds(liveObj);
            this.app.renderer.renderObject(liveObj);
            this.updateOverlay();

            if (endCandidate) {
              this.app.renderer.renderConnectorPreview(
                liveObj.x1, liveObj.y1,
                liveObj.x2, liveObj.y2,
                endCandidate,
                this.app.camera.zoom
              );
            } else {
              this.app.renderer.clearConnectorPreview();
            }
          }
          return;
        }

        // F. MARQUEE SELECTION
        if (this.actionState === 'marquee') {
          this.marqueeBox = {
            minX: Math.min(this.startPt.x, pt.x),
            minY: Math.min(this.startPt.y, pt.y),
            maxX: Math.max(this.startPt.x, pt.x),
            maxY: Math.max(this.startPt.y, pt.y),
            width: Math.abs(pt.x - this.startPt.x),
            height: Math.abs(pt.y - this.startPt.y)
          };

          const found = this.app.objectManager.findObjectsInBox(this.marqueeBox);
          if (!e.shiftKey) {
            this.selectedIds.clear();
          }
          for (const obj of found) {
            const memberIds = this.getGroupMemberIds(obj);
            for (const mId of memberIds) {
              this.selectedIds.add(mId);
            }
          }
          this.updateOverlay();
        }
      }

      pointerUp(e, pt) {
        if (!this.actionState) return;

        // Finish connector creation from connection point
        if (this.actionState === 'draw-connector') {
          this.app.renderer.clearConnectorPreview();

          if (this.connectorStart) {
            let endBinding = null;
            let endPt = { x: this.startPt.x, y: this.startPt.y };

            if (this.connectorEndCandidate) {
              endBinding = { objectId: this.connectorEndCandidate.objectId, pointId: this.connectorEndCandidate.pointId };
              endPt = { x: this.connectorEndCandidate.x, y: this.connectorEndCandidate.y };
            } else if (pt) {
              const hitIds = this.app.objectManager.hitTestStroke(pt, 12 / this.app.camera.zoom);
              if (hitIds.length > 0) {
                const hitObj = this.app.objectManager.getObject(hitIds[hitIds.length - 1]);
                if (hitObj && hitObj.id !== this.connectorStart.objectId && MathUtils.isConnectableShape(hitObj)) {
                  const points = MathUtils.getObjectConnectionPoints(hitObj);
                  let closestPt = null;
                  let minD = Infinity;
                  for (const cp of points) {
                    const d = MathUtils.distance(pt, cp);
                    if (d < minD) {
                      minD = d;
                      closestPt = cp;
                    }
                  }
                  if (closestPt) {
                    endBinding = { objectId: hitObj.id, pointId: closestPt.id };
                    endPt = { x: closestPt.x, y: closestPt.y };
                  }
                }
              }
            }

            const finalEndPt = endBinding ? endPt : { x: pt ? pt.x : this.startPt.x, y: pt ? pt.y : this.startPt.y };

            if (endBinding || MathUtils.distance(this.startPt, finalEndPt) > 10) {
              const activeArrowTool = this.app.toolManager.tools.get('arrow');
              const stroke = activeArrowTool ? activeArrowTool.stroke : '#0f172a';
              const strokeWidth = activeArrowTool ? activeArrowTool.strokeWidth : 2;
              const strokeStyle = activeArrowTool ? activeArrowTool.strokeStyle : 'solid';
              const arrowType = activeArrowTool ? activeArrowTool.arrowType : 'single';

              const newConnector = {
                id: 'connector_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                type: 'arrow',
                x1: this.connectorStart.x,
                y1: this.connectorStart.y,
                x2: finalEndPt.x,
                y2: finalEndPt.y,
                cx: (this.connectorStart.x + finalEndPt.x) / 2,
                cy: (this.connectorStart.y + finalEndPt.y) / 2,
                stroke,
                strokeWidth,
                strokeStyle,
                arrowType,
                startBinding: { objectId: this.connectorStart.objectId, pointId: this.connectorStart.pointId },
                endBinding: endBinding,
                opacity: 1,
                zIndex: this.app.objectManager.count + 1,
                createdAt: Date.now()
              };
              if (arrowType === 'elbow') MathUtils.autoRouteElbow(newConnector, this.app.objectManager);
              newConnector.bounds = MathUtils.getObjectBounds(newConnector);

              const addCmd = new AddObjectCommand(
                this.app.objectManager,
                this.app.storageManager,
                this.app.renderer,
                newConnector
              );
              this.app.historyManager.execute(addCmd);
              this.app.updateObjectCount();
              this.selectObject(newConnector.id, false);
            }
          }

          this.actionState = null;
          this.connectorStart = null;
          this.connectorEndCandidate = null;
          this.startPt = null;
          this.updateOverlay();
          return;
        }

        // Finalize line start / end bindings
        if (['line-start', 'line-end'].includes(this.actionState) && this.initialObjectsState.length === 1) {
          const liveObj = this.app.objectManager.getObject(this.initialObjectsState[0].id);
          if (liveObj) {
            if (this.actionState === 'line-start') {
              if (liveObj._tempStartBinding !== undefined) {
                if (liveObj._tempStartBinding) liveObj.startBinding = liveObj._tempStartBinding;
                else delete liveObj.startBinding;
                delete liveObj._tempStartBinding;
                delete liveObj._tempStartSide;
              }
            } else if (this.actionState === 'line-end') {
              if (liveObj._tempEndBinding !== undefined) {
                if (liveObj._tempEndBinding) liveObj.endBinding = liveObj._tempEndBinding;
                else delete liveObj.endBinding;
                delete liveObj._tempEndBinding;
                delete liveObj._tempEndSide;
              }
            }
            this.app.objectManager.updateBoundConnectors(this.app);
          }
        }

        this.app.renderer.clearConnectorPreview();

        // Record Undo/Redo command for move, resize, rotate, and Bezier editing
        if (['move', 'resize', 'rotate', 'line-start', 'line-end', 'line-curve', 'elbow-seg'].includes(this.actionState)) {
          const currentSelected = this.getSelectedObjects();
          if (currentSelected.length > 0 && this.initialObjectsState.length > 0) {
            const cmd = new TransformObjectsCommand(
              this.app.objectManager,
              this.app.storageManager,
              this.app.renderer,
              this.initialObjectsState,
              currentSelected.map(o => JSON.parse(JSON.stringify(o)))
            );
            this.app.historyManager.execute(cmd);
          }
        }

        this.actionState = null;
        this.activeHandle = null;
        this.startPt = null;
        this.initialObjectsState = [];
        this.initialBounds = null;
        this.marqueeBox = null;
        this.updateOverlay();
      }

      cancel() {
        if (this.initialObjectsState.length > 0) {
          for (const initObj of this.initialObjectsState) {
            this.app.objectManager.addObject(initObj);
            this.app.renderer.renderObject(initObj);
          }
        }
        this.actionState = null;
        this.activeHandle = null;
        this.startPt = null;
        this.initialObjectsState = [];
        this.marqueeBox = null;
        this.updateOverlay();
      }

      deleteSelection() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;

        const selIds = new Set(selected.map(o => o.id));
        const allObjects = this.app.objectManager.getAllObjects();
        const connectedConnectors = allObjects.filter(o => {
          if (selIds.has(o.id)) return false;
          if (o.type === 'line' || o.type === 'arrow') {
            const hasStart = o.startBinding && selIds.has(o.startBinding.objectId);
            const hasEnd = o.endBinding && selIds.has(o.endBinding.objectId);
            return hasStart || hasEnd;
          }
          return false;
        });

        const toDelete = [...selected, ...connectedConnectors];

        const cmd = new DeleteObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          toDelete
        );
        this.app.historyManager.execute(cmd);
        this.clearSelection();
        this.app.updateObjectCount();
        this.app.showToast(`Deleted ${selected.length} object${selected.length > 1 ? 's' : ''}`);
      }

      groupSelection() {
        const selected = this.getSelectedObjects();
        if (selected.length < 2) {
          this.app.showToast('Select 2 or more objects to group');
          return;
        }

        const newGroupId = 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));

        for (const obj of selected) {
          if (!obj.groupIds || !Array.isArray(obj.groupIds)) {
            obj.groupIds = obj.groupId ? [obj.groupId] : [];
          }
          obj.groupIds.push(newGroupId);
          obj.groupId = newGroupId;
        }

        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));

        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.updateOverlay();
        this.app.updateSelectionUI(selected);
        this.app.showToast(`Grouped ${selected.length} objects`);
      }

      ungroupSelection() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;

        const topGroupIds = new Set();
        for (const o of selected) {
          const tId = this.getTopGroupId(o);
          if (tId) topGroupIds.add(tId);
        }

        if (topGroupIds.size === 0) {
          this.app.showToast('No groups selected');
          return;
        }

        const allObjs = this.app.objectManager.getAllObjects();
        const targetObjs = allObjs.filter(o => {
          const tId = this.getTopGroupId(o);
          return tId && topGroupIds.has(tId);
        });

        const oldState = targetObjs.map(o => JSON.parse(JSON.stringify(o)));

        for (const obj of targetObjs) {
          if (!obj.groupIds || !Array.isArray(obj.groupIds)) {
            obj.groupIds = obj.groupId ? [obj.groupId] : [];
          }
          if (obj.groupIds.length > 0) {
            obj.groupIds.pop();
          }
          obj.groupId = obj.groupIds.length > 0 ? obj.groupIds[obj.groupIds.length - 1] : null;
        }

        const newState = targetObjs.map(o => JSON.parse(JSON.stringify(o)));

        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.updateOverlay();
        this.app.updateSelectionUI(selected);
        this.app.showToast('Ungrouped selection');
      }

      duplicateSelection() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;

        const duplicates = [];
        const offset = 16;
        const groupMap = new Map();

        for (const orig of selected) {
          const dupObj = JSON.parse(JSON.stringify(orig));
          dupObj.id = (orig.type || 'obj') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          dupObj.createdAt = Date.now();

          // Remap group IDs so duplicated groups form independent new groups
          if (dupObj.groupIds && Array.isArray(dupObj.groupIds) && dupObj.groupIds.length > 0) {
            dupObj.groupIds = dupObj.groupIds.map(gId => {
              if (!groupMap.has(gId)) {
                groupMap.set(gId, 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
              }
              return groupMap.get(gId);
            });
            dupObj.groupId = dupObj.groupIds[dupObj.groupIds.length - 1];
          } else if (dupObj.groupId) {
            if (!groupMap.has(dupObj.groupId)) {
              groupMap.set(dupObj.groupId, 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
            }
            dupObj.groupId = groupMap.get(dupObj.groupId);
            dupObj.groupIds = [dupObj.groupId];
          }

          if (orig.type === 'stroke' || orig.type === 'calligraphy') {
            dupObj.points = orig.points.map(p => ({ x: p.x + offset, y: p.y + offset, pressure: p.pressure }));
            if (orig.type === 'calligraphy') {
              dupObj.pathData = StrokeManager.generateCalligraphyPathData(dupObj.points, dupObj.strokeWidth, dupObj.nibAngle);
            } else if (orig.type === 'stroke') {
              dupObj.pathData = StrokeManager.generatePathData(dupObj.points);

              dupObj.pathData = MathUtils.rebuildPathFromPoints(dupObj.points, false, !!orig.isSmooth);
            }
            dupObj.bounds = MathUtils.getBounds(dupObj.points);
          } else if (orig.type === 'line' || orig.type === 'arrow') {
            dupObj.x1 += offset;
            dupObj.y1 += offset;
            dupObj.x2 += offset;
            dupObj.y2 += offset;
            const origCx = orig.cx !== undefined ? orig.cx : (orig.x1 + orig.x2) / 2;
            const origCy = orig.cy !== undefined ? orig.cy : (orig.y1 + orig.y2) / 2;
            dupObj.cx = origCx + offset;
            dupObj.cy = origCy + offset;
            if (orig.elbowTracks) dupObj.elbowTracks = MathUtils.mapElbowTracks(orig, v => v + offset, v => v + offset);
            dupObj.bounds = MathUtils.getObjectBounds(dupObj);
          } else {
            dupObj.x += offset;
            dupObj.y += offset;
            if (orig.points && orig.points.length > 0) {
              dupObj.points = orig.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
              const isClosed = orig.type !== 'line' && orig.type !== 'arrow';
              dupObj.pathData = MathUtils.rebuildPathFromPoints(dupObj.points, isClosed, !!orig.isSmooth);
            } else if (orig.pathData) {
              dupObj.pathData = MathUtils.translatePathData(orig.pathData, offset, offset);
            }
            dupObj.bounds = MathUtils.getObjectBounds(dupObj);
          }

          duplicates.push(dupObj);
        }

        for (const dup of duplicates) {
          const cmd = new AddObjectCommand(
            this.app.objectManager,
            this.app.storageManager,
            this.app.renderer,
            dup
          );
          this.app.historyManager.execute(cmd);
        }

        this.selectedIds = new Set(duplicates.map(d => d.id));
        this.updateOverlay();
        this.app.updateObjectCount();
        this.app.showToast(`Duplicated ${selected.length} object${selected.length > 1 ? 's' : ''}`);
      }

      toggleLockSelection() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;
        const anyUnlocked = selected.some(o => !o.locked);
        const newLockState = anyUnlocked;

        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));
        for (const obj of selected) {
          obj.locked = newLockState;
        }
        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));

        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.updateOverlay();
        this.app.updateSelectionUI(selected);
        this.app.showToast(newLockState ? 'Locked selection' : 'Unlocked selection');
      }

      bringToFront() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;
        const all = this.app.objectManager.getAllObjects();
        let maxZ = Math.max(...all.map(o => o.zIndex || 0), 0);
        
        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));
        for (const obj of selected) {
          maxZ += 1;
          obj.zIndex = maxZ;
        }
        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));

        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.app.renderer.renderAll(this.app.objectManager.getAllObjects());
        this.app.showToast('Brought to front');
      }

      sendToBack() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;
        const all = this.app.objectManager.getAllObjects();
        let minZ = Math.min(...all.map(o => o.zIndex || 0), 0);

        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));
        for (const obj of selected) {
          minZ -= 1;
          obj.zIndex = minZ;
        }
        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));

        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.app.renderer.renderAll(this.app.objectManager.getAllObjects());
        this.app.showToast('Sent to back');
      }

      bringForward() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;
        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));

        for (const obj of selected) {
          obj.zIndex = (obj.zIndex || 0) + 1;
        }

        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));
        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.app.renderer.renderAll(this.app.objectManager.getAllObjects());
        this.app.showToast('Moved forward');
      }

      sendBackward() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;
        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));

        for (const obj of selected) {
          obj.zIndex = (obj.zIndex || 0) - 1;
        }

        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));
        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.app.renderer.renderAll(this.app.objectManager.getAllObjects());
        this.app.showToast('Moved backward');
      }

      alignSelection(alignType) {
        const selected = this.getSelectedObjects();
        if (selected.length < 2) return;

        const bounds = MathUtils.getObjectsBounds(selected);
        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));

        for (const obj of selected) {
          let dx = 0;
          let dy = 0;
          const objB = obj.bounds;

          if (alignType === 'left') {
            dx = bounds.minX - objB.minX;
          } else if (alignType === 'center') {
            const groupCenterX = bounds.minX + bounds.width / 2;
            const objCenterX = objB.minX + objB.width / 2;
            dx = groupCenterX - objCenterX;
          } else if (alignType === 'right') {
            dx = bounds.maxX - objB.maxX;
          } else if (alignType === 'top') {
            dy = bounds.minY - objB.minY;
          } else if (alignType === 'middle') {
            const groupCenterY = bounds.minY + bounds.height / 2;
            const objCenterY = objB.minY + objB.height / 2;
            dy = groupCenterY - objCenterY;
          } else if (alignType === 'bottom') {
            dy = bounds.maxY - objB.maxY;
          }

          if (dx !== 0 || dy !== 0) {
            if (obj.type === 'stroke' || obj.type === 'calligraphy') {
              obj.points = obj.points.map(p => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure }));
              if (obj.type === 'calligraphy') {
                obj.pathData = StrokeManager.generateCalligraphyPathData(obj.points, obj.strokeWidth, obj.nibAngle);
              } else if (obj.type === 'stroke') {
                // Translate the existing path data to preserve the original smooth ink path.
                obj.pathData = MathUtils.translatePathData(obj.pathData, dx, dy);
              }
              obj.bounds = MathUtils.getBounds(obj.points);
            } else if (obj.type === 'line' || obj.type === 'arrow') {
              obj.x1 += dx; obj.y1 += dy;
              obj.x2 += dx; obj.y2 += dy;
              const minX = Math.min(obj.x1, obj.x2);
              const minY = Math.min(obj.y1, obj.y2);
              const maxX = Math.max(obj.x1, obj.x2);
              const maxY = Math.max(obj.y1, obj.y2);
              obj.bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
            } else {
              obj.x += dx; obj.y += dy;
              if (obj.points && obj.points.length > 0) {
                obj.points = obj.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                const isClosed = obj.type !== 'line' && obj.type !== 'arrow';
                obj.pathData = MathUtils.rebuildPathFromPoints(obj.points, isClosed, !!obj.isSmooth);
              } else if (obj.pathData) {
                obj.pathData = MathUtils.translatePathData(obj.pathData, dx, dy);
              }
              obj.bounds = MathUtils.getObjectBounds(obj);
            }
            this.app.renderer.renderObject(obj);
          }
        }

        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));
        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.updateOverlay();
        this.app.showToast(`Aligned ${alignType}`);
      }

      rotateSelection(degrees) {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;
        if (selected.some(o => o.locked)) {
          this.app.showToast('Locked items cannot be rotated');
          return;
        }

        const bounds = MathUtils.getObjectsBounds(selected);
        const center = {
          x: bounds.minX + bounds.width / 2,
          y: bounds.minY + bounds.height / 2
        };
        const rad = (degrees * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));

        for (const obj of selected) {
          if (obj.type === 'stroke' || obj.type === 'calligraphy') {
            obj.points = obj.points.map(p => {
              const dx = p.x - center.x;
              const dy = p.y - center.y;
              return {
                x: center.x + (dx * cos - dy * sin),
                y: center.y + (dx * sin + dy * cos),
                pressure: p.pressure
              };
            });
            if (obj.type === 'calligraphy') {
              obj.pathData = StrokeManager.generateCalligraphyPathData(obj.points, obj.strokeWidth, obj.nibAngle);
            } else if (obj.type === 'stroke') {
              obj.pathData = StrokeManager.generatePathData(obj.points);
            }
            obj.bounds = MathUtils.getBounds(obj.points);
          } else if (obj.type === 'line' || obj.type === 'arrow') {
            const dx1 = obj.x1 - center.x, dy1 = obj.y1 - center.y;
            const dx2 = obj.x2 - center.x, dy2 = obj.y2 - center.y;
            obj.x1 = center.x + (dx1 * cos - dy1 * sin);
            obj.y1 = center.y + (dx1 * sin + dy1 * cos);
            obj.x2 = center.x + (dx2 * cos - dy2 * sin);
            obj.y2 = center.y + (dx2 * sin + dy2 * cos);
            if (obj.cx !== undefined && obj.cy !== undefined) {
              const dxc = obj.cx - center.x, dyc = obj.cy - center.y;
              obj.cx = center.x + (dxc * cos - dyc * sin);
              obj.cy = center.y + (dxc * sin + dyc * cos);
            }
            const minX = Math.min(obj.x1, obj.x2);
            const minY = Math.min(obj.y1, obj.y2);
            const maxX = Math.max(obj.x1, obj.x2);
            const maxY = Math.max(obj.y1, obj.y2);
            obj.bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
          } else {
            const objCx = (obj.x || 0) + (obj.width || 0) / 2;
            const objCy = (obj.y || 0) + (obj.height || 0) / 2;
            const dx = objCx - center.x;
            const dy = objCy - center.y;
            const newCx = center.x + (dx * cos - dy * sin);
            const newCy = center.y + (dx * sin + dy * cos);

            obj.x = newCx - (obj.width || 0) / 2;
            obj.y = newCy - (obj.height || 0) / 2;
            obj.rotation = ((obj.rotation || 0) + degrees + 360) % 360;
            if (obj.points && obj.points.length > 0) {
              obj.points = obj.points.map(p => {
                const pdx = p.x - center.x;
                const pdy = p.y - center.y;
                return {
                  x: center.x + (pdx * cos - pdy * sin),
                  y: center.y + (pdx * sin + pdy * cos)
                };
              });
              const isClosed = obj.type !== 'line' && obj.type !== 'arrow';
              obj.pathData = MathUtils.rebuildPathFromPoints(obj.points, isClosed, !!obj.isSmooth);
            }
            obj.bounds = MathUtils.getRotatedBounds(obj);
          }
          this.app.renderer.renderObject(obj);
        }

        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));
        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.updateOverlay();
        const angleLabel = degrees > 0 ? `+${degrees}°` : `${degrees}°`;
        this.app.showToast(`Rotated ${angleLabel}`);
      }

      resetSelectionRotation() {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;
        if (selected.some(o => o.locked)) {
          this.app.showToast('Locked items cannot be rotated');
          return;
        }

        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));
        let rotatedAny = false;

        for (const obj of selected) {
          if (obj.rotation) {
            obj.rotation = 0;
            obj.bounds = MathUtils.getRotatedBounds(obj);
            rotatedAny = true;
          }
          this.app.renderer.renderObject(obj);
        }

        if (!rotatedAny) {
          this.app.showToast('Rotation is already 0°');
          return;
        }

        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));
        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.updateOverlay();
        this.app.showToast('Reset rotation to 0°');
      }

      flipSelection(axis) {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;
        if (selected.some(o => o.locked)) {
          this.app.showToast('Locked items cannot be flipped');
          return;
        }

        const bounds = MathUtils.getObjectsBounds(selected);
        const center = {
          x: bounds.minX + bounds.width / 2,
          y: bounds.minY + bounds.height / 2
        };

        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));

        for (const obj of selected) {
          if (obj.type === 'stroke' || obj.type === 'calligraphy') {
            obj.points = obj.points.map(p => ({
              x: axis === 'h' ? (2 * center.x - p.x) : p.x,
              y: axis === 'v' ? (2 * center.y - p.y) : p.y,
              pressure: p.pressure
            }));
            if (obj.type === 'calligraphy') {
              obj.pathData = StrokeManager.generateCalligraphyPathData(obj.points, obj.strokeWidth, obj.nibAngle);
            } else if (obj.type === 'stroke') {
              obj.pathData = StrokeManager.generatePathData(obj.points);
            }
            obj.bounds = MathUtils.getBounds(obj.points);
          } else if (obj.type === 'line' || obj.type === 'arrow') {
            if (axis === 'h') {
              obj.x1 = 2 * center.x - obj.x1;
              obj.x2 = 2 * center.x - obj.x2;
              if (obj.cx !== undefined) obj.cx = 2 * center.x - obj.cx;
              if (obj.elbowTracks) obj.elbowTracks = MathUtils.mapElbowTracks(obj, v => 2 * center.x - v, v => v);
            } else {
              obj.y1 = 2 * center.y - obj.y1;
              obj.y2 = 2 * center.y - obj.y2;
              if (obj.cy !== undefined) obj.cy = 2 * center.y - obj.cy;
              if (obj.elbowTracks) obj.elbowTracks = MathUtils.mapElbowTracks(obj, v => v, v => 2 * center.y - v);
            }
            const minX = Math.min(obj.x1, obj.x2);
            const minY = Math.min(obj.y1, obj.y2);
            const maxX = Math.max(obj.x1, obj.x2);
            const maxY = Math.max(obj.y1, obj.y2);
            obj.bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
          } else {
            if (axis === 'h') {
              const right = (obj.x || 0) + (obj.width || 0);
              obj.x = 2 * center.x - right;
            } else {
              const bottom = (obj.y || 0) + (obj.height || 0);
              obj.y = 2 * center.y - bottom;
            }
            if (obj.points && obj.points.length > 0) {
              obj.points = obj.points.map(p => ({
                x: axis === 'h' ? (2 * center.x - p.x) : p.x,
                y: axis === 'v' ? (2 * center.y - p.y) : p.y
              }));
              const isClosed = obj.type !== 'line' && obj.type !== 'arrow';
              obj.pathData = MathUtils.rebuildPathFromPoints(obj.points, isClosed, !!obj.isSmooth);
            }
            obj.bounds = MathUtils.getRotatedBounds(obj);
          }
          this.app.renderer.renderObject(obj);
        }

        const newState = selected.map(o => JSON.parse(JSON.stringify(o)));
        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.updateOverlay();
        this.app.showToast(`Flipped ${axis === 'h' ? 'horizontally' : 'vertically'}`);
      }

      updateSelectedProperties(props) {
        const selected = this.getSelectedObjects();
        if (selected.length === 0) return;

        const oldState = selected.map(o => JSON.parse(JSON.stringify(o)));
        const newState = [];

        for (const obj of selected) {
          if (props.stroke !== undefined) {
            obj.stroke = props.stroke;
            if (obj.type === 'calligraphy') obj.fill = props.stroke;
          }
          if (props.fill !== undefined) obj.fill = props.fill;
          if (props.patternStyle !== undefined) obj.patternStyle = props.patternStyle;
          if (props.strokeWidth !== undefined) {
            obj.strokeWidth = props.strokeWidth;
            if (obj.type === 'calligraphy' && obj.points) {
              obj.pathData = StrokeManager.generateCalligraphyPathData(obj.points, obj.strokeWidth, obj.nibAngle);
            }
          }
          if (props.strokeStyle !== undefined) obj.strokeStyle = props.strokeStyle;
          if (props.arrowType !== undefined) {
            if (obj.type === 'arrow') {
              const switchedToElbow = props.arrowType === 'elbow' && obj.arrowType !== 'elbow';
              obj.arrowType = props.arrowType;
              if (switchedToElbow) {
                // Fresh route for the new type (drop any stale one) so the drawn line and its
                // drag handles are computed from the same data
                delete obj.elbowTracks;
                delete obj.elbowDir;
                delete obj.elbowAuto;
                MathUtils.autoRouteElbow(obj, this.app.objectManager);
                obj.bounds = MathUtils.getObjectBounds(obj);
              }
            }
          }
          if (props.cornerRadius !== undefined) {
            if (obj.type === 'image' || obj.type === 'rectangle') {
              obj.cornerRadius = props.cornerRadius;
            }
          }
          if (props.opacity !== undefined) obj.opacity = props.opacity;

          if (obj.type === 'text') {
            if (props.fontSize !== undefined) {
              obj.fontSize = props.fontSize;
            } else if (props.strokeWidth !== undefined) {
              obj.fontSize = MathUtils.textFontSizeFromSize(props.strokeWidth);
            }
            if (props.bold !== undefined) obj.bold = props.bold;
            if (props.italic !== undefined) obj.italic = props.italic;
            if (props.underline !== undefined) obj.underline = props.underline;
            if (props.strike !== undefined) obj.strike = props.strike;
            if (props.fontFamily !== undefined) obj.fontFamily = props.fontFamily;
            if (props.textAlign !== undefined) obj.textAlign = props.textAlign;
            // Re-render the object so the renderer updates bounds via getBBox,
            // then read the freshly-set obj.bounds. Fall back to estimation only
            // if rendering hasn't populated bounds yet.
            this.app.renderer.renderObject(obj);
            if (!obj.bounds) {
              const lines = (obj.text || '').split('\n');
              const maxLineLen = Math.max(...lines.map(l => l.length), 1);
              const fs = obj.fontSize || 24;
              const bgVal = (obj.fill && obj.fill !== 'none' && obj.fill !== 'transparent') ? obj.fill : 'transparent';
              const hasBg = bgVal !== 'transparent';
              const padW = hasBg ? 12 : 8;
              const padH = hasBg ? 6 : 4;
              const charRatio = obj.bold ? 0.64 : 0.58;
              obj.width = Math.max(Math.ceil(maxLineLen * (fs * charRatio)) + padW, 24);
              obj.height = Math.max(Math.ceil(lines.length * (fs * 1.2)) + padH, Math.ceil(fs * 1.2));
              obj.bounds = { minX: obj.x, minY: obj.y, maxX: obj.x + obj.width, maxY: obj.y + obj.height, width: obj.width, height: obj.height };
            }
          }

          this.app.renderer.renderObject(obj);
          newState.push(JSON.parse(JSON.stringify(obj)));
        }

        const cmd = new TransformObjectsCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          oldState,
          newState
        );
        this.app.historyManager.execute(cmd);
        this.updateOverlay();
      }
    }

    /* Hand / Pan Navigation Tool (Phase 2) */
    class HandTool extends BaseTool {
      constructor(app) {
        super('hand', app);
        this.isPanning = false;
        this.lastX = 0;
        this.lastY = 0;
      }

      activate() {
        this.app.svgStage.classList.add('hand-mode');
      }

      deactivate() {
        this.app.svgStage.classList.remove('hand-mode', 'panning');
      }

      pointerDown(e) {
        this.isPanning = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.app.svgStage.classList.add('panning');
      }

      pointerMove(e) {
        if (!this.isPanning) return;
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;

        this.app.camera.panBy(dx, dy);
      }

      pointerUp() {
        if (!this.isPanning) return;
        this.isPanning = false;
        this.app.svgStage.classList.remove('panning');
      }

      cancel() {
        this.isPanning = false;
        this.app.svgStage.classList.remove('panning');
      }
    }

    class PenTool extends BaseTool {
      constructor(app) {
        super('pen', app);
        this.isDrawing = false;
        this.points = [];
        this.stroke = '#0f172a';
        this.strokeWidth = 4;
        this.strokeStyle = 'solid';
        this.opacity = 1;
      }

      get color() { return this.stroke; }
      set color(c) { this.stroke = c; }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.points = [{ x: pt.x, y: pt.y, pressure: e.pressure || 0.5 }];
        const pathData = StrokeManager.generatePathData(this.points);
        this.app.renderer.updatePreviewPath(pathData, this.stroke, this.strokeWidth, this.opacity, 'normal', this.strokeStyle);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing) return;
        const last = this.points[this.points.length - 1];
        if (!last || MathUtils.distance(last, pt) >= 1.5) {
          this.points.push({ x: pt.x, y: pt.y, pressure: e.pressure || 0.5 });
          const pathData = StrokeManager.generatePathData(this.points);
          this.app.renderer.updatePreviewPath(pathData, this.stroke, this.strokeWidth, this.opacity, 'normal', this.strokeStyle);
        }
      }

      pointerUp(e, pt) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.points.length > 0) {
          const pathData = StrokeManager.generatePathData(this.points);
          const bounds = MathUtils.getBounds(this.points);

          const newObj = {
            id: 'stroke_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            type: 'stroke',
            tool: 'pen',
            points: this.points,
            pathData: pathData,
            bounds: bounds,
            stroke: this.stroke,
            strokeWidth: this.strokeWidth,
            strokeStyle: this.strokeStyle || 'solid',
            opacity: this.opacity,
            blendMode: 'normal',
            zIndex: this.app.objectManager.count + 1,
            createdAt: Date.now()
          };
          const cmd = new AddObjectCommand(
            this.app.objectManager,
            this.app.storageManager,
            this.app.renderer,
            newObj
          );
          this.app.historyManager.execute(cmd);
          this.app.updateObjectCount();

        }

        this.app.renderer.clearPreview();
        this.points = [];
      }

      cancel() {
        this.isDrawing = false;
        this.points = [];
        this.app.renderer.clearPreview();
      }
    }

    class CalligraphyTool extends BaseTool {
      constructor(app) {
        super('calligraphy', app);
        this.isDrawing = false;
        this.points = [];
        this.stroke = '#0f172a';
        this.strokeWidth = 12;
        this.nibAngle = Math.PI / 4;
        this.opacity = 1;
      }

      get color() { return this.stroke; }
      set color(c) { this.stroke = c; }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.points = [{ x: pt.x, y: pt.y, pressure: e.pressure !== undefined ? e.pressure : 0.5 }];
        const pathData = StrokeManager.generateCalligraphyPathData(this.points, this.strokeWidth, this.nibAngle);
        this.app.renderer.updatePreviewPath(pathData, this.stroke, this.strokeWidth, this.opacity, 'normal', 'solid', true);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing) return;
        const last = this.points[this.points.length - 1];
        if (!last || MathUtils.distance(last, pt) >= 1.5) {
          this.points.push({ x: pt.x, y: pt.y, pressure: e.pressure !== undefined ? e.pressure : 0.5 });
          const pathData = StrokeManager.generateCalligraphyPathData(this.points, this.strokeWidth, this.nibAngle);
          this.app.renderer.updatePreviewPath(pathData, this.stroke, this.strokeWidth, this.opacity, 'normal', 'solid', true);
        }
      }

      pointerUp(e, pt) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.points.length > 0) {
          const pathData = StrokeManager.generateCalligraphyPathData(this.points, this.strokeWidth, this.nibAngle);
          const bounds = MathUtils.getBounds(this.points);

          const halfNib = this.strokeWidth / 2;
          bounds.minX -= halfNib;
          bounds.minY -= halfNib;
          bounds.maxX += halfNib;
          bounds.maxY += halfNib;
          bounds.width = bounds.maxX - bounds.minX;
          bounds.height = bounds.maxY - bounds.minY;

          const newObj = {
            id: 'cal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            type: 'calligraphy',
            tool: 'calligraphy',
            points: this.points,
            pathData: pathData,
            bounds: bounds,
            stroke: this.stroke,
            fill: this.stroke,
            strokeWidth: this.strokeWidth,
            nibAngle: this.nibAngle,
            opacity: this.opacity,
            blendMode: 'normal',
            zIndex: this.app.objectManager.count + 1,
            createdAt: Date.now()
          };

          const cmd = new AddObjectCommand(
            this.app.objectManager,
            this.app.storageManager,
            this.app.renderer,
            newObj
          );
          this.app.historyManager.execute(cmd);
          this.app.updateObjectCount();
        }

        this.app.renderer.clearPreview();
        this.points = [];
      }

      cancel() {
        this.isDrawing = false;
        this.points = [];
        this.app.renderer.clearPreview();
      }
    }

    class HighlighterTool extends BaseTool {
      constructor(app) {
        super('highlighter', app);
        this.isDrawing = false;
        this.points = [];
        this.stroke = '#facc15';
        this.strokeWidth = 24;
        this.opacity = 0.45;
      }

      get color() { return this.stroke; }
      set color(c) { this.stroke = c; }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.points = [{ x: pt.x, y: pt.y }];
        const pathData = StrokeManager.generatePathData(this.points);
        this.app.renderer.updatePreviewPath(pathData, this.stroke, this.strokeWidth, this.opacity, 'multiply');
      }

      pointerMove(e, pt) {
        if (!this.isDrawing) return;
        const last = this.points[this.points.length - 1];
        if (!last || MathUtils.distance(last, pt) >= 1.5) {
          this.points.push({ x: pt.x, y: pt.y });
          const pathData = StrokeManager.generatePathData(this.points);
          this.app.renderer.updatePreviewPath(pathData, this.stroke, this.strokeWidth, this.opacity, 'multiply');
        }
      }

      pointerUp(e, pt) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.points.length > 0) {
          const pathData = StrokeManager.generatePathData(this.points);
          const bounds = MathUtils.getBounds(this.points);

          const newObj = {
            id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            type: 'stroke',
            tool: 'highlighter',
            points: this.points,
            pathData: pathData,
            bounds: bounds,
            stroke: this.stroke,
            strokeWidth: this.strokeWidth,
            opacity: this.opacity,
            blendMode: 'multiply',
            zIndex: this.app.objectManager.count + 1,
            createdAt: Date.now()
          };

          const cmd = new AddObjectCommand(
            this.app.objectManager,
            this.app.storageManager,
            this.app.renderer,
            newObj
          );
          this.app.historyManager.execute(cmd);
          this.app.updateObjectCount();
        }

        this.app.renderer.clearPreview();
        this.points = [];
      }

      cancel() {
        this.isDrawing = false;
        this.points = [];
        this.app.renderer.clearPreview();
      }
    }

    class EraserTool extends BaseTool {
      constructor(app) {
        super('eraser', app);
        this.mode = 'object';
        this.isErasing = false;
        this.radius = 12; // Default 12px radius
        this.lastPoint = null;

        // Object Eraser mode tracking
        this.erasedInCurrentStroke = new Set();
      }

      activate() {
        this.app.renderer.updateEraserCursor({ x: -100, y: -100 }, this.radius, true);
      }

      deactivate() {
        this.app.renderer.updateEraserCursor({ x: -100, y: -100 }, this.radius, false);
      }

      pointerDown(e, pt) {
        this.isErasing = true;
        this.lastPoint = { x: pt.x, y: pt.y };

        this.erasedInCurrentStroke.clear();
        this.eraseAtPoint(pt);
      }

      pointerMove(e, pt) {
        this.app.renderer.updateEraserCursor(pt, this.radius, true);
        if (this.isErasing) {
          this.eraseAtPoint(pt);
        }
      }

      pointerUp() {
        if (!this.isErasing) return;
        this.isErasing = false;
        this.lastPoint = null;

        if (this.erasedInCurrentStroke.size > 0) {
          const erasedObjects = Array.from(this.erasedInCurrentStroke).map(id =>
            this.app.objectManager.getObject(id)
          ).filter(Boolean);

          if (erasedObjects.length > 0) {
            const cmd = new DeleteObjectsCommand(
              this.app.objectManager,
              this.app.storageManager,
              this.app.renderer,
              erasedObjects
            );
            this.app.historyManager.execute(cmd);
            this.app.updateObjectCount();
          }
          this.erasedInCurrentStroke.clear();
        }
      }

      eraseAtPoint(pt) {
        const hitIds = this.app.objectManager.hitTestStroke(pt, this.radius);
        for (const id of hitIds) {
          if (!this.erasedInCurrentStroke.has(id)) {
            this.erasedInCurrentStroke.add(id);
            this.app.renderer.removeObjectElement(id);
          }
        }
      }

      cancel() {
        this.isErasing = false;
        this.lastPoint = null;
        for (const id of this.erasedInCurrentStroke) {
          const obj = this.app.objectManager.getObject(id);
          if (obj) this.app.renderer.renderObject(obj);
        }
        this.erasedInCurrentStroke.clear();
      }
    }

    /* Rectangle Tool */
    class RectangleTool extends BaseTool {
      constructor(app) {
        super('rectangle', app);
        this.isDrawing = false;
        this.startPt = null;
        this.stroke = '#0f172a';
        this.fill = 'none';
        this.patternStyle = 'solid';
        this.strokeWidth = 2;
        this.strokeStyle = 'solid';
        this.opacity = 1;
      }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.startPt = pt;
        this.updatePreview(pt, e.shiftKey);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.updatePreview(pt, e.shiftKey);
      }

      updatePreview(pt, isShift) {
        let width = pt.x - this.startPt.x;
        let height = pt.y - this.startPt.y;
        if (isShift) {
          const side = Math.max(Math.abs(width), Math.abs(height));
          width = width < 0 ? -side : side;
          height = height < 0 ? -side : side;
        }
        const x = width < 0 ? this.startPt.x + width : this.startPt.x;
        const y = height < 0 ? this.startPt.y + height : this.startPt.y;
        const w = Math.abs(width);
        const h = Math.abs(height);

        this.app.renderer.updatePreviewShape('rectangle', {
          x, y, width: w, height: h,
          fill: this.fill, patternStyle: this.patternStyle || 'solid', stroke: this.stroke,
          strokeWidth: this.strokeWidth, strokeStyle: this.strokeStyle,
          opacity: this.opacity
        });
      }

      pointerUp(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.isDrawing = false;

        let width = pt.x - this.startPt.x;
        let height = pt.y - this.startPt.y;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(width), Math.abs(height));
          width = width < 0 ? -side : side;
          height = height < 0 ? -side : side;
        }
        const x = width < 0 ? this.startPt.x + width : this.startPt.x;
        const y = height < 0 ? this.startPt.y + height : this.startPt.y;
        const w = Math.max(Math.abs(width), 5);
        const h = Math.max(Math.abs(height), 5);

        const newObj = {
          id: 'rect_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'rectangle',
          x, y, width: w, height: h,
          bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
          fill: this.fill,
          patternStyle: this.patternStyle || 'solid',
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          strokeStyle: this.strokeStyle,
          opacity: this.opacity,
          zIndex: this.app.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          newObj
        );
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();
        this.app.renderer.clearPreview();
        this.startPt = null;

        // Auto select created rectangle if not tool locked
        if (!this.app.isToolLocked) {
          this.app.selectTool('select');
          const selectTool = this.app.toolManager.tools.get('select');
          if (selectTool) selectTool.selectObject(newObj.id, false);
        }
      }

      cancel() {
        this.isDrawing = false;
        this.startPt = null;
        this.app.renderer.clearPreview();
      }
    }

    /* Frame / Presentation Slide Tool */
    class FrameTool extends BaseTool {
      constructor(app) {
        super('frame', app);
        this.isDrawing = false;
        this.startPt = null;
        this.stroke = '#3b82f6';
        this.fill = 'rgba(59, 130, 246, 0.03)';
        this.strokeWidth = 2;
        this.opacity = 1;
      }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.startPt = pt;
        this.updatePreview(pt, e.shiftKey);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.updatePreview(pt, e.shiftKey);
      }

      updatePreview(pt, isShift) {
        let width = pt.x - this.startPt.x;
        let height = pt.y - this.startPt.y;
        if (isShift) {
          const side = Math.max(Math.abs(width), Math.abs(height));
          width = width < 0 ? -side : side;
          height = height < 0 ? -side : side;
        }
        const x = width < 0 ? this.startPt.x + width : this.startPt.x;
        const y = height < 0 ? this.startPt.y + height : this.startPt.y;
        const w = Math.abs(width);
        const h = Math.abs(height);

        this.app.renderer.updatePreviewShape('rectangle', {
          x, y, width: w, height: h,
          fill: this.fill, stroke: this.stroke,
          strokeWidth: this.strokeWidth, strokeStyle: 'dashed',
          opacity: this.opacity
        });
      }

      pointerUp(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.isDrawing = false;

        let width = pt.x - this.startPt.x;
        let height = pt.y - this.startPt.y;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(width), Math.abs(height));
          width = width < 0 ? -side : side;
          height = height < 0 ? -side : side;
        }
        const x = width < 0 ? this.startPt.x + width : this.startPt.x;
        const y = height < 0 ? this.startPt.y + height : this.startPt.y;
        const w = Math.max(Math.abs(width), 120);
        const h = Math.max(Math.abs(height), 80);

        const existingFrames = this.app.objectManager.getAllObjects().filter(o => o.type === 'frame');
        const frameNum = existingFrames.length + 1;
        const autoTitle = `Frame ${frameNum}`;

        const newObj = {
          id: 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'frame',
          title: autoTitle,
          x, y, width: w, height: h,
          bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
          fill: this.fill,
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          strokeStyle: 'dashed',
          opacity: this.opacity,
          zIndex: this.app.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          newObj
        );
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();
        this.app.renderer.clearPreview();
        this.startPt = null;

        if (!this.app.frameOrder) this.app.frameOrder = [];
        if (!this.app.frameOrder.includes(newObj.id)) {
          this.app.frameOrder.push(newObj.id);
        }

        if (this.app.isFramesPanelOpen && this.app.isFramesPanelOpen()) {
          this.app.renderFramesPanel();
        }

        if (!this.app.isToolLocked) {
          this.app.selectTool('select');
          const selectTool = this.app.toolManager.tools.get('select');
          if (selectTool) selectTool.selectObject(newObj.id, false);
        }
      }

      cancel() {
        this.isDrawing = false;
        this.startPt = null;
        this.app.renderer.clearPreview();
      }
    }

    class TableTool extends BaseTool {
      constructor(app) {
        super('table', app);
        this.isDrawing = false;
        this.startPt = null;
        this.rows = 3;
        this.cols = 3;
        this.headerRow = true;
        this.stroke = '#cbd5e1';
        this.fill = '#ffffff';
        this.headerFill = '#f1f5f9';
        this.strokeWidth = 1.5;
        this.opacity = 1;
      }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.startPt = pt;
        this.updatePreview(pt, e.shiftKey);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.updatePreview(pt, e.shiftKey);
      }

      updatePreview(pt, lockAspectRatio = false) {
        let width = pt.x - this.startPt.x;
        let height = pt.y - this.startPt.y;

        if (lockAspectRatio) {
          const side = Math.max(Math.abs(width), Math.abs(height));
          width = width < 0 ? -side : side;
          height = height < 0 ? -side : side;
        }

        const x = width < 0 ? this.startPt.x + width : this.startPt.x;
        const y = height < 0 ? this.startPt.y + height : this.startPt.y;
        const w = Math.max(Math.abs(width), 20);
        const h = Math.max(Math.abs(height), 20);

        this.app.renderer.updatePreviewShape('table', {
          x, y,
          width: w,
          height: h,
          rows: this.rows,
          cols: this.cols,
          headerRow: this.headerRow,
          fill: this.fill,
          headerFill: this.headerFill,
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          opacity: this.opacity
        });
      }

      pointerUp(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.isDrawing = false;

        let width = pt.x - this.startPt.x;
        let height = pt.y - this.startPt.y;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(width), Math.abs(height));
          width = width < 0 ? -side : side;
          height = height < 0 ? -side : side;
        }

        let x = width < 0 ? this.startPt.x + width : this.startPt.x;
        let y = height < 0 ? this.startPt.y + height : this.startPt.y;
        let w = Math.abs(width);
        let h = Math.abs(height);

        // Click-to-create default table if drag was minimal (< 10px)
        if (w < 10 && h < 10) {
          w = 320;
          h = 140;
          x = this.startPt.x - w / 2;
          y = this.startPt.y - h / 2;
        } else {
          w = Math.max(w, 100);
          h = Math.max(h, 60);
        }

        // Initialize cells array
        const cells = [];
        for (let r = 0; r < this.rows; r++) {
          const row = [];
          for (let c = 0; c < this.cols; c++) {
            if (this.headerRow && r === 0) {
              row.push(`Header ${c + 1}`);
            } else {
              row.push('');
            }
          }
          cells.push(row);
        }

        const newObj = {
          id: 'table_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'table',
          x, y, width: w, height: h,
          rows: this.rows,
          cols: this.cols,
          headerRow: this.headerRow,
          cells,
          bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
          fill: this.fill,
          headerFill: this.headerFill,
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          opacity: this.opacity,
          zIndex: this.app.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          newObj
        );
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();
        this.app.renderer.clearPreview();
        this.startPt = null;

        if (!this.app.isToolLocked) {
          this.app.selectTool('select');
          const selectTool = this.app.toolManager.tools.get('select');
          if (selectTool) selectTool.selectObject(newObj.id, false);
        }
      }

      cancel() {
        this.isDrawing = false;
        this.startPt = null;
        this.app.renderer.clearPreview();
      }
    }

    /* Text Tool */
    class TextTool extends BaseTool {
      constructor(app) {
        super('text', app);
        this.fontSize = 24;
        this.stroke = '#0f172a';
        this.fill = 'none';
        this.bold = false;
        this.italic = false;
        this.underline = false;
        this.strike = false;
        this.opacity = 1;
        this.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        this.textAlign = 'left';
      }

      pointerDown(e, pt) {
        // Gemini-style: open embedded SVG foreignObject textarea at click point
        this.app.openGeminiTextEditor(pt.x, pt.y, null, this);
      }

      cancel() {}
    }

    /* Ellipse Tool */
    class EllipseTool extends BaseTool {
      constructor(app) {
        super('ellipse', app);
        this.isDrawing = false;
        this.startPt = null;
        this.stroke = '#0f172a';
        this.fill = 'none';
        this.patternStyle = 'solid';
        this.strokeWidth = 2;
        this.strokeStyle = 'solid';
        this.opacity = 1;
      }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.startPt = pt;
        this.updatePreview(pt, e.shiftKey);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.updatePreview(pt, e.shiftKey);
      }

      updatePreview(pt, isShift) {
        let width = pt.x - this.startPt.x;
        let height = pt.y - this.startPt.y;
        if (isShift) {
          const side = Math.max(Math.abs(width), Math.abs(height));
          width = width < 0 ? -side : side;
          height = height < 0 ? -side : side;
        }
        const x = width < 0 ? this.startPt.x + width : this.startPt.x;
        const y = height < 0 ? this.startPt.y + height : this.startPt.y;
        const w = Math.abs(width);
        const h = Math.abs(height);

        this.app.renderer.updatePreviewShape('ellipse', {
          x, y, width: w, height: h,
          fill: this.fill, patternStyle: this.patternStyle || 'solid', stroke: this.stroke,
          strokeWidth: this.strokeWidth, strokeStyle: this.strokeStyle, opacity: this.opacity
        });
      }

      pointerUp(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.isDrawing = false;

        let width = pt.x - this.startPt.x;
        let height = pt.y - this.startPt.y;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(width), Math.abs(height));
          width = width < 0 ? -side : side;
          height = height < 0 ? -side : side;
        }
        const x = width < 0 ? this.startPt.x + width : this.startPt.x;
        const y = height < 0 ? this.startPt.y + height : this.startPt.y;
        const w = Math.max(Math.abs(width), 5);
        const h = Math.max(Math.abs(height), 5);

        const newObj = {
          id: 'ellipse_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'ellipse',
          x, y, width: w, height: h,
          bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
          fill: this.fill,
          patternStyle: this.patternStyle || 'solid',
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          strokeStyle: this.strokeStyle,
          opacity: this.opacity,
          zIndex: this.app.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          newObj
        );
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();
        this.app.renderer.clearPreview();
        this.startPt = null;

        // Auto select created circle/ellipse if not tool locked
        if (!this.app.isToolLocked) {
          this.app.selectTool('select');
          const selectTool = this.app.toolManager.tools.get('select');
          if (selectTool) selectTool.selectObject(newObj.id, false);
        }
      }

      cancel() {
        this.isDrawing = false;
        this.startPt = null;
        this.app.renderer.clearPreview();
      }
    }

    /* Line Tool */
    class LineTool extends BaseTool {
      constructor(app) {
        super('line', app);
        this.isDrawing = false;
        this.startPt = null;
        this.stroke = '#0f172a';
        this.strokeWidth = 2;
        this.strokeStyle = 'solid';
        this.opacity = 1;
      }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.startPt = pt;
        this.updatePreview(pt, e.shiftKey);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.updatePreview(pt, e.shiftKey);
      }

      updatePreview(pt, isShift) {
        let x2 = pt.x;
        let y2 = pt.y;
        if (isShift) {
          const dx = x2 - this.startPt.x;
          const dy = y2 - this.startPt.y;
          const angle = Math.atan2(dy, dx);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          x2 = this.startPt.x + Math.cos(snappedAngle) * dist;
          y2 = this.startPt.y + Math.sin(snappedAngle) * dist;
        }

        const cx = (this.startPt.x + x2) / 2;
        const cy = (this.startPt.y + y2) / 2;

        this.app.renderer.updatePreviewShape('line', {
          x1: this.startPt.x, y1: this.startPt.y,
          x2, y2, cx, cy,
          stroke: this.stroke, strokeWidth: this.strokeWidth, strokeStyle: this.strokeStyle, opacity: this.opacity
        });
      }

      pointerUp(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.isDrawing = false;

        let x2 = pt.x;
        let y2 = pt.y;
        if (e.shiftKey) {
          const dx = x2 - this.startPt.x;
          const dy = y2 - this.startPt.y;
          const angle = Math.atan2(dy, dx);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          x2 = this.startPt.x + Math.cos(snappedAngle) * dist;
          y2 = this.startPt.y + Math.sin(snappedAngle) * dist;
        }

        // Check for shape connection bindings
        let startBinding = null;
        let endBinding = null;
        const allObjs = this.app.objectManager.getAllObjects();
        const snapDist = 28 / this.app.camera.zoom;

        for (const obj of allObjs) {
          if (!MathUtils.isConnectableShape(obj)) continue;
          const points = MathUtils.getObjectConnectionPoints(obj);
          for (const cp of points) {
            if (!startBinding && MathUtils.distance(this.startPt, cp) < snapDist) {
              startBinding = { objectId: obj.id, pointId: cp.id };
              this.startPt.x = cp.x;
              this.startPt.y = cp.y;
            }
            if (!endBinding && MathUtils.distance({ x: x2, y: y2 }, cp) < snapDist) {
              endBinding = { objectId: obj.id, pointId: cp.id };
              x2 = cp.x;
              y2 = cp.y;
            }
          }
        }

        const cx = (this.startPt.x + x2) / 2;
        const cy = (this.startPt.y + y2) / 2;

        const newObj = {
          id: 'line_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'line',
          x1: this.startPt.x, y1: this.startPt.y,
          x2, y2,
          cx, cy,
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          strokeStyle: this.strokeStyle,
          opacity: this.opacity,
          zIndex: this.app.objectManager.count + 1,
          createdAt: Date.now()
        };
        if (startBinding) newObj.startBinding = startBinding;
        if (endBinding) newObj.endBinding = endBinding;

        newObj.bounds = MathUtils.getObjectBounds(newObj);

        const cmd = new AddObjectCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          newObj
        );
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();
        this.app.renderer.clearPreview();
        this.startPt = null;

        // Auto select created line to show Bezier points immediately if not tool locked
        if (!this.app.isToolLocked) {
          this.app.selectTool('select');
          const selectTool = this.app.toolManager.tools.get('select');
          if (selectTool) selectTool.selectObject(newObj.id, false);
        }
      }

      cancel() {
        this.isDrawing = false;
        this.startPt = null;
        this.app.renderer.clearPreview();
      }
    }

    /* Arrow Tool */
    class ArrowTool extends BaseTool {
      constructor(app) {
        super('arrow', app);
        this.isDrawing = false;
        this.startPt = null;
        this.stroke = '#0f172a';
        this.strokeWidth = 2;
        this.strokeStyle = 'solid';
        this.arrowType = 'single';
        this.opacity = 1;
      }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.startPt = pt;
        this.updatePreview(pt, e.shiftKey);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.updatePreview(pt, e.shiftKey);
      }

      updatePreview(pt, isShift) {
        let x2 = pt.x;
        let y2 = pt.y;
        if (isShift) {
          const dx = x2 - this.startPt.x;
          const dy = y2 - this.startPt.y;
          const angle = Math.atan2(dy, dx);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          x2 = this.startPt.x + Math.cos(snappedAngle) * dist;
          y2 = this.startPt.y + Math.sin(snappedAngle) * dist;
        }

        const cx = (this.startPt.x + x2) / 2;
        const cy = (this.startPt.y + y2) / 2;

        this.app.renderer.updatePreviewShape('arrow', {
          x1: this.startPt.x, y1: this.startPt.y,
          x2, y2, cx, cy,
          stroke: this.stroke, strokeWidth: this.strokeWidth, strokeStyle: this.strokeStyle, arrowType: this.arrowType || 'single', opacity: this.opacity
        });
      }

      pointerUp(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.isDrawing = false;

        let x2 = pt.x;
        let y2 = pt.y;
        if (e.shiftKey) {
          const dx = x2 - this.startPt.x;
          const dy = y2 - this.startPt.y;
          const angle = Math.atan2(dy, dx);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          x2 = this.startPt.x + Math.cos(snappedAngle) * dist;
          y2 = this.startPt.y + Math.sin(snappedAngle) * dist;
        }

        // Check for shape connection bindings
        let startBinding = null;
        let endBinding = null;
        const allObjs = this.app.objectManager.getAllObjects();
        const snapDist = 28 / this.app.camera.zoom;

        for (const obj of allObjs) {
          if (!MathUtils.isConnectableShape(obj)) continue;
          const points = MathUtils.getObjectConnectionPoints(obj);
          for (const cp of points) {
            if (!startBinding && MathUtils.distance(this.startPt, cp) < snapDist) {
              startBinding = { objectId: obj.id, pointId: cp.id };
              this.startPt.x = cp.x;
              this.startPt.y = cp.y;
            }
            if (!endBinding && MathUtils.distance({ x: x2, y: y2 }, cp) < snapDist) {
              endBinding = { objectId: obj.id, pointId: cp.id };
              x2 = cp.x;
              y2 = cp.y;
            }
          }
        }

        const cx = (this.startPt.x + x2) / 2;
        const cy = (this.startPt.y + y2) / 2;

        const newObj = {
          id: 'arrow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'arrow',
          x1: this.startPt.x, y1: this.startPt.y,
          x2, y2,
          cx, cy,
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          strokeStyle: this.strokeStyle,
          arrowType: this.arrowType || 'single',
          opacity: this.opacity,
          zIndex: this.app.objectManager.count + 1,
          createdAt: Date.now()
        };
        if (startBinding) newObj.startBinding = startBinding;
        if (endBinding) newObj.endBinding = endBinding;
        if (newObj.arrowType === 'elbow') MathUtils.autoRouteElbow(newObj, this.app.objectManager);

        newObj.bounds = MathUtils.getObjectBounds(newObj);

        const cmd = new AddObjectCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          newObj
        );
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();
        this.app.renderer.clearPreview();
        this.startPt = null;

        // Auto select created arrow to show Bezier points immediately if not tool locked
        if (!this.app.isToolLocked) {
          this.app.selectTool('select');
          const selectTool = this.app.toolManager.tools.get('select');
          if (selectTool) selectTool.selectObject(newObj.id, false);
        }
      }

      cancel() {
        this.isDrawing = false;
        this.startPt = null;
        this.app.renderer.clearPreview();
      }
    }

    /* Shapes Library Tool */
    class ShapeTool extends BaseTool {
      constructor(app) {
        super('shape', app);
        this.isDrawing = false;
        this.startPt = null;
        this.shapeType = 'diamond';
        this.fill = '#e2e8f0';
        this.patternStyle = 'solid';
        this.stroke = '#0f172a';
        this.strokeWidth = 2;
        this.strokeStyle = 'solid';
        this.opacity = 1;
      }

      setShapeType(shapeType) {
        this.shapeType = shapeType;
      }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.startPt = pt;
        this.updatePreview(pt, e.shiftKey);
      }

      pointerMove(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.updatePreview(pt, e.shiftKey);
      }

      updatePreview(currPt, isShiftPressed = false) {
        let x = Math.min(this.startPt.x, currPt.x);
        let y = Math.min(this.startPt.y, currPt.y);
        let w = Math.abs(currPt.x - this.startPt.x);
        let h = Math.abs(currPt.y - this.startPt.y);

        if (isShiftPressed) {
          const side = Math.max(w, h);
          w = side;
          h = side;
          if (currPt.x < this.startPt.x) x = this.startPt.x - side;
          if (currPt.y < this.startPt.y) y = this.startPt.y - side;
        }

        this.app.renderer.updatePreviewShape('shape', {
          shapeType: this.shapeType,
          x, y,
          width: Math.max(w, 2),
          height: Math.max(h, 2),
          fill: this.fill,
          patternStyle: this.patternStyle || 'solid',
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          strokeStyle: this.strokeStyle,
          opacity: this.opacity
        });
      }

      pointerUp(e, pt) {
        if (!this.isDrawing || !this.startPt) return;
        this.isDrawing = false;

        let x = Math.min(this.startPt.x, pt.x);
        let y = Math.min(this.startPt.y, pt.y);
        let w = Math.abs(pt.x - this.startPt.x);
        let h = Math.abs(pt.y - this.startPt.y);

        if (e.shiftKey) {
          const side = Math.max(w, h);
          w = side;
          h = side;
          if (pt.x < this.startPt.x) x = this.startPt.x - side;
          if (pt.y < this.startPt.y) y = this.startPt.y - side;
        }

        if (w < 5 || h < 5) {
          w = 100;
          h = 100;
          x = this.startPt.x - 50;
          y = this.startPt.y - 50;
        }

        const newObj = {
          id: 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'shape',
          shapeType: this.shapeType,
          text: '',
          x, y,
          width: w,
          height: h,
          fill: this.fill,
          patternStyle: this.patternStyle || 'solid',
          stroke: this.stroke,
          strokeWidth: this.strokeWidth,
          strokeStyle: this.strokeStyle,
          opacity: this.opacity,
          zIndex: this.app.objectManager.count + 1,
          createdAt: Date.now()
        };
        newObj.bounds = MathUtils.getObjectBounds(newObj);

        const cmd = new AddObjectCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          newObj
        );
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();
        this.app.renderer.clearPreview();
        this.startPt = null;

        if (!this.app.isToolLocked) {
          this.app.selectTool('select');
          const selectTool = this.app.toolManager.tools.get('select');
          if (selectTool) selectTool.selectObject(newObj.id, false);
        }
      }

      cancel() {
        this.isDrawing = false;
        this.startPt = null;
        this.app.renderer.clearPreview();
      }
    }

    /* Sticky Note Tool */
    class StickyNoteTool extends BaseTool {
      constructor(app) {
        super('sticky', app);
        this.fill = '#fef08a';
        this.patternStyle = 'solid';
        this.opacity = 1;
      }

      pointerDown(e, pt) {
        const w = 180;
        const h = 180;
        const screenPt = this.app.camera.svgToScreen(pt.x, pt.y);

        // Create the sticky note immediately
        const newObj = {
          id: 'sticky_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'sticky',
          x: pt.x,
          y: pt.y,
          width: w,
          height: h,
          bounds: { minX: pt.x, minY: pt.y, maxX: pt.x + w, maxY: pt.y + h, width: w, height: h },
          text: '',
          fill: this.fill,
          patternStyle: this.patternStyle || 'solid',
          opacity: this.opacity,
          zIndex: this.app.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(
          this.app.objectManager,
          this.app.storageManager,
          this.app.renderer,
          newObj
        );
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();

        // Switch to select tool and select the note
        this.app.selectTool('select');
        const selectTool = this.app.toolManager.tools.get('select');
        if (selectTool) selectTool.selectObject(newObj.id, false);

        // Immediately enter edit mode
        this.app.openInlineEditor(screenPt, '', { width: w, height: h, fontSize: 16, color: '#0f172a', background: this.fill, isMultiline: true, editingObjId: newObj.id }, (textVal) => {
          if (textVal !== undefined && textVal !== newObj.text) {
            const oldObj = JSON.parse(JSON.stringify(newObj));
            newObj.text = textVal || 'Sticky Note';
            newObj.fontSize = MathUtils.getStickyTextLayout(newObj.text, newObj.width, newObj.height).fontSize;
            this.app.renderer.renderObject(newObj);
            const updatedObj = JSON.parse(JSON.stringify(newObj));
            const updateCmd = new TransformObjectsCommand(
              this.app.objectManager,
              this.app.storageManager,
              this.app.renderer,
              [oldObj],
              [updatedObj]
            );
            this.app.historyManager.execute(updateCmd);
          }
        });
      }
    }

    /* Laser Pointer Tool */
    class LaserTool extends BaseTool {
      constructor(app) {
        super('laser', app);
        this.points = [];
        this.isDrawing = false;
        this.animFrame = null;
      }

      pointerDown(e, pt) {
        this.isDrawing = true;
        this.points = [{ x: pt.x, y: pt.y, time: Date.now() }];
        this.startLoop();
      }

      pointerMove(e, pt) {
        if (!this.isDrawing) return;
        this.points.push({ x: pt.x, y: pt.y, time: Date.now() });
      }

      pointerUp() {
        this.isDrawing = false;
      }

      startLoop() {
        if (this.animFrame) return;
        const tick = () => {
          const now = Date.now();
          const maxAge = 1200;
          this.points = this.points.filter(p => now - p.time < maxAge);

          if (this.points.length > 1) {
            const pathData = StrokeManager.generatePathData(this.points);
            this.app.renderer.updatePreviewPath(pathData, '#ff003f', 6, 1);
          } else if (this.points.length === 1) {
            const p = this.points[0];
            const circlePath = `M ${p.x - 4} ${p.y} A 4 4 0 1 0 ${p.x + 4} ${p.y} A 4 4 0 1 0 ${p.x - 4} ${p.y}`;
            this.app.renderer.updatePreviewPath(circlePath, '#ff003f', 6, 1);
          } else {
            this.app.renderer.clearPreview();
          }

          if (this.points.length > 0 || this.isDrawing) {
            this.animFrame = requestAnimationFrame(tick);
          } else {
            this.animFrame = null;
            this.app.renderer.clearPreview();
          }
        };
        this.animFrame = requestAnimationFrame(tick);
      }

      cancel() {
        this.isDrawing = false;
        this.points = [];
        if (this.animFrame) {
          cancelAnimationFrame(this.animFrame);
          this.animFrame = null;
        }
        this.app.renderer.clearPreview();
      }
    }

    /* Spotlight Focus Tool */

    class MindMapTool extends BaseTool {
      constructor(app) {
        super('mindmap', app);
        this.fill = '#eff6ff';
        this.stroke = '#2563eb';
        this.color = '#2563eb';
        this.strokeWidth = 2;
      }

      activate() {
        this.app.svgStage.style.cursor = 'crosshair';
        this.app.showToast('Mind Map Tool: Click empty canvas to create root node, or click any shape to branch');
      }

      deactivate() {
        this.app.svgStage.style.cursor = '';
      }

      pointerDown(e, pt) {
        // 1. Check if user clicked an existing connectable node
        const hitIds = this.app.objectManager.hitTestStroke(pt, 8 / this.app.camera.zoom);
        const connectableHit = hitIds.map(id => this.app.objectManager.getObject(id)).find(o => o && MathUtils.isConnectableShape(o));

        if (connectableHit) {
          // Add a child to this clicked node!
          this.app.addMindMapChild(connectableHit.id);
          this.app.selectTool('select');
          return;
        }

        // 2. Otherwise, check if canvas has no objects: if so, insert full starting template centered at pt
        const all = this.app.objectManager.getAllObjects();
        if (all.length === 0) {
          this.app.insertTemplate('mindmap', pt);
          this.app.selectTool('select');
          return;
        }

        // 3. Create a central root node
        const width = 180;
        const height = 65;
        const x = pt.x - width / 2;
        const y = pt.y - height / 2;

        const rootNode = {
          id: 'mindmap_root_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          type: 'rectangle',
          x: x,
          y: y,
          width: width,
          height: height,
          text: 'Central Topic',
          fill: '#eff6ff',
          stroke: '#2563eb',
          strokeWidth: 2,
          patternStyle: 'solid',
          cornerStyle: 'rounded',
          cornerRadius: 12,
          opacity: 1,
          isMindMapNode: true,
          bounds: { minX: x, minY: y, maxX: x + width, maxY: y + height, width: width, height: height }
        };

        const cmd = new AddObjectCommand(this.app.objectManager, this.app.storageManager, this.app.renderer, rootNode);
        this.app.historyManager.execute(cmd);
        this.app.updateObjectCount();

        // Switch to select tool and select the new node
        this.app.selectTool('select');
        const selectTool = this.app.toolManager.tools.get('select');
        if (selectTool) {
          selectTool.selectObject(rootNode.id);
          this.app.editObjectText(rootNode);
        }
      }
    }

    class ToolManager {
      constructor(app) {
        this.app = app;
        this.tools = new Map();
        this.activeTool = null;

        // Register tools
        this.registerTool('select', new SelectTool(app));
        this.registerTool('hand', new HandTool(app));
        this.registerTool('pen', new PenTool(app));
        this.registerTool('calligraphy', new CalligraphyTool(app));
        this.registerTool('highlighter', new HighlighterTool(app));
        this.registerTool('eraser', new EraserTool(app));
        this.registerTool('rectangle', new RectangleTool(app));
        this.registerTool('ellipse', new EllipseTool(app));
        this.registerTool('line', new LineTool(app));
        this.registerTool('arrow', new ArrowTool(app));
        this.registerTool('shape', new ShapeTool(app));
        this.registerTool('sticky', new StickyNoteTool(app));
        this.registerTool('mindmap', new MindMapTool(app));
        this.registerTool('text', new TextTool(app));
        this.registerTool('table', new TableTool(app));
        this.registerTool('frame', new FrameTool(app));
        this.registerTool('laser', new LaserTool(app));
      }

      registerTool(name, toolInstance) {
        this.tools.set(name, toolInstance);
      }

      getTool(name) {
        return this.tools.get(name);
      }

      setTool(name) {
        if (this.activeTool) {
          this.activeTool.deactivate();
        }
        const tool = this.tools.get(name);
        if (tool) {
          this.activeTool = tool;
          this.activeTool.activate();
        }
      }

      get activeToolName() {
        return this.activeTool ? this.activeTool.name : null;
      }
    }

    /* ==========================================================================
       8.5. BOARD MANAGER (MULTIPLE INDEPENDENT WORKSPACES)
       ========================================================================== */
    class BoardManager {
      constructor(app) {
        this.app = app;
        this.boardsKey = 'vector_boards_meta';
        this.activeBoardKey = 'vector_active_board_id';
        this.boards = [];
        this.activeBoardId = null;
        this.init();
      }

      init() {
        try {
          const savedBoards = SafeStorage.getItem(this.boardsKey);
          if (savedBoards) {
            this.boards = JSON.parse(savedBoards);
          }
        } catch (e) {
          console.warn('Failed to load boards metadata:', e);
        }

        const globalColor = SafeStorage.getItem('vector_board_canvas_color') || '#ffffff';
        const globalGrid = SafeStorage.getItem('vector_board_grid_style') || 'none';

        if (!Array.isArray(this.boards) || this.boards.length === 0) {
          this.boards = [
            {
              id: 'default_board',
              name: 'Main Board',
              canvasColor: globalColor,
              gridStyle: globalGrid,
              cameraState: { x: 0, y: 0, zoom: 1 },
              snapToGrid: false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          ];
          this.saveBoards();
        } else {
          let updated = false;
          for (const b of this.boards) {
            if (!b.canvasColor) {
              b.canvasColor = SafeStorage.getItem(`vector_board_canvas_color_${b.id}`) || globalColor;
              updated = true;
            }
            if (!b.gridStyle) {
              b.gridStyle = SafeStorage.getItem(`vector_board_grid_style_${b.id}`) || globalGrid;
              updated = true;
            }
            if (!b.cameraState) {
              try {
                const savedCam = SafeStorage.getItem(`vector_board_camera_${b.id}`);
                b.cameraState = savedCam ? JSON.parse(savedCam) : { x: 0, y: 0, zoom: 1 };
              } catch(e) {
                b.cameraState = { x: 0, y: 0, zoom: 1 };
              }
              updated = true;
            }
            if (b.snapToGrid === undefined) {
              try {
                const savedSnap = SafeStorage.getItem(`vector_board_snap_to_grid_${b.id}`);
                b.snapToGrid = savedSnap ? JSON.parse(savedSnap) : false;
              } catch(e) {
                b.snapToGrid = false;
              }
              updated = true;
            }

          }
          if (updated) {
            this.saveBoards();
          }
        }

        const savedActiveId = SafeStorage.getItem(this.activeBoardKey);
        if (savedActiveId && this.boards.some(b => b.id === savedActiveId)) {
          this.activeBoardId = savedActiveId;
        } else {
          this.activeBoardId = this.boards[0].id;
          SafeStorage.setItem(this.activeBoardKey, this.activeBoardId);
        }
      }

      saveBoards() {
        try {
          SafeStorage.setItem(this.boardsKey, JSON.stringify(this.boards));
        } catch (e) {
          console.error('Failed to save boards metadata:', e);
        }
      }

      getBoards() {
        return this.boards;
      }

      getActiveBoard() {
        return this.boards.find(b => b.id === this.activeBoardId) || this.boards[0];
      }

      getActiveBoardId() {
        return this.activeBoardId;
      }

      getBoardCanvasColor(boardId) {
        const targetId = boardId || this.activeBoardId;
        const board = this.boards.find(b => b.id === targetId);
        return (board && board.canvasColor) ? board.canvasColor : '#ffffff';
      }

      getBoardGridStyle(boardId) {
        const targetId = boardId || this.activeBoardId;
        const board = this.boards.find(b => b.id === targetId);
        return (board && board.gridStyle) ? board.gridStyle : 'none';
      }

      setBoardCanvasColor(boardId, color) {
        const targetId = boardId || this.activeBoardId;
        const board = this.boards.find(b => b.id === targetId);
        if (board) {
          board.canvasColor = color;
          board.updatedAt = Date.now();
          this.saveBoards();
        }
      }

      setBoardGridStyle(boardId, style) {
        const targetId = boardId || this.activeBoardId;
        const board = this.boards.find(b => b.id === targetId);
        if (board) {
          board.gridStyle = style;
          board.updatedAt = Date.now();
          this.saveBoards();
        }
      }

      getBoardCameraState(boardId) {
        const targetId = boardId || this.activeBoardId;
        const board = this.boards.find(b => b.id === targetId);
        return (board && board.cameraState) ? board.cameraState : { x: 0, y: 0, zoom: 1 };
      }

      setBoardCameraState(boardId, state) {
        const targetId = boardId || this.activeBoardId;
        const board = this.boards.find(b => b.id === targetId);
        if (board && state) {
          board.cameraState = { x: state.x, y: state.y, zoom: state.zoom };
          board.updatedAt = Date.now();
          this.saveBoards();
          try {
            SafeStorage.setItem(`vector_board_camera_${board.id}`, JSON.stringify(board.cameraState));
          } catch(e) {}
        }
      }

      getBoardSnapToGrid(boardId) {
        const targetId = boardId || this.activeBoardId;
        const board = this.boards.find(b => b.id === targetId);
        return (board && typeof board.snapToGrid === 'boolean') ? board.snapToGrid : false;
      }

      setBoardSnapToGrid(boardId, enabled) {
        const targetId = boardId || this.activeBoardId;
        const board = this.boards.find(b => b.id === targetId);
        if (board) {
          board.snapToGrid = !!enabled;
          board.updatedAt = Date.now();
          this.saveBoards();
        }
      }

      async createBoard(name) {
        const boardName = (name && name.trim()) ? name.trim() : `Board ${this.boards.length + 1}`;
        const newBoard = {
          id: 'board_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: boardName,
          canvasColor: '#ffffff',
          gridStyle: 'none',
          cameraState: { x: 0, y: 0, zoom: 1 },
          snapToGrid: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.boards.push(newBoard);
        this.saveBoards();
        await this.app.switchBoard(newBoard.id);
        this.app.showToast(`Created board "${boardName}"`);
        return newBoard;
      }

      async renameBoard(boardId, newName) {
        if (!newName || !newName.trim()) return;
        const board = this.boards.find(b => b.id === boardId);
        if (board) {
          board.name = newName.trim();
          board.updatedAt = Date.now();
          this.saveBoards();
          this.renderUI();
          if (boardId === this.activeBoardId) {
            this.updateActiveBoardHeader();
          }
          this.app.showToast(`Renamed board to "${board.name}"`);
        }
      }

      async duplicateBoard(boardId) {
        const sourceBoard = this.boards.find(b => b.id === boardId);
        if (!sourceBoard) return;

        const newName = `${sourceBoard.name} (Copy)`;
        const newBoard = {
          id: 'board_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: newName,
          canvasColor: sourceBoard.canvasColor || '#ffffff',
          gridStyle: sourceBoard.gridStyle || 'none',
          cameraState: sourceBoard.cameraState ? { ...sourceBoard.cameraState } : { x: 0, y: 0, zoom: 1 },
          snapToGrid: !!sourceBoard.snapToGrid,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.boards.push(newBoard);
        this.saveBoards();

        // Duplicate objects in storage
        await this.app.storageManager.duplicateObjectsForBoard(sourceBoard.id, newBoard.id);

        // Switch to new board
        await this.app.switchBoard(newBoard.id);
        this.app.showToast(`Duplicated "${sourceBoard.name}"`);
      }

      async deleteBoard(boardId) {
        if (this.boards.length <= 1) {
          this.app.showToast('Cannot delete the only board');
          return;
        }

        const boardIndex = this.boards.findIndex(b => b.id === boardId);
        if (boardIndex === -1) return;

        const boardToDelete = this.boards[boardIndex];
        this.boards.splice(boardIndex, 1);
        this.saveBoards();

        // Remove objects from storage
        await this.app.storageManager.deleteObjectsForBoard(boardId);

        this.app.showToast(`Deleted "${boardToDelete.name}"`);

        // If active board was deleted, switch to another board
        if (this.activeBoardId === boardId) {
          const nextBoardId = this.boards[Math.max(0, boardIndex - 1)].id;
          await this.app.switchBoard(nextBoardId);
        } else {
          this.renderUI();
        }
      }

      updateActiveBoardHeader() {
        const activeBoard = this.getActiveBoard();
        const nameEl = document.getElementById('active-board-name');
        if (nameEl && activeBoard) {
          nameEl.textContent = activeBoard.name;
        }
        const btn = document.getElementById('board-selector-btn');
        if (btn && activeBoard) {
          btn.title = `Workspaces: ${activeBoard.name} (Click to switch or manage)`;
          btn.setAttribute('aria-label', `Workspaces: ${activeBoard.name}`);
        }
      }

      renderUI() {
        this.updateActiveBoardHeader();
        const listEl = document.getElementById('boards-list');
        if (!listEl) return;

        listEl.innerHTML = '';

        // Fetch object counts for each board asynchronously
        this.app.storageManager.loadAllObjects().then(allObjects => {
          const countsByBoard = {};
          for (const obj of allObjects) {
            const bId = obj.boardId || 'default_board';
            countsByBoard[bId] = (countsByBoard[bId] || 0) + 1;
          }

          this.boards.forEach(board => {
            const isActive = board.id === this.activeBoardId;
            const itemCount = countsByBoard[board.id] || (board.id === 'default_board' ? (countsByBoard['board_1'] || 0) : 0);

            const itemEl = document.createElement('div');
            itemEl.className = `board-item ${isActive ? 'active' : ''}`;
            itemEl.innerHTML = `
              <div class="board-item-main">
                <div class="board-active-indicator">
                  ${isActive ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ` : ''}
                </div>
                <div class="board-item-info">
                  <span class="board-item-name" id="board-name-text-${board.id}">${this.escapeHtml(board.name)}</span>
                  <span class="board-item-count">${itemCount} ${itemCount === 1 ? 'element' : 'elements'}</span>
                </div>
              </div>
              <div class="board-item-actions">
                <button class="board-action-btn btn-rename-board" data-id="${board.id}" title="Rename Board">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                </button>
                <button class="board-action-btn btn-duplicate-board" data-id="${board.id}" title="Duplicate Board">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                ${this.boards.length > 1 ? `
                  <button class="board-action-btn btn-delete-board danger" data-id="${board.id}" title="Delete Board">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18"/>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                    </svg>
                  </button>
                ` : ''}
              </div>
            `;

            // Click main item to switch board
            const mainEl = itemEl.querySelector('.board-item-main');
            mainEl.addEventListener('click', () => {
              if (board.id !== this.activeBoardId) {
                this.app.switchBoard(board.id);
                this.closeDropdown();
              }
            });

            // Rename button
            const renameBtn = itemEl.querySelector('.btn-rename-board');
            renameBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.promptRename(board);
            });

            // Duplicate button
            const dupBtn = itemEl.querySelector('.btn-duplicate-board');
            dupBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.duplicateBoard(board.id);
            });

            // Delete button
            const delBtn = itemEl.querySelector('.btn-delete-board');
            if (delBtn) {
              delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.promptDelete(board);
              });
            }

            listEl.appendChild(itemEl);
          });
        });
      }

      promptRename(board) {
        const nameTextEl = document.getElementById(`board-name-text-${board.id}`);
        if (!nameTextEl) return;

        const currentName = board.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'board-rename-input';
        input.value = currentName;

        nameTextEl.replaceWith(input);
        input.focus();
        input.select();

        const commitRename = () => {
          const val = input.value.trim();
          if (val && val !== currentName) {
            this.renameBoard(board.id, val);
          } else {
            this.renderUI();
          }
        };

        input.addEventListener('blur', commitRename);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            input.blur();
          } else if (e.key === 'Escape') {
            input.value = currentName;
            input.blur();
          }
        });
      }

      promptDelete(board) {
        this.app.showConfirmModal(
          'Delete Board',
          `Are you sure you want to delete "${board.name}"? All content on this board will be permanently removed.`,
          'Delete Board',
          async () => {
            await this.deleteBoard(board.id);
          }
        );
      }

      toggleDropdown() {
        const dropdown = document.getElementById('boards-dropdown');
        if (!dropdown) return;
        if (dropdown.style.display === 'none' || !dropdown.style.display) {
          this.openDropdown();
        } else {
          this.closeDropdown();
        }
      }

      openDropdown() {
        const dropdown = document.getElementById('boards-dropdown');
        const btn = document.getElementById('board-selector-btn');
        if (!dropdown || !btn) return;
        this.renderUI();
        dropdown.style.display = 'flex';
        btn.classList.add('active');
      }

      closeDropdown() {
        const dropdown = document.getElementById('boards-dropdown');
        const btn = document.getElementById('board-selector-btn');
        if (dropdown) dropdown.style.display = 'none';
        if (btn) btn.classList.remove('active');
      }

      escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }
    }

    /* ==========================================================================
       IMAGE CROP MANAGER
       ========================================================================== */
    class WhiteboardApp {
      constructor() {
        this.svgStage = document.getElementById('svg-stage');
        this.viewportGroup = document.getElementById('viewport-group');
        this.gridPattern = document.getElementById('grid-pattern');
        
        // Modules
        this.renderer = new SVGRenderer(this.svgStage);
        this.renderer.app = this;
        this.objectManager = new ObjectManager();

        // Camera & Infinite Viewport
        this.camera = new Camera(
          this.svgStage, 
          this.viewportGroup, 
          this.gridPattern, 
          (camState) => {
            this.updateZoomUI(camState);
            if (this.boardManager) {
              this.boardManager.setBoardCameraState(null, { x: camState.x, y: camState.y, zoom: camState.zoom });
            }
          }
        );

        this.storageManager = new StorageManager((status) => this.updateSaveStatus(status));
        this.historyManager = new HistoryManager((state) => this.updateHistoryUI(state));
        this.boardManager = new BoardManager(this);
        this.toolManager = new ToolManager(this);

        this.isToolLocked = false;
        this.isPointerDown = false;
        this.isSpacePressed = false;
        this.previousToolBeforeSpace = null;
        this.isMiddleMousePanning = false;
        this.lastMiddleMouseX = 0;
        this.lastMiddleMouseY = 0;

        // Active multi-touch pointers for pinch zoom
        this.activePointers = new Map();

        this.currentSlideIndex = 0;

        this.clipboard = [];
        this.copiedStyle = null;
        this.contextMenuPos = { x: 0, y: 0 };

        this.init();
      }

      async init() {
        // Init Storage Engine & Load Objects
        zqGateCheck(); // ZQ-GATE: 3 - app init
        setInterval(zqGateCheck, 5000); // ZQ-GATE: 7 - re-check every 5 seconds
        try {
          await this.storageManager.init();
          const activeBoardId = this.boardManager.getActiveBoardId();
          const storedObjects = await this.storageManager.loadObjectsForBoard(activeBoardId);
          for (const obj of storedObjects) {
            this.objectManager.addObject(obj);
            this.renderer.renderObject(obj);
          }
          this.updateObjectCount();
          this.updateSaveStatus('saved');
          this.boardManager.renderUI();
        } catch (err) {
          console.error('Storage initialization failed:', err);
          this.showToast('Failed to load saved board state');
        }

        // Activate Default Tool (Pen)
        this.selectTool('pen');

        // Restore Canvas Settings, View & Camera for Active Board
        try {
          const activeBoard = this.boardManager.getActiveBoard();
          const savedCanvasColor = activeBoard.canvasColor || '#ffffff';
          const savedGridStyle = activeBoard.gridStyle || 'none';
          const savedSnap = !!activeBoard.snapToGrid;
          const savedCam = activeBoard.cameraState || { x: 0, y: 0, zoom: 1 };

          this.setCanvasColor(savedCanvasColor, false);
          this.setCanvasGridStyle(savedGridStyle, false);
          this.setSnapToGrid(savedSnap, false);

          if (savedCam) {
            this.camera.x = savedCam.x || 0;
            this.camera.y = savedCam.y || 0;
            this.camera.zoom = savedCam.zoom || 1;
            this.camera.applyTransform();
          }
        } catch (err) {}

        // Bind Events
        this.bindEvents();
        this.bindUI();

        /* ── Live Canvas Watermark ── */
        this._injectCanvasWatermark();
      }

      _injectCanvasWatermark() {
        /* Remove any previous instance (e.g. board switch) */
        const existing = this.svgStage.querySelector('#owb-watermark');
        if (existing) existing.remove();

        const NS = 'http://www.w3.org/2000/svg';

        /* Outer group: anchored to bottom-right via a CSS transform so it
           lives in screen space, completely outside the pan/zoom viewport  */
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('id', 'owb-watermark');
        /* Prevent selection, interaction, and DevTools-drag removal tricks  */
        g.setAttribute('pointer-events', 'none');
        g.setAttribute('style', [
          'pointer-events:none',
          'user-select:none',
          '-webkit-user-select:none',
        ].join(';'));

        /* Background pill — helps legibility on dark canvases without being
           obtrusive; uses the same subtle grey as the text                  */
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('id', 'owb-wm-bg');
        rect.setAttribute('rx', '4');
        rect.setAttribute('ry', '4');
        rect.setAttribute('fill', '#f1f3f5');
        rect.setAttribute('opacity', '0.55');

        const text = document.createElementNS(NS, 'text');
        text.setAttribute('id', 'owb-wm-text');
        text.setAttribute('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
        text.setAttribute('font-size', '13');
        text.setAttribute('font-weight', '500');
        text.setAttribute('letter-spacing', '0.03em');
        text.setAttribute('fill', '#9aa3af');
        text.setAttribute('opacity', '0.7');
        text.setAttribute('dominant-baseline', 'auto');
        text.setAttribute('style', 'user-select:none;pointer-events:none;');
        text.textContent = 'onlinewhiteboard.org';

        g.appendChild(rect);
        g.appendChild(text);

        /* Append LAST inside svgStage so it paints above everything,
           but is NOT inside viewportGroup (immune to pan/zoom)        */
        this.svgStage.appendChild(g);

        const MARGIN = 12;
        const PAD_X  = 6;
        const PAD_Y  = 3;

        const _positionWatermark = () => {
          const stageRect = this.svgStage.getBoundingClientRect();
          const W = stageRect.width  || window.innerWidth;
          const H = stageRect.height || window.innerHeight;

          /* We work in SVG viewport pixels (no transform needed because
             this group is outside viewportGroup)                        */
          const fontSize = 13;
          /* Approximate text width (monospace-ish estimate)             */
          const approxW  = text.textContent.length * fontSize * 0.56;
          const approxH  = fontSize * 1.35;

          const rx = W - MARGIN - approxW - PAD_X;
          const ry = H - MARGIN - approxH - PAD_Y;

          rect.setAttribute('x',      (rx - PAD_X).toFixed(1));
          rect.setAttribute('y',      (ry - PAD_Y).toFixed(1));
          rect.setAttribute('width',  (approxW + PAD_X * 2).toFixed(1));
          rect.setAttribute('height', (approxH + PAD_Y * 2).toFixed(1));

          text.setAttribute('x', (rx).toFixed(1));
          text.setAttribute('y', (ry + approxH * 0.78).toFixed(1));
        };

        /* Defer first position until after the SVG has laid out in the DOM;
           getBoundingClientRect() returns 0×0 if called synchronously during
           async init() before the browser has performed a layout pass.       */
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            _positionWatermark();
          });
        });

        /* Re-position on resize */
        this._wmResizeObserver = new ResizeObserver(_positionWatermark);
        this._wmResizeObserver.observe(this.svgStage);
        window.addEventListener('resize', _positionWatermark, { passive: true });

        /* Re-assert every few seconds — guards against DOM manipulation  */
        this._wmGuardInterval = setInterval(() => {
          if (!this.svgStage.contains(g)) {
            this.svgStage.appendChild(g);
            _positionWatermark();
          } else if (g !== this.svgStage.lastElementChild) {
            /* Ensure it stays on top */
            this.svgStage.appendChild(g);
          }
        }, 3000);
      }

      isMobileDevice() {
        if (typeof window === 'undefined') return false;
        const isSmallScreen = window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
        const isTouchScreen = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) && (window.innerWidth <= 1024 || 'ontouchstart' in window);
        return Boolean(isSmallScreen || isMobileUA || isTouchScreen);
      }

      bindEvents() {
        // Right-Click Context Menu Listener on Canvas & Stage
        const handleCtxTrigger = (e) => {
          // Strictly disable canvas context menu on mobile screens/devices
          if (this.isMobileDevice()) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            return;
          }
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.modal-card') || e.target.closest('#inline-text-editor') || e.target.closest('.toolbar') || e.target.closest('.modal-overlay') || e.target.closest('#boards-dropdown') || e.target.closest('#workspace-panel') || e.target.closest('#brand-header')) {
            return;
          }
          this.handleContextMenu(e);
        };

        window.addEventListener('contextmenu', handleCtxTrigger);

        // Long-Press Touch Support for Non-Mobile Touch Devices
        let touchTimer = null;
        let touchStartPos = null;

        document.addEventListener('touchstart', (e) => {
          // Do not trigger context menu on mobile screens
          if (this.isMobileDevice()) {
            clearTimeout(touchTimer);
            return;
          }
          if (e.touches.length !== 1) {
            clearTimeout(touchTimer);
            return;
          }
          const t = e.touches[0];
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.modal-card') || e.target.closest('.toolbar') || e.target.closest('.custom-context-menu') || e.target.closest('#workspace-panel') || e.target.closest('#brand-header')) {
            return;
          }
          touchStartPos = { x: t.clientX, y: t.clientY };
          clearTimeout(touchTimer);
          touchTimer = setTimeout(() => {
            if (touchStartPos && !this.isMobileDevice()) {
              const fakeEvent = {
                preventDefault: () => {},
                stopPropagation: () => {},
                clientX: touchStartPos.x,
                clientY: touchStartPos.y
              };
              this.handleContextMenu(fakeEvent);
            }
          }, 520);
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
          if (touchStartPos && e.touches.length === 1) {
            const t = e.touches[0];
            const dist = Math.hypot(t.clientX - touchStartPos.x, t.clientY - touchStartPos.y);
            if (dist > 8) {
              clearTimeout(touchTimer);
              touchStartPos = null;
            }
          }
        }, { passive: true });

        document.addEventListener('touchend', () => {
          clearTimeout(touchTimer);
          touchStartPos = null;
        });

        // Hide Context Menu on canvas pointerdown, scroll, or resize
        document.addEventListener('pointerdown', (e) => {
          const menu = document.getElementById('canvas-context-menu');
          if (menu && menu.style.display !== 'none' && !menu.contains(e.target)) {
            this.hideContextMenu();
          }
        });

        window.addEventListener('resize', () => {
          this.hideContextMenu();
        });

        // Outside click handler to close boards dropdown
        document.addEventListener('pointerdown', (e) => {
          const dropdown = document.getElementById('boards-dropdown');
          const btn = document.getElementById('board-selector-btn');
          const panel = document.getElementById('workspace-panel');
          if (dropdown && dropdown.style.display !== 'none') {
            if (!dropdown.contains(e.target) && !btn?.contains(e.target) && !panel?.contains(e.target) && !e.target.closest('.modal-overlay')) {
              this.boardManager.closeDropdown();
            }
          }
        });

        // Pointer Events
        this.svgStage.addEventListener('pointerdown', (e) => {
          // Secondary button (right click): Handled exclusively by contextmenu event. Do not capture or drag.
          if (e.button === 2) {
            return;
          }

          // If the gemini text editor is open and the pointer originated inside it
          // (e.g. double-clicking to select text), do not pass the event to the
          // canvas tools — otherwise the select tool would start repositioning the
          // text element while the user is simply selecting characters.
          if (this._geminiEditor) {
            const fo = document.getElementById('gemini-fo-editor');
            if (fo && (fo === e.target || fo.contains(e.target))) {
              return;
            }
          }

          this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

          // Middle mouse drag pan
          if (e.button === 1) {
            e.preventDefault();
            this.isMiddleMousePanning = true;
            this.lastMiddleMouseX = e.clientX;
            this.lastMiddleMouseY = e.clientY;
            this.svgStage.classList.add('panning');
            return;
          }

          // Pinch zoom gesture check (2 pointers)
          if (this.activePointers.size >= 2) {
            if (this.toolManager.activeTool) {
              this.toolManager.activeTool.cancel();
            }
            return;
          }

          // Auto switch to select tool if clicking a selection handle (like rotation or resize)
          const handle = e.target ? e.target.getAttribute('data-handle') : null;
          if (handle && this.toolManager.activeToolName !== 'select') {
            this.selectTool('select');
          }

          this.svgStage.setPointerCapture(e.pointerId);
          this.isPointerDown = true;
          
          const pt = this.camera.screenToSvg(e.clientX, e.clientY);
          if (this.toolManager.activeTool) {
            this.toolManager.activeTool.pointerDown(e, pt);
          }
        });

        this.svgStage.addEventListener('pointermove', (e) => {
          // Ignore move events that originate inside the active gemini text editor
          if (this._geminiEditor) {
            const fo = document.getElementById('gemini-fo-editor');
            if (fo && (fo === e.target || fo.contains(e.target))) {
              return;
            }
          }

          if (this.activePointers.has(e.pointerId)) {
            this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          }

          // Middle mouse pan
          if (this.isMiddleMousePanning) {
            const dx = e.clientX - this.lastMiddleMouseX;
            const dy = e.clientY - this.lastMiddleMouseY;
            this.lastMiddleMouseX = e.clientX;
            this.lastMiddleMouseY = e.clientY;
            this.camera.panBy(dx, dy);
            return;
          }

          // Touch Pinch Zoom & Pan (2 pointers)
          if (this.activePointers.size === 2) {
            const pts = Array.from(this.activePointers.values());
            const currentDist = MathUtils.distance(pts[0], pts[1]);
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;

            if (this.lastPinchDist) {
              const zoomFactor = currentDist / this.lastPinchDist;
              this.camera.zoomAtPoint(this.camera.zoom * zoomFactor, midX, midY);

              if (this.lastPinchMidX !== undefined) {
                const panDx = midX - this.lastPinchMidX;
                const panDy = midY - this.lastPinchMidY;
                this.camera.panBy(panDx, panDy);
              }
            }

            this.lastPinchDist = currentDist;
            this.lastPinchMidX = midX;
            this.lastPinchMidY = midY;
            return;
          }

          const pt = this.camera.screenToSvg(e.clientX, e.clientY);
          if (this.toolManager.activeTool) {
            this.toolManager.activeTool.pointerMove(e, pt);
          }
        });

        const handlePointerEnd = (e) => {
          this.activePointers.delete(e.pointerId);
          if (this.activePointers.size < 2) {
            this.lastPinchDist = null;
            this.lastPinchMidX = undefined;
            this.lastPinchMidY = undefined;
          }

          if (this.isMiddleMousePanning && e.button === 1) {
            this.isMiddleMousePanning = false;
            this.svgStage.classList.remove('panning');
            return;
          }

          if (!this.isPointerDown) return;
          this.isPointerDown = false;
          
          const pt = this.camera.screenToSvg(e.clientX, e.clientY);
          if (this.toolManager.activeTool) {
            this.toolManager.activeTool.pointerUp(e, pt);
          }
        };

        this.svgStage.addEventListener('pointerup', handlePointerEnd);
        this.svgStage.addEventListener('pointercancel', handlePointerEnd);

        // Double Click for Text/Sticky/Connector Editing or Image Cropping / Polyline completion
        this.svgStage.addEventListener('dblclick', (e) => {
          const pt = this.camera.screenToSvg(e.clientX, e.clientY);

          const hitIds = this.objectManager.hitTestStroke(pt, 12);
          if (hitIds.length > 0) {
            const obj = this.objectManager.getObject(hitIds[hitIds.length - 1]);
            if (obj && obj.type === 'image') {
              this.startImageCrop(obj);
            }
            if (obj && obj.type === 'table') {
              const rows = Math.max(1, obj.rows || 3);
              const cols = Math.max(1, obj.cols || 3);
              const colW = obj.width / cols;
              const rowH = obj.height / rows;

              // Calculate which cell was clicked
              const relX = Math.max(0, Math.min(obj.width - 1, pt.x - obj.x));
              const relY = Math.max(0, Math.min(obj.height - 1, pt.y - obj.y));
              const clickedCol = Math.min(cols - 1, Math.floor(relX / colW));
              const clickedRow = Math.min(rows - 1, Math.floor(relY / rowH));

              const cellSvgX = obj.x + clickedCol * colW;
              const cellSvgY = obj.y + clickedRow * rowH;
              const screenPt = this.camera.svgToScreen(cellSvgX, cellSvgY);

              if (!obj.cells) obj.cells = [];
              while (obj.cells.length <= clickedRow) {
                obj.cells.push(new Array(cols).fill(''));
              }
              while (obj.cells[clickedRow].length <= clickedCol) {
                obj.cells[clickedRow].push('');
              }

              const isHeader = (obj.headerRow !== false && clickedRow === 0);
              const currentCellText = obj.cells[clickedRow][clickedCol] !== undefined ? String(obj.cells[clickedRow][clickedCol]) : (isHeader ? `Header ${clickedCol + 1}` : '');

              this.openInlineEditor(screenPt, currentCellText, {
                width: Math.max(colW, 80),
                height: Math.max(rowH, 32),
                fontSize: obj.fontSize || Math.max(11, Math.min(16, Math.round(rowH * 0.42))),
                color: isHeader ? (obj.headerTextColor || '#0f172a') : (obj.textColor || '#1e293b'),
                background: isHeader ? (obj.headerFill || '#f1f5f9') : (obj.fill || '#ffffff'),
                isMultiline: true,
                editingObjId: obj.id
              }, (newVal) => {
                if (newVal !== undefined && newVal !== obj.cells[clickedRow][clickedCol]) {
                  const oldObj = JSON.parse(JSON.stringify(obj));
                  obj.cells[clickedRow][clickedCol] = newVal;
                  this.renderer.renderObject(obj);
                  const newObj = JSON.parse(JSON.stringify(obj));
                  const cmd = new TransformObjectsCommand(
                    this.objectManager,
                    this.storageManager,
                    this.renderer,
                    [oldObj],
                    [newObj]
                  );
                  this.historyManager.execute(cmd);
                  const selectTool = this.toolManager.tools.get('select');
                  this.updateSelectionUI(selectTool ? selectTool.getSelectedObjects() : []);
                }
              });
              return;
            }
            if (obj && obj.shapeType !== 'custom_fill' && (obj.type === 'text' || obj.type === 'sticky' || obj.type === 'shape' || obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'line' || obj.type === 'arrow')) {
              this.editObjectText(obj);
              return;
            }
          }
        });

        // Wheel Zoom & Pan handling
        this.svgStage.addEventListener('wheel', (e) => {
          e.preventDefault();

          if (e.ctrlKey || e.metaKey) {
            const zoomSensitivity = 0.0025;
            const delta = -e.deltaY;
            const factor = Math.exp(delta * zoomSensitivity);
            this.camera.zoomAtPoint(this.camera.zoom * factor, e.clientX, e.clientY);
          } else {
            this.camera.panBy(-e.deltaX, -e.deltaY);
          }
        }, { passive: false });

          // Keyboard Shortcuts & Controls
        window.addEventListener('keydown', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

          const ctrl = e.ctrlKey || e.metaKey;

          // Polyline Tool Active Handling (Enter to complete, Escape to cancel, Backspace/Delete to undo point)

          // Spacebar Quick Pan Toggle
          if (e.code === 'Space' && !this.isSpacePressed) {
            this.isSpacePressed = true;
            this.previousToolBeforeSpace = this.toolManager.activeToolName;
            this.selectTool('hand');
            return;
          }

          if (ctrl && e.altKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) this.copySelectionStyle(selectTool.getSelectedObjects());
            return;
          } else if (ctrl && e.altKey && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) this.pasteSelectionStyle(selectTool.getSelectedObjects());
            return;
          } else if (ctrl && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            this.selectTool('select');
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) selectTool.selectAll();
          } else if (ctrl && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            this.copySelection();
          } else if (ctrl && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            this.cutSelection();
          } else if (ctrl && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            this.pasteObjects();
          } else if (ctrl && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            this.selectTool('select');
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) {
              if (e.shiftKey) {
                selectTool.ungroupSelection();
              } else {
                selectTool.groupSelection();
              }
            }
          } else if (ctrl && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) selectTool.duplicateSelection();
          } else if (ctrl && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            this.openEmbedLinkModal();
          } else if (e.key === 'Delete' || e.key === 'Backspace') {
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool && selectTool.selectedIds.size > 0) {
              e.preventDefault();
              selectTool.deleteSelection();
            }
          } else if (ctrl && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
              this.historyManager.redo();
            } else {
              this.historyManager.undo();
            }
            this.updateObjectCount();
            if (this.toolManager.activeToolName === 'select') {
              this.toolManager.activeTool.updateOverlay();
            }
          } else if (ctrl && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.historyManager.redo();
            this.updateObjectCount();
            if (this.toolManager.activeToolName === 'select') {
              this.toolManager.activeTool.updateOverlay();
            }
          } else if (ctrl && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            this.toggleToolTextStyle('bold');
          } else if (ctrl && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            this.toggleToolTextStyle('italic');
          } else if (ctrl && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            this.toggleToolTextStyle('underline');
          } else if (ctrl && (e.key === '=' || e.key === '+')) {
            e.preventDefault();
            this.camera.setZoom(this.camera.zoom * 1.2);
          } else if (ctrl && e.key === '-') {
            e.preventDefault();
            this.camera.setZoom(this.camera.zoom / 1.2);
          } else if (ctrl && e.key === '0') {
            e.preventDefault();
            this.camera.reset();
          } else if (e.key.toLowerCase() === 'v') {
            const selectTool = this.toolManager.tools.get('select');
            if (this.toolManager.activeToolName === 'select' && selectTool && selectTool.selectedIds.size > 0 && (e.shiftKey || e.altKey)) {
              e.preventDefault();
              selectTool.flipSelection('v');
            } else {
              this.selectTool('select');
            }
          } else if (e.key.toLowerCase() === 's') {
          } else if (e.key.toLowerCase() === 'h') {
            const selectTool = this.toolManager.tools.get('select');
            if (this.toolManager.activeToolName === 'select' && selectTool && selectTool.selectedIds.size > 0) {
              e.preventDefault();
              selectTool.flipSelection('h');
            } else {
              this.selectTool('hand');
            }
          } else if (e.key.toLowerCase() === 'p' || e.key === '1') {
            if (e.shiftKey) {
            } else {
              this.selectTool('pen');
            }
          } else if (e.key.toLowerCase() === 'c') {
            this.selectTool('calligraphy');
          } else if (e.key.toLowerCase() === 'x' || e.key === '2') {
            this.selectTool('highlighter');
          } else if (e.key.toLowerCase() === 'm') {
            this.selectTool('mindmap');
          } else if (e.key.toLowerCase() === 'e' || e.key === '3') {
            this.selectTool('eraser');
          } else if (e.key.toLowerCase() === 'r') {
            const selectTool = this.toolManager.tools.get('select');
            if (this.toolManager.activeToolName === 'select' && selectTool && selectTool.selectedIds.size > 0) {
              e.preventDefault();
              if (e.shiftKey) {
                selectTool.rotateSelection(-90);
              } else {
                selectTool.rotateSelection(90);
              }
            } else {
              this.selectTool('rectangle');
            }
          } else if (e.key.toLowerCase() === 'o') {
            this.selectTool('ellipse');
          } else if (e.key.toLowerCase() === 'l') {
            this.selectTool('line');
          } else if (e.key.toLowerCase() === 'd') {
            this.selectTool('shape');
          } else if (e.key.toLowerCase() === 'n') {
            this.selectTool('sticky');
          } else if (e.key.toLowerCase() === 't') {
            if (e.shiftKey) {
              this.selectTool('table');
            } else {
              this.selectTool('text');
            }
            if (e.shiftKey) {
              this.toggleFramesPanel();
            } else {
              this.selectTool('frame');
            }
          } else if (e.key.toLowerCase() === 'k') {
            this.selectTool('laser');
          } else if (e.key.toLowerCase() === 'i') {
            document.getElementById('image-file-input')?.click();
          } else if (e.key === 'Tab') {
            const selectTool = this.toolManager.tools.get('select');
            const selected = selectTool ? selectTool.getSelectedObjects() : [];
            if (selected.length === 1 && MathUtils.isConnectableShape(selected[0])) {
              e.preventDefault();
              this.addMindMapChild(selected[0].id);
            }
          } else if (e.key === 'Enter') {
            const selectTool = this.toolManager.tools.get('select');
            const selected = selectTool ? selectTool.getSelectedObjects() : [];
            if (selected.length === 1 && MathUtils.isConnectableShape(selected[0])) {
              e.preventDefault();
              const dir = e.shiftKey ? 'above' : 'below';
              this.addMindMapSibling(selected[0].id, dir);
            }
          } else if (e.key === 'F2') {
            const selectTool = this.toolManager.tools.get('select');
            const selected = selectTool ? selectTool.getSelectedObjects() : [];
            if (selected.length === 1) {
              e.preventDefault();
              this.editObjectText(selected[0]);
            }
          } else if (e.key === ']' && ctrl) {
            e.preventDefault();
            this.toolManager.tools.get('select')?.bringToFront();
          } else if (e.key === '[' && ctrl) {
            e.preventDefault();
            this.toolManager.tools.get('select')?.sendToBack();
          } else if (e.key === ']') {
            this.toolManager.tools.get('select')?.bringForward();
          } else if (e.key === '[') {
            this.toolManager.tools.get('select')?.sendBackward();
          } else if (e.key === '?') {
            const shortcutsModal = document.getElementById('shortcuts-modal');
            if (shortcutsModal) {
              shortcutsModal.classList.toggle('show');
            }
          } else if (e.key === 'F11' || (ctrl && e.shiftKey && e.key.toLowerCase() === 'f')) {
            e.preventDefault();
            this.toggleFullscreen();
          } else if (e.key === 'Escape') {
            if (this.isFullscreenMode()) {
              this.exitFullscreen();
            }
            this.hideContextMenu();
            document.getElementById('templates-modal')?.classList.remove('show');
            document.getElementById('shortcuts-modal')?.classList.remove('show');
            this.closeEmbedLinkModal();
            if (this.toolManager.activeTool) {
              this.toolManager.activeTool.cancel();
            }
          }
        });

        window.addEventListener('keyup', (e) => {
          if (e.code === 'Space' && this.isSpacePressed) {
            this.isSpacePressed = false;
            if (this.previousToolBeforeSpace) {
              this.selectTool(this.previousToolBeforeSpace);
              this.previousToolBeforeSpace = null;
            } else {
              this.selectTool('pen');
            }
          }
        });
      }

      // Gemini-style: open an embedded SVG foreignObject textarea for text tool
      openGeminiTextEditor(svgX, svgY, existingObjId, textTool) {
        // Close any existing gemini editor first
        this.closeGeminiTextEditor(false);

        const objectsLayer = document.getElementById('objects-layer');
        const zoom = this.camera ? this.camera.zoom : 1;

        // Get existing object if editing
        const existingObj = existingObjId ? this.objectManager.getObject(existingObjId) : null;
        const fontSize = existingObj ? (existingObj.fontSize || 24) : (textTool ? textTool.fontSize || 24 : 24);
        const color = existingObj ? (existingObj.stroke || '#0f172a') : (textTool ? textTool.stroke || '#0f172a' : '#0f172a');
        const bgColor = existingObj ? (existingObj.fill && existingObj.fill !== 'none' ? existingObj.fill : 'transparent') : (textTool && textTool.fill && textTool.fill !== 'none' ? textTool.fill : 'transparent');
        const bold = existingObj ? !!existingObj.bold : (textTool ? !!textTool.bold : false);
        const italic = existingObj ? !!existingObj.italic : (textTool ? !!textTool.italic : false);
        const underline = existingObj ? !!existingObj.underline : (textTool ? !!textTool.underline : false);
        const strike = existingObj ? !!existingObj.strike : (textTool ? !!textTool.strike : false);
        const fontFamily = existingObj ? (existingObj.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif") : (textTool ? (textTool.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif") : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
        const textAlign = existingObj ? (existingObj.textAlign || 'left') : (textTool ? (textTool.textAlign || 'left') : 'left');

        // Hide existing SVG element if editing
        if (existingObjId) {
          const liveEl = document.getElementById('obj-' + existingObjId);
          if (liveEl) liveEl.style.visibility = 'hidden';
        }

        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('x', svgX);
        foreignObject.setAttribute('y', svgY);
        foreignObject.setAttribute('width', 120);
        foreignObject.setAttribute('height', fontSize * 1.5);
        foreignObject.setAttribute('id', 'gemini-fo-editor');

        const textarea = document.createElement('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.style.border = '1.5px dashed #2563eb';
        textarea.style.outline = 'none';
        textarea.style.resize = 'none';
        textarea.style.fontFamily = fontFamily;
        textarea.style.padding = '0';
        textarea.style.margin = '0';
        textarea.style.overflow = 'hidden';
        textarea.style.whiteSpace = 'pre-wrap';
        textarea.style.overflowWrap = 'anywhere';
        textarea.style.wordBreak = 'break-word';
        textarea.style.lineHeight = '1.2';
        textarea.style.borderRadius = '2px';
        textarea.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        textarea.style.display = 'block';
        textarea.style.boxSizing = 'border-box';
        textarea.style.fontSize = `${fontSize}px`;
        textarea.style.fontWeight = bold ? '700' : '400';
        textarea.style.fontStyle = italic ? 'italic' : 'normal';
        textarea.style.textDecoration = (underline && strike) ? 'underline line-through' : (underline ? 'underline' : (strike ? 'line-through' : 'none'));
        textarea.style.textAlign = textAlign;
        textarea.style.color = color;
        textarea.style.backgroundColor = bgColor === 'transparent' ? 'rgba(255,255,255,0.93)' : bgColor;
        textarea.style.caretColor = '#2563eb';
        textarea.setAttribute('class', 'gemini-embedded-textarea');

        // Set initial value
        if (existingObj && existingObj.text) {
          textarea.value = existingObj.text;
        } else {
          textarea.value = '';
        }

        foreignObject.appendChild(textarea);
        objectsLayer.appendChild(foreignObject);

        // Store editor state
        this._geminiEditor = { foreignObject, textarea, svgX, svgY, existingObjId, textTool, fontSize, color, bgColor, bold, italic, underline, strike, fontFamily, textAlign };

        // Snapshot window + ancestor scroll positions so growing/pasting into the
        // textarea never makes the page jump (e.g. down to the content below the board).
        const keepScroll = () => {
          const wx = window.scrollX, wy = window.scrollY;
          const saved = [];
          for (let n = foreignObject.parentNode; n && n.nodeType === 1; n = n.parentNode) {
            saved.push([n, n.scrollTop, n.scrollLeft]);
          }
          return () => {
            window.scrollTo(wx, wy);
            saved.forEach(([n, t, l]) => { n.scrollTop = t; n.scrollLeft = l; });
          };
        };

        const resizeTextarea = () => {
          if (!foreignObject || !textarea) return;
          const restoreScroll = keepScroll();
          const borderPx = 3; // 1.5px dashed border on each side
          const maxW = MathUtils.TEXT_TOOL_MAX_WIDTH; // same limit the canvas wraps at
          // Natural (unwrapped) width of the longest line, capped at the max width
          const ctx = MathUtils._textWrapCtx || (MathUtils._textWrapCtx = document.createElement('canvas').getContext('2d'));
          ctx.font = `${textarea.style.fontStyle} ${textarea.style.fontWeight} ${fontSize}px ${fontFamily}`;
          const natural = Math.max(...(textarea.value || ' ').split('\n').map(l => ctx.measureText(l + ' ').width));
          const contentW = Math.min(Math.max(natural + 16, 60), maxW);
          foreignObject.setAttribute('width', contentW + borderPx);
          // Height follows the wrapped content
          textarea.style.height = '0px';
          const height = Math.max(textarea.scrollHeight + borderPx, fontSize * 1.2 + borderPx);
          textarea.style.height = '100%';
          foreignObject.setAttribute('height', height);
          restoreScroll();
        };

        textarea.addEventListener('input', resizeTextarea);
        // The browser scrolls to the caret while inserting pasted text; undo that jump.
        textarea.addEventListener('paste', () => {
          const restoreScroll = keepScroll();
          setTimeout(restoreScroll, 0);
          requestAnimationFrame(restoreScroll);
        });

        // On mobile, blur fires spuriously during the tool-switch DOM update.
        // A short debounce lets focus re-settle before we commit to closing.
        let _blurTimeout = null;
        textarea.addEventListener('blur', () => {
          _blurTimeout = setTimeout(() => {
            if (document.activeElement !== textarea) {
              this.closeGeminiTextEditor(true);
            }
          }, 150);
        });
        textarea.addEventListener('focus', () => {
          if (_blurTimeout) { clearTimeout(_blurTimeout); _blurTimeout = null; }
        });

        textarea.addEventListener('keydown', (ev) => {
          if (ev.key === 'Escape') {
            ev.preventDefault();
            this.closeGeminiTextEditor(false);
          }
        });

        resizeTextarea();

        // On mobile, focus must be called synchronously to trigger the virtual
        // keyboard. On desktop the rAF delay avoids layout-flicker.
        const _isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (_isMobile) {
          textarea.focus({ preventScroll: true });
          textarea.select();
        } else {
          requestAnimationFrame(() => {
            const _sx = window.scrollX, _sy = window.scrollY;
            textarea.focus({ preventScroll: true });
            textarea.select();
            window.scrollTo(_sx, _sy);
          });
        }

        // Switch to select mode while editing, but keep text style group visible.
        // Deferred via rAF so the DOM mutations from selectTool() don't blur the
        // textarea before it has fully received focus (critical on mobile).
        if (!this.isToolLocked) {
          requestAnimationFrame(() => {
            this.selectTool('select');
            const tsg = document.getElementById('prop-text-style-group');
            const pp = document.getElementById('property-panel');
            if (tsg) tsg.style.display = 'flex';
            if (pp) { pp.style.opacity = '1'; pp.style.pointerEvents = 'auto'; }
            this.syncTextStyleUI({ bold, italic, underline, strike, fontFamily, textAlign });
            const fontSel = document.getElementById('prop-font-family-select');
            if (fontSel) fontSel.value = fontFamily;
          });
        }
      }

      closeGeminiTextEditor(save) {
        if (!this._geminiEditor) return;
        const { foreignObject, textarea, svgX, svgY, existingObjId, textTool, fontSize, color, bgColor, bold, italic, underline, strike, fontFamily, textAlign } = this._geminiEditor;
        this._geminiEditor = null;

        const val = textarea ? textarea.value.trim() : '';

        if (foreignObject && foreignObject.parentNode) {
          foreignObject.parentNode.removeChild(foreignObject);
        }

        // Show existing object again
        if (existingObjId) {
          const liveEl = document.getElementById('obj-' + existingObjId);
          if (liveEl) liveEl.style.visibility = 'visible';
        }

        if (!save || !val) {
          // If editing existing, just restore it; if new, do nothing (no object was pre-created)
          if (existingObjId && !val) {
            // Delete the object if cleared
            const deleteCmd = new DeleteObjectsCommand(
              this.objectManager, this.storageManager, this.renderer, [existingObjId]
            );
            this.historyManager.execute(deleteCmd);
            this.updateObjectCount();
          }
          // Reset the text style group that was forced visible when the editor opened.
          // If still in select mode with no text selection, hide it now.
          requestAnimationFrame(() => {
            const tsg = document.getElementById('prop-text-style-group');
            const pp = document.getElementById('property-panel');
            if (this.toolManager && this.toolManager.activeToolName === 'select') {
              const selectTool = this.toolManager.tools.get('select');
              const selected = selectTool ? (selectTool.getSelectedObjects ? selectTool.getSelectedObjects() : []) : [];
              const hasTextSelected = selected.some(o => o.type === 'text');
              if (tsg) tsg.style.display = hasTextSelected ? 'flex' : 'none';
              if (pp && selected.length === 0) { pp.style.opacity = '0'; pp.style.pointerEvents = 'none'; }
            }
          });
          return;
        }

        if (existingObjId) {
          // Update existing object
          const obj = this.objectManager.getObject(existingObjId);
          if (obj) {
            obj.text = val;
            this.renderer.renderObject(obj);
            this.storageManager.saveAll(this.objectManager.getAllObjects());
          }
        } else {
          // Create new text object
          const defaultW = 40;
          const defaultH = Math.ceil(fontSize * 1.2);
          const newObj = {
            id: 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            type: 'text',
            x: svgX,
            y: svgY,
            width: defaultW,
            height: defaultH,
            bounds: { minX: svgX, minY: svgY, maxX: svgX + defaultW, maxY: svgY + defaultH, width: defaultW, height: defaultH },
            text: val,
            fontSize: fontSize,
            stroke: color,
            fill: bgColor === 'rgba(255,255,255,0.93)' ? 'none' : bgColor,
            bold: bold,
            italic: italic,
            underline: underline,
            strike: strike,
            fontFamily: fontFamily,
            textAlign: textAlign,
            opacity: 1,
            zIndex: this.objectManager.count + 1,
            createdAt: Date.now()
          };
          const cmd = new AddObjectCommand(
            this.objectManager, this.storageManager, this.renderer, newObj
          );
          this.historyManager.execute(cmd);
          this.updateObjectCount();
          this.renderer.renderObject(newObj);
          this.storageManager.saveAll(this.objectManager.getAllObjects());

          // Select new object
          const selectTool = this.toolManager.tools.get('select');
          if (selectTool) selectTool.selectObject(newObj.id, false);
        }
      }

      startImageCrop(obj) {
        // Remove any existing crop UI
        const existing = document.getElementById('crop-overlay');
        if (existing) existing.remove();

        const cam = this.camera;
        const snap = () => cam.svgToScreen(obj.x, obj.y);

        // Snapshot full object state so Cancel can restore it exactly
        const _snapshot = JSON.parse(JSON.stringify(obj));

        // Crop handles always start at full image
        let cx = 0, cy = 0, cw = 1, ch = 1;

        // Overlay container
        const overlay = document.createElement('div');
        overlay.id = 'crop-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:20000;cursor:crosshair;';

        // Dark backdrop drawn as four rects via a single canvas-less approach:
        // we use a semi-transparent full overlay + a "hole" cut via mix-blend-mode
        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.45);pointer-events:none;';
        overlay.appendChild(backdrop);

        // Bright crop rect (punches through backdrop via isolation)
        const cropBox = document.createElement('div');
        cropBox.style.cssText = 'position:absolute;outline:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,0.45);pointer-events:none;box-sizing:border-box;';
        overlay.appendChild(cropBox);

        // Handles (8 directions)
        const HANDLES = ['nw','n','ne','w','e','sw','s','se'];
        const handleEls = {};
        HANDLES.forEach(dir => {
          const h = document.createElement('div');
          const isCorner = dir.length === 2;
          h.style.cssText = `position:absolute;width:${isCorner?10:8}px;height:${isCorner?10:8}px;background:#fff;border:1.5px solid #2563eb;box-sizing:border-box;pointer-events:all;z-index:1;`;
          const cursors = {nw:'nwse-resize',n:'ns-resize',ne:'nesw-resize',w:'ew-resize',e:'ew-resize',sw:'nesw-resize',s:'ns-resize',se:'nwse-resize'};
          h.style.cursor = cursors[dir];
          overlay.appendChild(h);
          handleEls[dir] = h;
        });

        // Confirm / Cancel bar
        const bar = document.createElement('div');
        bar.style.cssText = 'position:absolute;display:flex;gap:8px;pointer-events:all;';
        const btnApply = document.createElement('button');
        btnApply.textContent = '✓ Crop';
        btnApply.style.cssText = 'padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;';
        const btnCancel = document.createElement('button');
        btnCancel.textContent = '✕ Cancel';
        btnCancel.style.cssText = 'padding:6px 12px;background:#fff;color:#374151;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;';
        bar.appendChild(btnApply); bar.appendChild(btnCancel);
        overlay.appendChild(bar);

        document.body.appendChild(overlay);

        const updateUI = () => {
          const origin = cam.svgToScreen(obj.x, obj.y);
          const w = obj.width * cam.zoom, h = obj.height * cam.zoom;
          // Crop box in screen coords
          const bx = origin.x + cx * w, by = origin.y + cy * h;
          const bw = cw * w, bh = ch * h;

          cropBox.style.left = bx + 'px'; cropBox.style.top = by + 'px';
          cropBox.style.width = bw + 'px'; cropBox.style.height = bh + 'px';

          // Position handles
          const hpos = {
            nw:[bx,by], n:[bx+bw/2,by], ne:[bx+bw,by],
            w:[bx,by+bh/2], e:[bx+bw,by+bh/2],
            sw:[bx,by+bh], s:[bx+bw/2,by+bh], se:[bx+bw,by+bh]
          };
          HANDLES.forEach(dir => {
            const [hx,hy] = hpos[dir];
            const sz = dir.length===2?10:8;
            handleEls[dir].style.left = (hx - sz/2) + 'px';
            handleEls[dir].style.top  = (hy - sz/2) + 'px';
          });

          // Button bar below crop box
          bar.style.left = bx + 'px';
          bar.style.top  = (by + bh + 10) + 'px';
        };

        updateUI();

        // Drag logic
        let dragging = null;
        HANDLES.forEach(dir => {
          handleEls[dir].addEventListener('pointerdown', ev => {
            ev.stopPropagation(); ev.preventDefault();
            dragging = { dir, startX: ev.clientX, startY: ev.clientY, cx, cy, cw, ch };
            handleEls[dir].setPointerCapture(ev.pointerId);
          });
        });

        // Use window listeners so they fire correctly even with pointer capture on handle elements
        const onCropMove = ev => {
          if (!dragging) return;
          const w = obj.width * cam.zoom, h = obj.height * cam.zoom;
          const dx = (ev.clientX - dragging.startX) / w;
          const dy = (ev.clientY - dragging.startY) / h;
          let {cx:ocx, cy:ocy, cw:ocw, ch:och} = dragging;
          const dir = dragging.dir;
          let nx=ocx, ny=ocy, nw=ocw, nh=och;

          if (dir.includes('w')) { nx = Math.max(0, Math.min(ocx+ocw-0.05, ocx+dx)); nw = Math.max(0.05, ocw-(nx-ocx)); }
          if (dir.includes('e')) { nw = Math.max(0.05, Math.min(1-ocx, ocw+dx)); }
          if (dir.includes('n')) { ny = Math.max(0, Math.min(ocy+och-0.05, ocy+dy)); nh = Math.max(0.05, och-(ny-ocy)); }
          if (dir.includes('s')) { nh = Math.max(0.05, Math.min(1-ocy, och+dy)); }

          cx=nx; cy=ny; cw=nw; ch=nh;
          updateUI();
        };
        const onCropUp = () => { dragging = null; };

        window.addEventListener('pointermove', onCropMove);
        window.addEventListener('pointerup', onCropUp);
        window.addEventListener('pointercancel', onCropUp);

        // Applying a crop bakes the selected pixels into a brand new image and
        // shrinks the box to match the selection exactly. (Previously this just
        // stored the crop fractions and let the renderer stretch the selected
        // region back up to fill the old, unchanged box — which is why crops
        // never looked exact: you got a zoomed-in version of your selection,
        // not an actual crop.) Baking also resets the fractions to "full image"
        // each time, so cropping again later is always relative to what's
        // currently visible — simple and exact, with no compounding math.
        const apply = () => {
          const oldObj = JSON.parse(JSON.stringify(obj));

          const finish = (newSrc) => {
            const boxX = obj.x + cx * obj.width;
            const boxY = obj.y + cy * obj.height;
            const boxW = Math.max(1, cw * obj.width);
            const boxH = Math.max(1, ch * obj.height);

            if (newSrc) obj.src = newSrc;
            obj.x = boxX;
            obj.y = boxY;
            obj.width = boxW;
            obj.height = boxH;
            obj.cropX = 0; obj.cropY = 0; obj.cropW = 1; obj.cropH = 1;
            obj.bounds = { minX: boxX, minY: boxY, maxX: boxX + boxW, maxY: boxY + boxH, width: boxW, height: boxH };

            const newObj = JSON.parse(JSON.stringify(obj));
            const cmd = new TransformObjectsCommand(
              this.objectManager, this.storageManager, this.renderer, [oldObj], [newObj]
            );
            this.historyManager.execute(cmd);
            this.renderer.renderObject(obj);
            overlay.remove();
          };

          // No-op crop (selection = full image) — just close, nothing to bake.
          if (cx === 0 && cy === 0 && cw === 1 && ch === 1) {
            overlay.remove();
            return;
          }

          const srcImg = new Image();
          srcImg.onload = () => {
            const nw = srcImg.naturalWidth || srcImg.width;
            const nh = srcImg.naturalHeight || srcImg.height;
            const sx = Math.round(cx * nw);
            const sy = Math.round(cy * nh);
            const sw = Math.max(1, Math.round(cw * nw));
            const sh = Math.max(1, Math.round(ch * nh));

            try {
              const canvas = document.createElement('canvas');
              canvas.width = sw;
              canvas.height = sh;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, sw, sh);
              finish(canvas.toDataURL('image/png'));
            } catch (e) {
              // Tainted/cross-origin canvas — fall back to resizing the box to
              // the selection without re-encoding pixels (still exact framing,
              // just keeps the original full-image src with crop fractions).
              obj.cropX = cx; obj.cropY = cy; obj.cropW = cw; obj.cropH = ch;
              finish(null);
            }
          };
          srcImg.onerror = () => {
            obj.cropX = cx; obj.cropY = cy; obj.cropW = cw; obj.cropH = ch;
            finish(null);
          };
          srcImg.src = obj.src;
        };

        const cancel = () => {
          // Restore every field that apply() may have mutated
          Object.assign(obj, _snapshot);
          this.renderer.renderObject(obj);
          overlay.remove();
        };

        btnApply.addEventListener('click', apply);
        btnCancel.addEventListener('click', cancel);

        // Close on Escape
        const onKey = e => { if (e.key==='Escape') { cancel(); document.removeEventListener('keydown', onKey); } if (e.key==='Enter') { apply(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
      }

      openInlineEditor(screenPt, initialValue, styleOptions, onCommit) {
        let editor = document.getElementById('inline-text-editor');
        if (editor && editor.style.display !== 'none' && typeof editor._finish === 'function') {
          editor._finish();
        }

        if (!editor) {
          editor = document.createElement('textarea');
          editor.id = 'inline-text-editor';
          editor.style.position = 'fixed';
          editor.style.zIndex = '10000';
          editor.style.border = '1px dashed #2563eb';
          editor.style.outline = 'none';
          editor.style.padding = '1px 3px';
          editor.style.margin = '0';
          editor.style.borderRadius = '2px';
          editor.style.boxSizing = 'border-box';
          editor.style.resize = 'none';
          editor.style.boxShadow = '0 2px 8px -2px rgba(37,99,235,0.2)';
          editor.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          editor.style.fontWeight = '600';
          editor.style.lineHeight = '1.2';
          editor.style.caretColor = '#2563eb';
          editor.style.overflow = 'hidden';
          document.body.appendChild(editor);
        }

        const editingObjId = styleOptions.editingObjId;
        const editingObj = editingObjId ? this.objectManager.getObject(editingObjId) : null;
        if (editingObjId && editingObj && editingObj.type !== 'line' && editingObj.type !== 'arrow') {
          editor.dataset.editingObjId = editingObjId;
          const liveEl = document.getElementById('obj-' + editingObjId);
          if (liveEl) liveEl.style.visibility = 'hidden';
        } else if (editingObjId) {
          editor.dataset.editingObjId = editingObjId;
        } else {
          delete editor.dataset.editingObjId;
        }

        const zoom = this.camera ? this.camera.zoom : 1;
        const fontSize = (styleOptions.fontSize || 24) * zoom;

        const textBold = styleOptions.bold !== undefined ? styleOptions.bold : (editingObj ? !!editingObj.bold : false);
        const textItalic = styleOptions.italic !== undefined ? styleOptions.italic : (editingObj ? !!editingObj.italic : false);
        const textUnderline = styleOptions.underline !== undefined ? styleOptions.underline : (editingObj ? !!editingObj.underline : false);
        const textStrike = styleOptions.strike !== undefined ? styleOptions.strike : (editingObj ? !!editingObj.strike : false);

        editor.value = initialValue || '';
        editor.style.left = `${screenPt.x}px`;
        editor.style.top = `${screenPt.y}px`;
        editor.style.fontSize = `${fontSize}px`;
        editor.style.fontWeight = textBold ? '700' : '400';
        editor.style.fontStyle = textItalic ? 'italic' : 'normal';
        editor.style.textDecoration = (textUnderline && textStrike) ? 'underline line-through' : (textUnderline ? 'underline' : (textStrike ? 'line-through' : 'none'));
        editor.style.color = styleOptions.color || '#0f172a';
        editor.style.background = styleOptions.background || 'rgba(255, 255, 255, 0.96)';

        const updateSize = () => {
          let calculatedWidth, calculatedHeight;
          const editingObj = editor.dataset.editingObjId ? this.objectManager.getObject(editor.dataset.editingObjId) : null;
          const isSticky = editingObj ? editingObj.type === 'sticky' : false;
          const isShape = editingObj ? editingObj.type === 'shape' : false;
          const isRect = editingObj ? editingObj.type === 'rectangle' : false;
          const isEllipse = editingObj ? editingObj.type === 'ellipse' : false;
          const isNodeOrBox = isSticky || isShape || isRect || isEllipse;
          const isLineOrArrow = editingObj ? (editingObj.type === 'line' || editingObj.type === 'arrow') : false;

          if (isNodeOrBox) {
            const baseWidth = editingObj.width || styleOptions.width || 160;
            const baseHeight = editingObj.height || styleOptions.height || 55;
            let editorFs;
            if (isSticky) {
              // Keep the note fixed and continuously scale its text just like the
              // canvas and export renderers do.
              const layout = MathUtils.getStickyTextLayout(editor.value, baseWidth, baseHeight);
              editorFs = layout.fontSize * zoom;
              calculatedWidth = baseWidth * zoom;
              calculatedHeight = baseHeight * zoom;
              if (editingObj) editingObj.fontSize = layout.fontSize;
            } else {
              // Other box types (shapes/rects/ellipses) keep the original
              // auto-shrink-only font behaviour so they never expand to follow text.
              calculatedWidth = baseWidth * zoom;
              calculatedHeight = baseHeight * zoom;
              editorFs = MathUtils.calculateStickyFontSize(editor.value, baseWidth, baseHeight) * zoom;
            }
            editor.style.fontSize = `${editorFs}px`;
            editor.style.textAlign = 'center';
            editor.style.padding = `${6 * zoom}px ${10 * zoom}px`;
            editor.style.boxSizing = 'border-box';
            const radius = (editingObj.cornerRadius !== undefined ? editingObj.cornerRadius : (isEllipse ? 24 : 4)) * zoom;
            editor.style.borderRadius = `${radius}px`;
          } else if (isLineOrArrow) {
            const fs = 14 * zoom;
            editor.style.fontSize = `${fs}px`;
            editor.style.textAlign = 'center';
            const lines = editor.value.split('\n');
            const maxLineLen = Math.max(...lines.map(l => l.length), 1);
            calculatedWidth = Math.max(Math.ceil(maxLineLen * (fs * 0.65)) + 24, 80);
            calculatedHeight = Math.max(lines.length * Math.ceil(fs * 1.3) + 10, 32);
            editor.style.padding = '2px 6px';
            editor.style.lineHeight = '1.2';
            editor.style.boxSizing = 'border-box';
            editor.style.left = `${screenPt.x - calculatedWidth / 2}px`;
            editor.style.top = `${screenPt.y - calculatedHeight / 2}px`;
          } else {
            editor.style.height = 'auto';
            editor.style.width = 'auto';
            const fs = parseFloat(editor.style.fontSize) || fontSize;
            const lines = editor.value.split('\n');
            const maxLineLen = Math.max(...lines.map(l => l.length), 1);
            const isBold = editor.style.fontWeight === '700' || editor.style.fontWeight === 'bold';
            const charRatio = isBold ? 0.64 : 0.58;
            calculatedWidth = Math.max(Math.ceil(maxLineLen * (fs * charRatio)) + 8, (styleOptions.width || 30) * zoom);
            calculatedHeight = Math.max(lines.length * Math.ceil(fs * 1.2) + 4, (styleOptions.height || 24) * zoom);
            editor.style.textAlign = 'left';
            editor.style.padding = '1px 3px';
            editor.style.lineHeight = '1.2';
            editor.style.boxSizing = 'border-box';
          }
          editor.style.width = `${calculatedWidth}px`;
          editor.style.height = `${calculatedHeight}px`;

          if (editor.dataset.editingObjId) {
            const liveObj = this.objectManager.getObject(editor.dataset.editingObjId);
            if (liveObj) {
              liveObj.text = editor.value;
              if (liveObj.type === 'text') {
                const unscaledWidth = calculatedWidth / zoom;
                const unscaledHeight = calculatedHeight / zoom;
                liveObj.width = unscaledWidth;
                liveObj.height = unscaledHeight;
                liveObj.bounds = { minX: liveObj.x, minY: liveObj.y, maxX: liveObj.x + unscaledWidth, maxY: liveObj.y + unscaledHeight, width: unscaledWidth, height: unscaledHeight };
              }
              this.renderer.renderObject(liveObj);
              if (liveObj.type !== 'line' && liveObj.type !== 'arrow') {
                const liveEl = document.getElementById('obj-' + liveObj.id);
                if (liveEl) liveEl.style.visibility = 'hidden';
              }
            }
          }
        };

        updateSize();
        editor.style.display = 'block';
        editor.oninput = updateSize;

        setTimeout(() => {
          editor.focus();
          editor.select();
        }, 50);

        let finished = false;
        const finish = () => {
          if (finished || editor.style.display === 'none') return;
          finished = true;
          const val = editor.value;
          const currObjId = editor.dataset.editingObjId;
          editor.style.display = 'none';
          delete editor.dataset.editingObjId;
          delete editor._finish;
          if (currObjId) {
            const liveEl = document.getElementById('obj-' + currObjId);
            if (liveEl) liveEl.style.visibility = 'visible';
          }
          window.removeEventListener('mousedown', handleOutsideClick, true);
          if (onCommit) onCommit(val);
        };

        editor._finish = finish;

        const handleOutsideClick = (e) => {
          if (editor.style.display === 'none') return;
          const panel = document.getElementById('property-panel');
          const toolbar = document.getElementById('toolbar');
          if (editor.contains(e.target) || (panel && panel.contains(e.target)) || (toolbar && toolbar.contains(e.target))) {
            return;
          }
          finish();
        };

        setTimeout(() => {
          window.removeEventListener('mousedown', handleOutsideClick, true);
          window.addEventListener('mousedown', handleOutsideClick, true);
        }, 100);

        const onKeyDown = (e) => {
          const ctrl = e.ctrlKey || e.metaKey;
          if (ctrl && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            this.toggleToolTextStyle('bold');
          } else if (ctrl && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            this.toggleToolTextStyle('italic');
          } else if (ctrl && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            this.toggleToolTextStyle('underline');
          } else if (e.key === 'Enter' && !e.shiftKey && (!styleOptions.isMultiline || (editingObj && editingObj.isMindMapNode))) {
            e.preventDefault();
            finish();
          } else if (e.key === 'Escape') {
            const currObjId = editor.dataset.editingObjId;
            finished = true;
            editor.style.display = 'none';
            delete editor.dataset.editingObjId;
            delete editor._finish;
            if (currObjId) {
              const liveEl = document.getElementById('obj-' + currObjId);
              if (liveEl) liveEl.style.visibility = 'visible';
            }
            window.removeEventListener('mousedown', handleOutsideClick, true);
          }
        };

        editor.onkeydown = onKeyDown;
      }

      bindUI() {
        // Board Selector UI
        const boardBtn = document.getElementById('board-selector-btn');
        if (boardBtn) {
          boardBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.boardManager.toggleDropdown();
          });
        }

        const createBoardBtn = document.getElementById('btn-create-board-top');
        if (createBoardBtn) {
          createBoardBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.boardManager.createBoard();
          });
        }

        // Tool Buttons
        const toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
        toolButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            const toolName = btn.getAttribute('data-tool');
            if (toolName === 'image') return; // handled by its own dedicated listener below
            this.selectTool(toolName);
          });
        });

        // Helper to position dropdown popovers intelligently (opens downward when trigger is near top/tablet/desktop, opens upward ONLY when trigger is positioned near the bottom of screen)
        const positionDropdownPopover = (popoverEl, triggerEl, preferredWidth = 280) => {
          const rect = triggerEl.getBoundingClientRect();
          
          // Ensure popover is measurable
          const wasHidden = popoverEl.style.display === 'none' || !popoverEl.style.display;
          if (wasHidden) {
            popoverEl.style.visibility = 'hidden';
            popoverEl.style.display = 'block';
          }
          const popHeight = popoverEl.offsetHeight || 300;
          if (wasHidden) {
            popoverEl.style.display = 'none';
            popoverEl.style.visibility = '';
          }

          const spaceBelow = window.innerHeight - rect.bottom - 12;
          const spaceAbove = rect.top - 12;

          // Only open upward if trigger is located in bottom third of viewport AND there is plenty of room above
          const isTriggerNearBottom = rect.top > window.innerHeight * 0.65;
          const shouldOpenUpward = isTriggerNearBottom && (spaceBelow < 200) && (spaceAbove > 200);

          if (shouldOpenUpward) {
            popoverEl.style.top = 'auto';
            popoverEl.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
            popoverEl.style.maxHeight = `${Math.max(160, Math.min(popHeight, spaceAbove))}px`;
          } else {
            // Default & Tablet/Desktop: open downward directly beneath the toolbar button
            popoverEl.style.bottom = 'auto';
            popoverEl.style.top = `${rect.bottom + 8}px`;
            popoverEl.style.maxHeight = `${Math.max(160, Math.min(popHeight, spaceBelow))}px`;
          }

          // Horizontal bounds clamping to never overflow screen edges
          const actualWidth = Math.min(preferredWidth, window.innerWidth - 20);
          popoverEl.style.width = `${actualWidth}px`;
          popoverEl.style.maxWidth = 'calc(100vw - 20px)';
          popoverEl.style.boxSizing = 'border-box';

          const centerTrigger = rect.left + rect.width / 2;
          const minCenter = actualWidth / 2 + 10;
          const maxCenter = window.innerWidth - (actualWidth / 2 + 10);
          const clampedCenter = Math.max(minCenter, Math.min(maxCenter, centerTrigger));

          popoverEl.style.left = `${clampedCenter}px`;
          popoverEl.style.transform = 'translateX(-50%)';
        };

        // Shapes Dropdown Popover Logic
        const shapeToolBtn = document.getElementById('btn-tool-shape');
        const shapesPopover = document.getElementById('shapes-popover');

        if (shapeToolBtn && shapesPopover) {
          if (shapesPopover.parentNode !== document.body) {
            document.body.appendChild(shapesPopover);
          }

          shapeToolBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = shapesPopover.style.display === 'block';
            if (isVisible) {
              shapesPopover.style.display = 'none';
            } else {
              positionDropdownPopover(shapesPopover, shapeToolBtn, 280);
              shapesPopover.style.display = 'block';
            }
          });

          document.addEventListener('click', (e) => {
            if (shapesPopover.style.display === 'block' && !shapesPopover.contains(e.target) && !shapeToolBtn.contains(e.target)) {
              shapesPopover.style.display = 'none';
            }
          });

          window.addEventListener('resize', () => {
            if (shapesPopover.style.display === 'block') {
              positionDropdownPopover(shapesPopover, shapeToolBtn, 280);
            }
          });

          // Category Tabs Filtering Logic
          const categoryTabBtns = shapesPopover.querySelectorAll('.shapes-tab-btn');
          categoryTabBtns.forEach(tabBtn => {
            tabBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const selectedCat = tabBtn.getAttribute('data-cat');
              categoryTabBtns.forEach(b => b.classList.remove('active'));
              tabBtn.classList.add('active');

              const optionBtns = shapesPopover.querySelectorAll('.shape-option-btn');
              const categoryHeaders = shapesPopover.querySelectorAll('.shapes-category-header');

              if (selectedCat === 'all') {
                optionBtns.forEach(btn => btn.style.display = 'flex');
                categoryHeaders.forEach(hdr => hdr.style.display = 'flex');
              } else {
                optionBtns.forEach(btn => {
                  const btnCat = btn.getAttribute('data-category');
                  btn.style.display = (btnCat === selectedCat) ? 'flex' : 'none';
                });
                categoryHeaders.forEach(hdr => {
                  const hdrCat = hdr.getAttribute('data-cat-section');
                  hdr.style.display = (hdrCat === selectedCat) ? 'flex' : 'none';
                });
              }
            });
          });

          const shapeOptionBtns = shapesPopover.querySelectorAll('.shape-option-btn');
          shapeOptionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const shapeType = btn.getAttribute('data-shape');
              shapeOptionBtns.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');

              const shapeTool = this.toolManager ? this.toolManager.tools.get('shape') : null;
              if (shapeTool) {
                shapeTool.setShapeType(shapeType);
              }

              // Update active icon on main toolbar button
              const activeIcon = document.getElementById('shape-tool-active-icon');
              const optionSvg = btn.querySelector('svg');
              if (activeIcon && optionSvg) {
                activeIcon.innerHTML = optionSvg.innerHTML;
              }

              this.selectTool('shape');
              shapesPopover.style.display = 'none';
            });
          });
        }

        // Zoom Controls UI (Phase 2)
        document.getElementById('btn-zoom-in').addEventListener('click', () => {
          this.camera.setZoom(this.camera.zoom * 1.2);
        });

        document.getElementById('btn-zoom-out').addEventListener('click', () => {
          this.camera.setZoom(this.camera.zoom / 1.2);
        });

        document.getElementById('btn-zoom-level').addEventListener('click', () => {
          this.camera.reset();
        });

        document.getElementById('btn-zoom-reset').addEventListener('click', () => {
          this.camera.reset();
        });

        const canvasColorPicker = document.getElementById('canvas-color-picker');
        if (canvasColorPicker) {
          canvasColorPicker.addEventListener('input', (e) => {
            this.setCanvasColor(e.target.value);
          });
        }

        document.getElementById('btn-zoom-fit').addEventListener('click', () => {
          this.camera.zoomToFit(this.objectManager.getAllObjects());
        });

        // Undo / Redo
        document.getElementById('btn-undo').addEventListener('click', () => {
          this.historyManager.undo();
          this.updateObjectCount();
          if (this.toolManager.activeToolName === 'select') {
            this.toolManager.activeTool.updateOverlay();
          }
        });

        document.getElementById('btn-redo').addEventListener('click', () => {
          this.historyManager.redo();
          this.updateObjectCount();
          if (this.toolManager.activeToolName === 'select') {
            this.toolManager.activeTool.updateOverlay();
          }
        });

        // Clear Canvas
        document.getElementById('btn-clear').addEventListener('click', () => {
          this.clearCanvas();
        });

        // Export SVG, PNG, and JSON Board
        document.getElementById('btn-export').addEventListener('click', () => {
          this.exportSVG();
        });

        document.getElementById('btn-export-png')?.addEventListener('click', () => {
          this.exportPNG();
        });
        document.getElementById('btn-export-png-toolbar')?.addEventListener('click', () => {
          this.exportPNG();
        });

        document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
          this.exportPDF();
        });
        document.getElementById('btn-export-pdf-toolbar')?.addEventListener('click', () => {
          this.exportPDF();
        });

        document.getElementById('btn-export-json')?.addEventListener('click', () => {
          this.exportJSON();
        });

        const jsonImportBtn = document.getElementById('btn-import-json');
        const jsonFileInput = document.getElementById('json-file-input');
        if (jsonImportBtn && jsonFileInput) {
          jsonImportBtn.addEventListener('click', () => jsonFileInput.click());
          jsonFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.importJSON(file);
            jsonFileInput.value = '';
          });
        }

        // Image Tool Button & Input
        const imageBtn = document.getElementById('btn-tool-image');
        const imageInput = document.getElementById('image-file-input');
        if (imageBtn && imageInput) {
          imageBtn.addEventListener('click', () => imageInput.click());
          imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleImageUpload(file);
            imageInput.value = '';
          });
        }

        // Drag & Drop image on SVG stage
        this.svgStage.addEventListener('dragover', (e) => e.preventDefault());
        this.svgStage.addEventListener('drop', (e) => {
          e.preventDefault();
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
              const pt = this.camera.screenToSvg(e.clientX, e.clientY);
              this.handleImageUpload(file, pt);
            }
          }
        });

        // Tool Lock Toggle
        const toolLockBtn = document.getElementById('btn-tool-lock');
        if (toolLockBtn) {
          toolLockBtn.addEventListener('click', () => {
            this.isToolLocked = !this.isToolLocked;
            if (this.isToolLocked) {
              toolLockBtn.classList.add('active');
              this.showToast('Tool Lock: ON');
            } else {
              toolLockBtn.classList.remove('active');
              this.showToast('Tool Lock: OFF');
            }
          });
        }

        // Grid Snap Toggle
        const snapBtn = document.getElementById('btn-toggle-grid-snap');
        if (snapBtn) {
          snapBtn.addEventListener('click', () => {
            const nextSnap = !this.snapToGrid;
            this.setSnapToGrid(nextSnap, true);
            if (this.snapToGrid) {
              this.showToast('Grid Snap: ON (16px)');
            } else {
              this.showToast('Grid Snap: OFF');
            }
          });
        }

        // Canvas Grid Style & Graph Paper Selector Dropdown
        const btnGridStyle = document.getElementById('btn-grid-style');
        const gridStyleMenu = document.getElementById('grid-style-menu');
        if (btnGridStyle && gridStyleMenu) {
          // Move menu to <body> so zoom-panel's overflow:hidden never clips it
          document.body.appendChild(gridStyleMenu);

          const positionGridMenu = () => {
            const btnRect = btnGridStyle.getBoundingClientRect();
            const menuW = gridStyleMenu.offsetWidth;
            const menuH = gridStyleMenu.offsetHeight;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const margin = 8;
            // Prefer right of button; fall back to left edge of button if it clips
            let left = btnRect.right + margin;
            if (left + menuW > vw - margin) {
              left = Math.max(margin, btnRect.left - menuW - margin);
            }
            // Align top to button top; shift up if it clips the bottom
            let top = btnRect.top;
            if (top + menuH > vh - margin) {
              top = Math.max(margin, vh - menuH - margin);
            }
            gridStyleMenu.style.left = `${left}px`;
            gridStyleMenu.style.top = `${top}px`;
          };

          btnGridStyle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = gridStyleMenu.style.display !== 'none';
            if (isVisible) {
              gridStyleMenu.style.display = 'none';
              return;
            }
            gridStyleMenu.style.visibility = 'hidden';
            gridStyleMenu.style.display = 'block';
            positionGridMenu();
            gridStyleMenu.style.visibility = 'visible';
          });

          document.addEventListener('click', (e) => {
            if (gridStyleMenu && !gridStyleMenu.contains(e.target) && e.target !== btnGridStyle && !btnGridStyle.contains(e.target)) {
              gridStyleMenu.style.display = 'none';
            }
          });

          const optionBtns = gridStyleMenu.querySelectorAll('.grid-option-btn');
          optionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
              const style = btn.getAttribute('data-grid-style');
              if (style) {
                this.setCanvasGridStyle(style);
                gridStyleMenu.style.display = 'none';
                const names = { graph: 'Graph Paper', dots: 'Dot Grid', ruled: 'Ruled Lines', none: 'Blank Canvas' };
                this.showToast('Canvas Grid: ' + (names[style] || style));
              }
            });
          });
        }

        // Layering Buttons
        document.getElementById('btn-layer-front')?.addEventListener('click', () => {
          this.toolManager.tools.get('select')?.bringToFront();
        });
        document.getElementById('btn-layer-back')?.addEventListener('click', () => {
          this.toolManager.tools.get('select')?.sendToBack();
        });
        document.getElementById('btn-layer-forward')?.addEventListener('click', () => {
          this.toolManager.tools.get('select')?.bringForward();
        });
        document.getElementById('btn-layer-backward')?.addEventListener('click', () => {
          this.toolManager.tools.get('select')?.sendBackward();
        });

        // Alignment Buttons
        document.querySelectorAll('.align-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const alignType = btn.getAttribute('data-align');
            this.toolManager.tools.get('select')?.alignSelection(alignType);
          });
        });

        // Frames Panel Controls
        const framesPanelBtn = document.getElementById('btn-frames-panel');
        if (framesPanelBtn) {
          framesPanelBtn.addEventListener('click', () => this.toggleFramesPanel());
        }

        const closeFramesPanelBtn = document.getElementById('btn-close-frames-panel');
        if (closeFramesPanelBtn) {
          closeFramesPanelBtn.addEventListener('click', () => this.toggleFramesPanel(false));
        }

        // Draggable frames panel
        const framesPanel = document.getElementById('frames-panel');
        const framesPanelHeader = framesPanel?.querySelector('.frames-panel-header');
        if (framesPanel && framesPanelHeader) {
          framesPanelHeader.style.cursor = 'grab';
          let _dx = 0, _dy = 0, _x0 = 0, _y0 = 0;
          framesPanelHeader.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            framesPanelHeader.style.cursor = 'grabbing';
            const r = framesPanel.getBoundingClientRect();
            _x0 = e.clientX - r.left; _y0 = e.clientY - r.top;
            const onMove = (em) => {
              const nx = Math.max(0, Math.min(window.innerWidth - r.width, em.clientX - _x0));
              const ny = Math.max(0, Math.min(window.innerHeight - 40, em.clientY - _y0));
              framesPanel.style.right = 'auto';
              framesPanel.style.left = nx + 'px';
              framesPanel.style.top = ny + 'px';
            };
            const onUp = () => {
              framesPanelHeader.style.cursor = 'grab';
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          });
        }

        const addFramePanelBtn = document.getElementById('btn-add-frame-panel');
        if (addFramePanelBtn) {
          addFramePanelBtn.addEventListener('click', () => {
            const w = 600;
            const h = 400;
            let x, y;

            const existingFrames = this.objectManager.getAllObjects().filter(o => o.type === 'frame');
            if (existingFrames.length > 0) {
              let maxRight = -Infinity;
              let alignY = existingFrames[0].y || 0;
              existingFrames.forEach(f => {
                const right = (f.x || 0) + (f.width || w);
                if (right > maxRight) {
                  maxRight = right;
                  alignY = f.y || 0;
                }
              });
              x = maxRight + 120;
              y = alignY;
            } else {
              const center = this.camera ? this.camera.getCenter() : { x: 100, y: 100 };
              x = center.x - w / 2;
              y = center.y - h / 2;
            }

            const frameNum = existingFrames.length + 1;
            const autoTitle = `Frame ${frameNum}`;

            const newObj = {
              id: 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              type: 'frame',
              title: autoTitle,
              x, y, width: w, height: h,
              bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
              fill: 'rgba(59, 130, 246, 0.03)',
              stroke: '#3b82f6',
              strokeWidth: 2,
              strokeStyle: 'dashed',
              opacity: 1,
              zIndex: this.objectManager.count + 1,
              createdAt: Date.now()
            };

            const cmd = new AddObjectCommand(
              this.objectManager,
              this.storageManager,
              this.renderer,
              newObj
            );
            this.historyManager.execute(cmd);
            this.updateObjectCount();

            if (!this.frameOrder) this.frameOrder = [];
            if (!this.frameOrder.includes(newObj.id)) {
              this.frameOrder.push(newObj.id);
            }

            this.renderFramesPanel();
            this.selectTool('select');
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) selectTool.selectObject(newObj.id, false);

            this.camera.zoomToFitBoundsAnimated(newObj.bounds, 450);
            this.showToast(`Created ${autoTitle}`);
          });
        }

        // Frame Title Input
        const frameTitleInput = document.getElementById('prop-frame-title-input');
        if (frameTitleInput) {
          frameTitleInput.addEventListener('input', (e) => {
            const selectTool = this.toolManager ? this.toolManager.tools.get('select') : null;
            const selected = selectTool ? selectTool.getSelectedObjects() : [];
            if (selected.length === 1) {
              const obj = selected[0];
              if (obj.type === 'frame') {
                obj.title = e.target.value;
                this.renderer.renderObject(obj);
                this.storageManager.saveObject(obj);
                if (this.isFramesPanelOpen()) {
                  this.renderFramesPanel();
                }
              }
            }
          });
        }

        // Group & Ungroup Selection Buttons
        const groupBtn = document.getElementById('btn-group-selection');
        if (groupBtn) {
          groupBtn.addEventListener('click', () => {
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) selectTool.groupSelection();
          });
        }
        const ungroupBtn = document.getElementById('btn-ungroup-selection');
        if (ungroupBtn) {
          ungroupBtn.addEventListener('click', () => {
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) selectTool.ungroupSelection();
          });
        }

        // Lock Button
        const lockBtn = document.getElementById('btn-lock-selection');
        if (lockBtn) {
          lockBtn.addEventListener('click', () => {
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) selectTool.toggleLockSelection();
          });
        }

        // Crop Image Button

        // Embed Link Button & Modal Listeners
        const embedLinkBtn = document.getElementById('btn-embed-link');
        if (embedLinkBtn) {
          embedLinkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openEmbedLinkModal();
          });
        }

        document.getElementById('btn-close-link-modal')?.addEventListener('click', () => {
          this.closeEmbedLinkModal();
        });
        document.getElementById('btn-cancel-link-modal')?.addEventListener('click', () => {
          this.closeEmbedLinkModal();
        });
        document.getElementById('btn-save-link-modal')?.addEventListener('click', () => {
          this.saveEmbedLink();
        });
        document.getElementById('btn-remove-link')?.addEventListener('click', () => {
          this.removeEmbedLink();
        });
        document.getElementById('link-url-input')?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.saveEmbedLink();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeEmbedLinkModal();
          }
        });
        document.getElementById('link-embed-modal')?.addEventListener('click', (e) => {
          if (e.target === document.getElementById('link-embed-modal')) {
            this.closeEmbedLinkModal();
          }
        });

        // Presentation Mode Controls

        // Full-Screen Mode Controls
        const fullscreenBtn = document.getElementById('btn-fullscreen');
        if (fullscreenBtn) {
          fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        const zoomFullscreenBtn = document.getElementById('btn-zoom-fullscreen');
        if (zoomFullscreenBtn) {
          zoomFullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        // Browser Fullscreen change listeners to keep UI synchronized
        document.addEventListener('fullscreenchange', () => {
          const isNative = !!document.fullscreenElement;
          this.updateFullscreenUI(isNative || this.isCustomFullscreen);
        });
        document.addEventListener('webkitfullscreenchange', () => {
          const isNative = !!(document.fullscreenElement || document.webkitFullscreenElement);
          this.updateFullscreenUI(isNative || this.isCustomFullscreen);
        });

        // Shortcuts Modal & Buttons
        const shortcutsBtn = document.getElementById('btn-shortcuts');
        const shortcutsModal = document.getElementById('shortcuts-modal');
        const closeShortcutsBtn = document.getElementById('btn-close-shortcuts');
        if (shortcutsBtn && shortcutsModal) {
          shortcutsBtn.addEventListener('click', () => shortcutsModal.classList.add('show'));
        }
        if (closeShortcutsBtn && shortcutsModal) {
          closeShortcutsBtn.addEventListener('click', () => shortcutsModal.classList.remove('show'));
        }
        shortcutsModal?.addEventListener('click', (e) => {
          if (e.target === shortcutsModal) shortcutsModal.classList.remove('show');
        });

        {
        }

        // Delete Selection Button
        document.getElementById('btn-delete-selection').addEventListener('click', () => {
          const selectTool = this.toolManager.tools.get('select');
          if (selectTool) selectTool.deleteSelection();
        });

        // Duplicate Selection Button
        const dupBtn = document.getElementById('btn-duplicate-selection');
        if (dupBtn) {
          dupBtn.addEventListener('click', () => {
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) selectTool.duplicateSelection();
          });
        }

        // Custom Stroke Color Picker
        const colorPicker = document.getElementById('custom-color-picker');
        const colorPreview = document.getElementById('stroke-color-preview');
        const colorHex = document.getElementById('stroke-color-hex');
        if (colorPicker) {
          colorPicker.addEventListener('input', (e) => {
            const val = e.target.value;
            if (colorPreview) colorPreview.style.backgroundColor = val;
            if (colorHex) colorHex.textContent = val.toUpperCase();
            this.setToolColor(val);
          });
        }

        // Custom Fill Color Picker
        const fillPicker = document.getElementById('custom-fill-picker');
        const fillNoneBtn = document.getElementById('fill-transparent-btn');
        if (fillPicker) {
          fillPicker.addEventListener('input', (e) => {
            const val = e.target.value;
            this.setToolFill(val);
          });
        }
        if (fillNoneBtn) {
          fillNoneBtn.addEventListener('click', () => {
            this.setToolFill('none');
          });
        }

        // ── Size slider wiring ──
        const cpbSizeSlider = document.getElementById('cpb-size-slider');
        const cpbSizeVal = document.getElementById('cpb-size-val');

        if (cpbSizeSlider) {
          cpbSizeSlider.addEventListener('input', (e) => {
            const size = parseInt(e.target.value, 10);
            if (cpbSizeVal) cpbSizeVal.textContent = size;
            const propSize = document.getElementById('prop-size');
            if (propSize) { propSize.value = size; propSize.dispatchEvent(new Event('input')); }
            else this.setToolSize(size);
          });
        }

        // Pattern Fill Dropdown Popover Toggle
        const btnPatternSelect = document.getElementById('btn-pattern-select');
        const patternPopover = document.getElementById('pattern-popover');
        if (btnPatternSelect && patternPopover) {
          if (patternPopover.parentNode !== document.body) {
            document.body.appendChild(patternPopover);
          }

          btnPatternSelect.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = patternPopover.style.display !== 'none';
            if (isVisible) {
              patternPopover.style.display = 'none';
            } else {
              const rect = btnPatternSelect.getBoundingClientRect();
              patternPopover.style.position = 'fixed';
              const spaceBelow = window.innerHeight - rect.bottom - 10;
              const spaceAbove = rect.top - 10;
              const shouldOpenUpward = spaceBelow < 160 && spaceAbove > spaceBelow;

              if (shouldOpenUpward) {
                patternPopover.style.top = 'auto';
                patternPopover.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 6)}px`;
                patternPopover.style.maxHeight = `${Math.max(140, spaceAbove)}px`;
              } else {
                patternPopover.style.bottom = 'auto';
                patternPopover.style.top = `${rect.bottom + 6}px`;
                patternPopover.style.maxHeight = `${Math.max(140, spaceBelow)}px`;
              }
              const popoverWidth = Math.min(240, window.innerWidth - 20);
              let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
              if (left < 10) left = 10;
              if (left + popoverWidth > window.innerWidth - 10) {
                left = window.innerWidth - popoverWidth - 10;
              }
              patternPopover.style.width = `${popoverWidth}px`;
              patternPopover.style.left = `${left}px`;
              patternPopover.style.zIndex = '999999';
              patternPopover.style.display = 'block';
            }
          });

          document.addEventListener('click', (e) => {
            if (!e.target.closest('#pattern-dropdown-container') && !e.target.closest('#pattern-popover')) {
              patternPopover.style.display = 'none';
            }
          });

          window.addEventListener('resize', () => {
            patternPopover.style.display = 'none';
          });

          const propPanel = document.getElementById('property-panel');
          if (propPanel) {
            propPanel.addEventListener('scroll', () => {
              patternPopover.style.display = 'none';
            });
          }
        }

        // Pattern Option Buttons
        const patternOptionBtns = document.querySelectorAll('.pattern-option-btn');
        patternOptionBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pattern = btn.getAttribute('data-pattern') || 'solid';
            this.setToolPatternStyle(pattern);
            if (patternPopover) patternPopover.style.display = 'none';
          });
        });

        // Stroke Style Buttons
        const strokeStyleBtns = document.querySelectorAll('.stroke-style-btn');
        strokeStyleBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            strokeStyleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const style = btn.getAttribute('data-style');
            this.setToolStyle(style);
          });
        });

        // Arrow Type Buttons
        const arrowTypeBtns = document.querySelectorAll('.arrow-type-btn');
        arrowTypeBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            arrowTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const arrowType = btn.getAttribute('data-arrow-type');
            this.setToolArrowType(arrowType);
          });
        });

        // Text Style Buttons (Bold, Italic, Underline, Strike)
        const textStyleBtns = document.querySelectorAll('.text-style-btn');
        textStyleBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const style = btn.getAttribute('data-text-style');
            if (style) {
              this.toggleToolTextStyle(style);
            }
          });
        });

        // Text Alignment Buttons
        const textAlignBtns = document.querySelectorAll('.text-align-btn');
        textAlignBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const align = btn.getAttribute('data-text-align');
            if (align) this.setToolTextAlign(align);
          });
        });

        // Font Family Selector
        const fontFamilySelect = document.getElementById('prop-font-family-select');
        if (fontFamilySelect) {
          fontFamilySelect.addEventListener('change', (e) => {
            this.setToolFontFamily(e.target.value);
          });
        }

        // Size Slider
        const strokeSizeSlider = document.getElementById('prop-size');
        if (strokeSizeSlider) {
          strokeSizeSlider.addEventListener('input', (e) => {
            const size = parseInt(e.target.value, 10) || 4;
            this.setToolSize(size);
          });
        }

        // Opacity Slider
        const opacitySlider = document.getElementById('prop-opacity');
        opacitySlider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          this.setToolOpacity(val);
        });

        // Image Corner Radius Slider
        const imageRadiusSlider = document.getElementById('prop-image-radius');
        const imageRadiusVal = document.getElementById('prop-image-radius-val');
        if (imageRadiusSlider) {
          imageRadiusSlider.addEventListener('input', (e) => {
            const radius = parseInt(e.target.value, 10) || 0;
            if (imageRadiusVal) imageRadiusVal.textContent = `${radius}px`;
            if (this.toolManager && this.toolManager.activeToolName === 'select') {
              this.toolManager.activeTool?.updateSelectedProperties?.({ cornerRadius: radius });
            }
          });
        }

        // Crop Button
        const btnCropImage = document.getElementById('btn-crop-image');
        if (btnCropImage) {
          btnCropImage.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const selected = selectTool ? selectTool.getSelectedObjects() : [];
            const imgObj = selected.find(o => o.type === 'image');
            if (imgObj) this.startImageCrop(imgObj);
          });
        }

        // Table Property Panel Controls
        const tableRowsInput = document.getElementById('prop-table-rows');
        const tableColsInput = document.getElementById('prop-table-cols');
        const tableHeaderCb = document.getElementById('prop-table-header');
        const btnTableHeaderToggle = document.getElementById('btn-table-header-toggle');
        const btnAddRow = document.getElementById('btn-table-add-row');
        const btnDelRow = document.getElementById('btn-table-del-row');
        const btnAddCol = document.getElementById('btn-table-add-col');
        const btnDelCol = document.getElementById('btn-table-del-col');

        const updateTableProperty = (updater) => {
          const selectTool = this.toolManager?.tools.get('select');
          const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
          const selected = (selectTool && isSelectMode) ? selectTool.getSelectedObjects() : [];
          const tableObj = selected.find(o => o.type === 'table');

          if (tableObj && selectTool) {
            const oldObj = JSON.parse(JSON.stringify(tableObj));
            updater(tableObj);
            this.renderer.renderObject(tableObj);
            const newObj = JSON.parse(JSON.stringify(tableObj));
            const cmd = new TransformObjectsCommand(
              this.objectManager,
              this.storageManager,
              this.renderer,
              [oldObj],
              [newObj]
            );
            this.historyManager.execute(cmd);
            selectTool.updateOverlay();
          } else {
            const tableTool = this.toolManager?.tools.get('table');
            if (tableTool) {
              updater(tableTool);
            }
          }
        };

        if (tableRowsInput) {
          const syncRows = (e) => {
            const val = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 3));
            tableRowsInput.value = val;
            updateTableProperty((target) => {
              const prevRows = target.rows || 3;
              target.rows = val;
              if (target.cells) {
                while (target.cells.length < val) {
                  const newRow = new Array(target.cols || 3).fill('');
                  target.cells.push(newRow);
                }
                if (target.cells.length > val) {
                  target.cells.length = val;
                }
              }
              if (target.height) {
                target.height = Math.max(30, Math.round(target.height * (val / prevRows)));
                target.bounds = { minX: target.x, minY: target.y, maxX: target.x + target.width, maxY: target.y + target.height, width: target.width, height: target.height };
              }
            });
          };
          tableRowsInput.addEventListener('change', syncRows);
          tableRowsInput.addEventListener('input', syncRows);
        }

        if (tableColsInput) {
          const syncCols = (e) => {
            const val = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3));
            tableColsInput.value = val;
            updateTableProperty((target) => {
              const prevCols = target.cols || 3;
              target.cols = val;
              if (target.cells) {
                for (let r = 0; r < target.cells.length; r++) {
                  while (target.cells[r].length < val) {
                    target.cells[r].push(target.headerRow && r === 0 ? `Header ${target.cells[r].length + 1}` : '');
                  }
                  if (target.cells[r].length > val) {
                    target.cells[r].length = val;
                  }
                }
              }
              if (target.width) {
                target.width = Math.max(40, Math.round(target.width * (val / prevCols)));
                target.bounds = { minX: target.x, minY: target.y, maxX: target.x + target.width, maxY: target.y + target.height, width: target.width, height: target.height };
              }
            });
          };
          tableColsInput.addEventListener('change', syncCols);
          tableColsInput.addEventListener('input', syncCols);
        }

        if (tableHeaderCb) {
          tableHeaderCb.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            if (btnTableHeaderToggle) {
              btnTableHeaderToggle.classList.toggle('active', isChecked);
            }
            updateTableProperty((target) => {
              target.headerRow = isChecked;
            });
          });
        }

        if (btnTableHeaderToggle) {
          btnTableHeaderToggle.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
            const selected = (selectTool && isSelectMode) ? selectTool.getSelectedObjects() : [];
            const tableObj = selected.find(o => o.type === 'table');
            const target = tableObj || this.toolManager?.tools.get('table');
            const nextState = target ? !(target.headerRow !== false) : true;
            btnTableHeaderToggle.classList.toggle('active', nextState);
            if (tableHeaderCb) tableHeaderCb.checked = nextState;
            updateTableProperty((t) => {
              t.headerRow = nextState;
            });
          });
        }

        if (btnAddRow) {
          btnAddRow.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
            const selected = (selectTool && isSelectMode) ? selectTool.getSelectedObjects() : [];
            const tableObj = selected.find(o => o.type === 'table');
            const target = tableObj || this.toolManager?.tools.get('table');
            if (target) {
              const newRows = Math.min(30, (target.rows || 3) + 1);
              if (tableRowsInput) tableRowsInput.value = newRows;
              updateTableProperty((t) => {
                const prevRows = t.rows || 3;
                t.rows = newRows;
                if (t.cells) {
                  while (t.cells.length < newRows) {
                    t.cells.push(new Array(t.cols || 3).fill(''));
                  }
                }
                if (t.height) {
                  t.height = Math.round(t.height * (newRows / prevRows));
                  t.bounds = { minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height, width: t.width, height: t.height };
                }
              });
            }
          });
        }

        if (btnDelRow) {
          btnDelRow.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
            const selected = (selectTool && isSelectMode) ? selectTool.getSelectedObjects() : [];
            const tableObj = selected.find(o => o.type === 'table');
            const target = tableObj || this.toolManager?.tools.get('table');
            if (target && (target.rows || 3) > 1) {
              const newRows = Math.max(1, (target.rows || 3) - 1);
              if (tableRowsInput) tableRowsInput.value = newRows;
              updateTableProperty((t) => {
                const prevRows = t.rows || 3;
                t.rows = newRows;
                if (t.cells && t.cells.length > newRows) {
                  t.cells.length = newRows;
                }
                if (t.height) {
                  t.height = Math.max(30, Math.round(t.height * (newRows / prevRows)));
                  t.bounds = { minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height, width: t.width, height: t.height };
                }
              });
            }
          });
        }

        if (btnAddCol) {
          btnAddCol.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
            const selected = (selectTool && isSelectMode) ? selectTool.getSelectedObjects() : [];
            const tableObj = selected.find(o => o.type === 'table');
            const target = tableObj || this.toolManager?.tools.get('table');
            if (target) {
              const newCols = Math.min(20, (target.cols || 3) + 1);
              if (tableColsInput) tableColsInput.value = newCols;
              updateTableProperty((t) => {
                const prevCols = t.cols || 3;
                t.cols = newCols;
                if (t.cells) {
                  for (let r = 0; r < t.cells.length; r++) {
                    while (t.cells[r].length < newCols) {
                      t.cells[r].push(t.headerRow && r === 0 ? `Header ${t.cells[r].length + 1}` : '');
                    }
                  }
                }
                if (t.width) {
                  t.width = Math.round(t.width * (newCols / prevCols));
                  t.bounds = { minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height, width: t.width, height: t.height };
                }
              });
            }
          });
        }

        if (btnDelCol) {
          btnDelCol.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
            const selected = (selectTool && isSelectMode) ? selectTool.getSelectedObjects() : [];
            const tableObj = selected.find(o => o.type === 'table');
            const target = tableObj || this.toolManager?.tools.get('table');
            if (target && (target.cols || 3) > 1) {
              const newCols = Math.max(1, (target.cols || 3) - 1);
              if (tableColsInput) tableColsInput.value = newCols;
              updateTableProperty((t) => {
                const prevCols = t.cols || 3;
                t.cols = newCols;
                if (t.cells) {
                  for (let r = 0; r < t.cells.length; r++) {
                    if (t.cells[r].length > newCols) {
                      t.cells[r].length = newCols;
                    }
                  }
                }
                if (t.width) {
                  t.width = Math.max(40, Math.round(t.width * (newCols / prevCols)));
                  t.bounds = { minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height, width: t.width, height: t.height };
                }
              });
            }
          });
        }

        // Mind Map Quick Controls in Property Panel
        const btnMmAddChild = document.getElementById('btn-prop-mm-add-child');
        if (btnMmAddChild) {
          btnMmAddChild.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const selected = selectTool ? selectTool.getSelectedObjects() : [];
            if (selected.length === 1 && MathUtils.isConnectableShape(selected[0])) {
              this.addMindMapChild(selected[0].id);
            } else {
              this.showToast('Select a node to add a child branch');
            }
          });
        }

        const btnMmAddSibling = document.getElementById('btn-prop-mm-add-sibling');
        if (btnMmAddSibling) {
          btnMmAddSibling.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const selected = selectTool ? selectTool.getSelectedObjects() : [];
            if (selected.length === 1 && MathUtils.isConnectableShape(selected[0])) {
              this.addMindMapSibling(selected[0].id);
            } else {
              this.showToast('Select a node to add a sibling branch');
            }
          });
        }

        const btnMmRelayout = document.getElementById('btn-prop-mm-relayout');
        if (btnMmRelayout) {
          btnMmRelayout.addEventListener('click', () => {
            const selectTool = this.toolManager?.tools.get('select');
            const selected = selectTool ? selectTool.getSelectedObjects() : [];
            const rootId = (selected.length === 1 && MathUtils.isConnectableShape(selected[0])) ? selected[0].id : null;
            this.relayoutMindMap(rootId);
          });
        }
      }

      updateOverlay() {
        const selectTool = this.toolManager ? this.toolManager.tools.get('select') : null;
        if (selectTool && typeof selectTool.updateOverlay === 'function') {
          selectTool.updateOverlay();
        }
      }

      selectTool(name) {
        this.toolManager.setTool(name);

        // Update stage cursor mode class
        this.svgStage.classList.remove('select-mode', 'tool-text', 'tool-sticky', 'tool-hand');
        if (name === 'select') {
          this.svgStage.classList.add('select-mode');
        } else if (name === 'text') {
          this.svgStage.classList.add('tool-text');
        } else if (name === 'sticky') {
          this.svgStage.classList.add('tool-sticky');
        } else if (name === 'hand') {
          this.svgStage.classList.add('tool-hand');
        }

        // Update Toolbar UI
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
          const bTool = btn.getAttribute('data-tool');
          if (bTool === name) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });

        // Contextual Property Panel Visibility
        const propPanel = document.getElementById('property-panel');
        const colorGroup = null; // moved to quick-color-bar — always hidden in prop panel
        const fillGroup = document.getElementById('prop-fill-group');
        const patternGroup = document.getElementById('prop-pattern-group');
        const sizeGroup = null; // embedded in prop-quick-colors — always visible
        const strokeStyleGroup = document.getElementById('prop-style-group') || document.getElementById('prop-stroke-style-group');
        const arrowTypeGroup = document.getElementById('prop-arrow-type-group');
        const imageCornerGroup = document.getElementById('prop-image-corner-group');
        const opacityGroup = document.getElementById('prop-opacity-group');
        const tableGroup = document.getElementById('prop-table-group');
        const textStyleGroup = document.getElementById('prop-text-style-group');

        if (name === 'hand' || name === 'sticky' || name === 'laser' || name === 'eraser') {
          // Keep panel visible — color swatches live inside it
          propPanel.style.opacity = '1';
          propPanel.style.pointerEvents = 'auto';
          if (colorGroup) colorGroup.style.display = 'none';
          if (fillGroup) fillGroup.style.display = 'none';
          if (patternGroup) patternGroup.style.display = 'none';
          if (sizeGroup) sizeGroup.style.display = 'none';
          if (strokeStyleGroup) strokeStyleGroup.style.display = 'none';
          if (arrowTypeGroup) arrowTypeGroup.style.display = 'none';
          if (imageCornerGroup) imageCornerGroup.style.display = 'none';
          if (tableGroup) tableGroup.style.display = 'none';
          if (textStyleGroup) textStyleGroup.style.display = 'none';
          if (opacityGroup) opacityGroup.style.display = 'none';
        } else if (name === 'select') {
          const selected = this.toolManager.tools.get('select')?.getSelectedObjects() || [];
          if (selected.length === 0) {
            propPanel.style.opacity = '0';
            propPanel.style.pointerEvents = 'none';
          } else {
            propPanel.style.opacity = '1';
            propPanel.style.pointerEvents = 'auto';
            const hideStrokeAndSize = selected.every(o => o.type === 'sticky' || o.type === 'image');
            if (colorGroup) colorGroup.style.display = hideStrokeAndSize ? 'none' : 'flex';
            if (sizeGroup) sizeGroup.style.display = hideStrokeAndSize ? 'none' : 'flex';
            if (opacityGroup) opacityGroup.style.display = 'flex';
            if (fillGroup) fillGroup.style.display = selected.some(o => o.type === 'rectangle' || o.type === 'ellipse' || o.type === 'sticky' || o.type === 'shape' || o.type === 'table' || o.type === 'text') ? 'flex' : 'none';
            if (patternGroup) patternGroup.style.display = selected.some(o => ['rectangle', 'ellipse', 'sticky', 'shape'].includes(o.type)) ? 'flex' : 'none';
            if (strokeStyleGroup) strokeStyleGroup.style.display = selected.some(o => ['rectangle', 'ellipse', 'line', 'arrow', 'stroke', 'shape'].includes(o.type)) ? 'flex' : 'none';
            if (arrowTypeGroup) arrowTypeGroup.style.display = selected.some(o => o.type === 'arrow') ? 'flex' : 'none';
            if (imageCornerGroup) imageCornerGroup.style.display = selected.some(o => o.type === 'image') ? 'flex' : 'none';
            if (tableGroup) {
              const hasTable = selected.some(o => o.type === 'table');
              tableGroup.style.display = hasTable ? 'flex' : 'none';
              if (hasTable) {
                const tableObj = selected.find(o => o.type === 'table');
                if (tableObj) {
                  const rowsInp = document.getElementById('prop-table-rows');
                  const colsInp = document.getElementById('prop-table-cols');
                  const headerCb = document.getElementById('prop-table-header');
                  const headerBtn = document.getElementById('btn-table-header-toggle');
                  if (rowsInp && document.activeElement !== rowsInp) rowsInp.value = tableObj.rows || 3;
                  if (colsInp && document.activeElement !== colsInp) colsInp.value = tableObj.cols || 3;
                  if (headerCb) headerCb.checked = tableObj.headerRow !== false;
                  if (headerBtn) headerBtn.classList.toggle('active', tableObj.headerRow !== false);
                }
              }
            }
            // Show text style group if a text object is selected
            if (textStyleGroup) {
              const hasText = selected.some(o => o.type === 'text');
              textStyleGroup.style.display = hasText ? 'flex' : 'none';
              if (hasText) {
                const textObj = selected.find(o => o.type === 'text');
                if (textObj) this.syncTextStyleUI({ bold: !!textObj.bold, italic: !!textObj.italic, underline: !!textObj.underline, strike: !!textObj.strike, fontFamily: textObj.fontFamily, textAlign: textObj.textAlign || 'left' });
              }
            }
          }
        } else {
          propPanel.style.opacity = '1';
          propPanel.style.pointerEvents = 'auto';
          if (name === 'image') {
            if (colorGroup) colorGroup.style.display = 'none';
            if (fillGroup) fillGroup.style.display = 'none';
            if (patternGroup) patternGroup.style.display = 'none';
            if (sizeGroup) sizeGroup.style.display = 'none';
            if (strokeStyleGroup) strokeStyleGroup.style.display = 'none';
            if (arrowTypeGroup) arrowTypeGroup.style.display = 'none';
            if (imageCornerGroup) imageCornerGroup.style.display = 'flex';
            if (tableGroup) tableGroup.style.display = 'none';
            if (textStyleGroup) textStyleGroup.style.display = 'none';
            if (opacityGroup) opacityGroup.style.display = 'flex';
          } else if (name === 'table') {
            if (colorGroup) colorGroup.style.display = 'flex';
            if (fillGroup) fillGroup.style.display = 'flex';
            if (patternGroup) patternGroup.style.display = 'none';
            if (sizeGroup) sizeGroup.style.display = 'flex';
            if (strokeStyleGroup) strokeStyleGroup.style.display = 'none';
            if (arrowTypeGroup) arrowTypeGroup.style.display = 'none';
            if (imageCornerGroup) imageCornerGroup.style.display = 'none';
            if (tableGroup) {
              tableGroup.style.display = 'flex';
              const tableTool = this.toolManager?.tools.get('table');
              if (tableTool) {
                const rowsInp = document.getElementById('prop-table-rows');
                const colsInp = document.getElementById('prop-table-cols');
                const headerCb = document.getElementById('prop-table-header');
                const headerBtn = document.getElementById('btn-table-header-toggle');
                if (rowsInp && document.activeElement !== rowsInp) rowsInp.value = tableTool.rows || 3;
                if (colsInp && document.activeElement !== colsInp) colsInp.value = tableTool.cols || 3;
                if (headerCb) headerCb.checked = tableTool.headerRow !== false;
                if (headerBtn) headerBtn.classList.toggle('active', tableTool.headerRow !== false);
              }
            }
            if (textStyleGroup) textStyleGroup.style.display = 'none';
            if (opacityGroup) opacityGroup.style.display = 'flex';
          } else if (name === 'text') {
            if (colorGroup) colorGroup.style.display = 'flex';
            if (sizeGroup) sizeGroup.style.display = 'flex';
            if (opacityGroup) opacityGroup.style.display = 'flex';
            if (fillGroup) fillGroup.style.display = 'flex';
            if (patternGroup) patternGroup.style.display = 'none';
            if (strokeStyleGroup) strokeStyleGroup.style.display = 'none';
            if (arrowTypeGroup) arrowTypeGroup.style.display = 'none';
            if (imageCornerGroup) imageCornerGroup.style.display = 'none';
            if (tableGroup) tableGroup.style.display = 'none';
            if (textStyleGroup) {
              textStyleGroup.style.display = 'flex';
              const textTool = this.toolManager?.tools.get('text');
              if (textTool) this.syncTextStyleUI({ bold: !!textTool.bold, italic: !!textTool.italic, underline: !!textTool.underline, strike: !!textTool.strike, fontFamily: textTool.fontFamily, textAlign: textTool.textAlign || 'left' });
            }
          } else {
            if (colorGroup) colorGroup.style.display = 'flex';
            if (sizeGroup) sizeGroup.style.display = 'flex';
            if (opacityGroup) opacityGroup.style.display = 'flex';
            if (fillGroup) fillGroup.style.display = (name === 'rectangle' || name === 'ellipse' || name === 'shape') ? 'flex' : 'none';
            if (patternGroup) patternGroup.style.display = (name === 'rectangle' || name === 'ellipse' || name === 'shape') ? 'flex' : 'none';
            if (strokeStyleGroup) strokeStyleGroup.style.display = (name === 'pen' || name === 'draw-shape' || name === 'calligraphy' || name === 'highlighter' || name === 'rectangle' || name === 'ellipse' || name === 'line' || name === 'arrow' || name === 'shape') ? 'flex' : 'none';
            if (arrowTypeGroup) arrowTypeGroup.style.display = (name === 'arrow') ? 'flex' : 'none';
            if (imageCornerGroup) imageCornerGroup.style.display = 'none';
            if (tableGroup) tableGroup.style.display = 'none';
            if (textStyleGroup) textStyleGroup.style.display = 'none';
          }
        }
        // Synchronize stroke & fill color pickers, size slider, and style buttons with active tool or selected object
        const activeToolInstance = this.toolManager.tools.get(name);
        if (activeToolInstance) {
          let toolColor = activeToolInstance.stroke || activeToolInstance.color;
          let toolFill = activeToolInstance.fill;
          let toolPatternStyle = activeToolInstance.patternStyle || 'solid';
          let toolStyle = activeToolInstance.strokeStyle;
          let toolArrowType = activeToolInstance.arrowType || 'single';
          let toolSize = activeToolInstance.strokeWidth;

          if (name === 'select') {
            const selectTool = activeToolInstance;
            const selected = selectTool?.getSelectedObjects ? selectTool.getSelectedObjects() : [];
            if (selected.length > 0) {
              const first = selected[0];
              if (first.stroke) toolColor = first.stroke;
              if (first.fill !== undefined) toolFill = first.fill;
              if (first.patternStyle !== undefined) toolPatternStyle = first.patternStyle;
              if (first.strokeStyle) toolStyle = first.strokeStyle;
              if (first.strokeWidth !== undefined) toolSize = first.strokeWidth;
              const arrowObj = selected.find(o => o.type === 'arrow');
              if (arrowObj && arrowObj.arrowType) toolArrowType = arrowObj.arrowType;
            }
          }

          if (toolColor && toolColor.startsWith('#')) {
            const customColorPicker = document.getElementById('custom-color-picker');
            const colorPreview = document.getElementById('stroke-color-preview');
            const colorHex = document.getElementById('stroke-color-hex');
            if (customColorPicker) customColorPicker.value = toolColor;
            if (colorPreview) colorPreview.style.backgroundColor = toolColor;
            if (colorHex) colorHex.textContent = toolColor.toUpperCase();
          }

          if (toolFill !== undefined) {
            this.syncFillUI(toolFill);
          }

          this.syncPatternUI(toolPatternStyle);

          if (toolStyle) {
            const styleBtns = document.querySelectorAll('.stroke-style-btn');
            styleBtns.forEach(btn => {
              if (btn.getAttribute('data-style') === toolStyle) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            });
          }

          if (toolArrowType) {
            const arrowBtns = document.querySelectorAll('.arrow-type-btn');
            arrowBtns.forEach(btn => {
              if (btn.getAttribute('data-arrow-type') === toolArrowType) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            });
          }

          if (toolSize !== undefined) {
            this.syncSizeUI(toolSize);
          }
        }
      }

      syncSizeUI(size) {
        if (size === undefined || size === null || isNaN(size)) return;
        const sizeNum = Math.round(Number(size));
        const sizeSlider = document.getElementById('prop-size');
        const sizeVal = document.getElementById('prop-size-val');
        if (sizeSlider) sizeSlider.value = sizeNum;
        if (sizeVal) sizeVal.textContent = `${sizeNum}px`;
        // Sync color palette bar slider
        const cpbSlider = document.getElementById('cpb-size-slider');
        const cpbVal = document.getElementById('cpb-size-val');
        if (cpbSlider) cpbSlider.value = sizeNum;
        if (cpbVal) cpbVal.textContent = sizeNum;
      }

      syncFillUI(fill) {
        const fillPicker = document.getElementById('custom-fill-picker');
        const fillPreview = document.getElementById('fill-color-preview');
        const fillHex = document.getElementById('fill-color-hex');
        const fillNoneBtn = document.getElementById('fill-transparent-btn');

        if (!fill || fill === 'none' || fill === 'transparent') {
          if (fillPreview) {
            fillPreview.style.backgroundColor = 'transparent';
            fillPreview.style.backgroundImage = 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px';
          }
          if (fillHex) fillHex.textContent = 'NONE';
          if (fillNoneBtn) fillNoneBtn.classList.add('active');
        } else if (typeof fill === 'string' && fill.startsWith('#')) {
          if (fillPicker) fillPicker.value = fill;
          if (fillPreview) {
            fillPreview.style.backgroundColor = fill;
            fillPreview.style.backgroundImage = 'none';
          }
          if (fillHex) fillHex.textContent = fill.toUpperCase();
          if (fillNoneBtn) fillNoneBtn.classList.remove('active');
        }
      }

      syncPatternUI(patternStyle) {
        patternStyle = patternStyle || 'solid';
        const iconContainer = document.getElementById('pattern-active-icon');
        const activeName = document.getElementById('pattern-active-name');
        
        const optionBtn = document.querySelector(`.pattern-option-btn[data-pattern="${patternStyle}"]`);
        
        document.querySelectorAll('.pattern-option-btn').forEach(btn => {
          if (btn.getAttribute('data-pattern') === patternStyle) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });

        if (optionBtn) {
          const svgEl = optionBtn.querySelector('svg');
          const spanEl = optionBtn.querySelector('span');
          if (svgEl && iconContainer) {
            iconContainer.innerHTML = svgEl.outerHTML;
          }
          if (spanEl && activeName) {
            activeName.textContent = spanEl.textContent;
          }
        }
      }

      setToolColor(color) {
        const customColorPicker = document.getElementById('custom-color-picker');
        const colorPreview = document.getElementById('stroke-color-preview');
        const colorHex = document.getElementById('stroke-color-hex');
        if (customColorPicker && color && color.startsWith('#')) {
          customColorPicker.value = color;
        }
        if (colorPreview) colorPreview.style.backgroundColor = color;
        if (colorHex) colorHex.textContent = color.toUpperCase();

        const tools = ['pen', 'highlighter', 'calligraphy', 'rectangle', 'ellipse', 'line', 'arrow', 'shape', 'table', 'text'];
        for (const t of tools) {
          const instance = this.toolManager.tools.get(t);
          if (instance) {
            instance.stroke = color;
            instance.color = color;
          }
        }

        if (this.toolManager.activeToolName === 'select') {
          this.toolManager.activeTool.updateSelectedProperties({ stroke: color });
        }

        const inlineEditor = document.getElementById('inline-text-editor');
        if (inlineEditor && inlineEditor.style.display !== 'none') {
          inlineEditor.style.color = color;
          if (inlineEditor.dataset.editingObjId) {
            const liveObj = this.objectManager.getObject(inlineEditor.dataset.editingObjId);
            if (liveObj) {
              liveObj.stroke = color;
              this.renderer.renderObject(liveObj);
            }
          }
        }
      }

      setCanvasGridStyle(style, save = true) {
        this.currentGridStyle = style || 'none';
        const pattern = document.getElementById('grid-pattern');
        if (!pattern) return;

        const activeBoardId = this.boardManager ? this.boardManager.getActiveBoardId() : null;
        const canvasBg = (activeBoardId && this.boardManager) ? this.boardManager.getBoardCanvasColor(activeBoardId) : (SafeStorage.getItem('vector_board_canvas_color') || '#f8fafc');
        let r = 248, g = 250, b = 252;
        if (canvasBg.startsWith('#') && canvasBg.length === 7) {
          r = parseInt(canvasBg.substring(1, 3), 16);
          g = parseInt(canvasBg.substring(3, 5), 16);
          b = parseInt(canvasBg.substring(5, 7), 16);
        }
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        const strokeColor = brightness < 128 ? 'rgba(255, 255, 255, 0.35)' : '#cbd5e1';

        if (style === 'graph') {
          pattern.setAttribute('width', '32');
          pattern.setAttribute('height', '32');
          pattern.innerHTML = `<path d="M 32 0 L 0 0 0 32" fill="none" stroke="${strokeColor}" stroke-width="0.8" />`;
        } else if (style === 'dots') {
          pattern.setAttribute('width', '32');
          pattern.setAttribute('height', '32');
          pattern.innerHTML = `<circle cx="16" cy="16" r="1.2" fill="${strokeColor}" />`;
        } else if (style === 'ruled') {
          pattern.setAttribute('width', '32');
          pattern.setAttribute('height', '32');
          pattern.innerHTML = `<line x1="0" y1="32" x2="32" y2="32" stroke="${strokeColor}" stroke-width="0.8" />`;
        } else if (style === 'none') {
          pattern.setAttribute('width', '32');
          pattern.setAttribute('height', '32');
          pattern.innerHTML = '';
        }

        document.querySelectorAll('.grid-option-btn').forEach(btn => {
          if (btn.getAttribute('data-grid-style') === style) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });

        if (save && this.boardManager) {
          this.boardManager.setBoardGridStyle(activeBoardId, style);
          try {
            SafeStorage.setItem(`vector_board_grid_style_${activeBoardId}`, style);
            SafeStorage.setItem('vector_board_grid_style', style);
          } catch (e) {}
        }
      }

      setCanvasColor(color, save = true) {
        if (!color) return;
        document.documentElement.style.setProperty('--bg-canvas', color);
        document.body.style.backgroundColor = color;
        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.style.backgroundColor = color;

        const canvasColorPreview = document.getElementById('canvas-color-preview');
        if (canvasColorPreview) canvasColorPreview.style.backgroundColor = color;

        const canvasColorPicker = document.getElementById('canvas-color-picker');
        if (canvasColorPicker && canvasColorPicker.value !== color) {
          canvasColorPicker.value = color;
        }

        if (save && this.boardManager) {
          const activeBoardId = this.boardManager.getActiveBoardId();
          this.boardManager.setBoardCanvasColor(activeBoardId, color);
          try {
            SafeStorage.setItem(`vector_board_canvas_color_${activeBoardId}`, color);
            SafeStorage.setItem('vector_board_canvas_color', color);
          } catch (err) {}
        }

        const activeGrid = (this.boardManager ? this.boardManager.getBoardGridStyle() : this.currentGridStyle) || 'none';
        this.setCanvasGridStyle(activeGrid, false);
      }

      setSnapToGrid(enabled, save = true) {
        this.snapToGrid = !!enabled;
        const snapBtn = document.getElementById('btn-toggle-grid-snap');
        if (snapBtn) {
          if (this.snapToGrid) {
            snapBtn.classList.add('active');
          } else {
            snapBtn.classList.remove('active');
          }
        }
        if (save && this.boardManager) {
          const activeBoardId = this.boardManager.getActiveBoardId();
          this.boardManager.setBoardSnapToGrid(activeBoardId, this.snapToGrid);
          try {
            SafeStorage.setItem(`vector_board_snap_to_grid_${activeBoardId}`, JSON.stringify(this.snapToGrid));
          } catch (e) {}
        }
      }

      setToolFill(fill) {
        this.syncFillUI(fill);

        const tools = ['rectangle', 'ellipse', 'sticky', 'shape', 'table', 'text'];
        for (const t of tools) {
          const instance = this.toolManager.tools.get(t);
          if (instance) instance.fill = fill;
        }

        if (this.toolManager.activeToolName === 'select') {
          this.toolManager.activeTool.updateSelectedProperties({ fill });
        }

        const inlineEditor = document.getElementById('inline-text-editor');
        if (inlineEditor && inlineEditor.style.display !== 'none') {
          const bgVal = (fill && fill !== 'none') ? fill : 'transparent';
          inlineEditor.style.background = bgVal;
          if (inlineEditor.dataset.editingObjId) {
            const liveObj = this.objectManager.getObject(inlineEditor.dataset.editingObjId);
            if (liveObj && liveObj.type === 'text') {
              liveObj.fill = fill;
              this.renderer.renderObject(liveObj);
            }
          }
        }
      }

      setToolPatternStyle(patternStyle) {
        patternStyle = patternStyle || 'solid';
        this.syncPatternUI(patternStyle);

        const tools = ['rectangle', 'ellipse', 'sticky', 'shape'];
        for (const t of tools) {
          const instance = this.toolManager.tools.get(t);
          if (instance) instance.patternStyle = patternStyle;
        }

        if (this.toolManager.activeToolName === 'select') {
          this.toolManager.activeTool.updateSelectedProperties({ patternStyle });
        }
      }

      setToolStyle(style) {
        const tools = ['pen', 'rectangle', 'ellipse', 'line', 'arrow', 'shape'];
        for (const t of tools) {
          const instance = this.toolManager.tools.get(t);
          if (instance) instance.strokeStyle = style;
        }

        if (this.toolManager.activeToolName === 'select') {
          this.toolManager.activeTool.updateSelectedProperties({ strokeStyle: style });
        }
      }

      setToolArrowType(arrowType) {
        const arrowTool = this.toolManager.tools.get('arrow');
        if (arrowTool) arrowTool.arrowType = arrowType;

        if (this.toolManager.activeToolName === 'select') {
          this.toolManager.activeTool.updateSelectedProperties({ arrowType });
        }
      }

      syncTextStyleUI(styles = {}) {
        const boldBtn = document.getElementById('btn-text-bold');
        const italicBtn = document.getElementById('btn-text-italic');
        const underlineBtn = document.getElementById('btn-text-underline');
        const strikeBtn = document.getElementById('btn-text-strike');
        const fontSelect = document.getElementById('prop-font-family-select');

        if (boldBtn && styles.bold !== undefined) {
          boldBtn.classList.toggle('active', !!styles.bold);
        }
        if (italicBtn && styles.italic !== undefined) {
          italicBtn.classList.toggle('active', !!styles.italic);
        }
        if (underlineBtn && styles.underline !== undefined) {
          underlineBtn.classList.toggle('active', !!styles.underline);
        }
        if (strikeBtn && styles.strike !== undefined) {
          strikeBtn.classList.toggle('active', !!styles.strike);
        }
        if (fontSelect && styles.fontFamily !== undefined) {
          // Match by value or first part of value
          let matched = false;
          for (const opt of fontSelect.options) {
            if (opt.value === styles.fontFamily) { fontSelect.value = opt.value; matched = true; break; }
          }
          if (!matched) fontSelect.selectedIndex = 0;
        }
        if (styles.textAlign !== undefined) {
          document.querySelectorAll('.text-align-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-text-align') === styles.textAlign);
          });
        }
      }

      toggleToolTextStyle(styleType) {
        const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
        const selectTool = isSelectMode ? this.toolManager.tools.get('select') : null;
        const selected = selectTool ? selectTool.getSelectedObjects() : [];
        const textObj = selected.find(o => o.type === 'text');
        const textTool = this.toolManager?.tools?.get('text');

        let nextVal = false;
        if (textObj) {
          nextVal = !textObj[styleType];
          const updateProp = {};
          updateProp[styleType] = nextVal;
          selectTool.updateSelectedProperties(updateProp);
          this.syncTextStyleUI(updateProp);
        } else if (textTool) {
          nextVal = !textTool[styleType];
          textTool[styleType] = nextVal;
          const updateProp = {};
          updateProp[styleType] = nextVal;
          this.syncTextStyleUI(updateProp);
        }

        // Apply live to gemini embedded editor if open
        if (this._geminiEditor) {
          this._geminiEditor[styleType] = nextVal;
          const ta = this._geminiEditor.textarea;
          if (ta) {
            if (styleType === 'bold') ta.style.fontWeight = nextVal ? '700' : '400';
            else if (styleType === 'italic') ta.style.fontStyle = nextVal ? 'italic' : 'normal';
            else if (styleType === 'underline' || styleType === 'strike') {
              const isUnder = styleType === 'underline' ? nextVal : this._geminiEditor.underline;
              const isStrike = styleType === 'strike' ? nextVal : this._geminiEditor.strike;
              ta.style.textDecoration = (isUnder && isStrike) ? 'underline line-through' : (isUnder ? 'underline' : (isStrike ? 'line-through' : 'none'));
            }
          }
          if (this._geminiEditor.existingObjId) {
            const liveObj = this.objectManager.getObject(this._geminiEditor.existingObjId);
            if (liveObj && liveObj.type === 'text') { liveObj[styleType] = nextVal; this.renderer.renderObject(liveObj); }
          }
        }

        // If inline text editor is currently open, apply live style changes immediately
        const inlineEditor = document.getElementById('inline-text-editor');
        if (inlineEditor && inlineEditor.style.display !== 'none') {
          if (styleType === 'bold') {
            inlineEditor.style.fontWeight = nextVal ? '700' : '400';
          } else if (styleType === 'italic') {
            inlineEditor.style.fontStyle = nextVal ? 'italic' : 'normal';
          } else if (styleType === 'underline' || styleType === 'strike') {
            const isUnder = styleType === 'underline' ? nextVal : (inlineEditor.style.textDecoration.includes('underline'));
            const isStrike = styleType === 'strike' ? nextVal : (inlineEditor.style.textDecoration.includes('line-through'));
            inlineEditor.style.textDecoration = (isUnder && isStrike) ? 'underline line-through' : (isUnder ? 'underline' : (isStrike ? 'line-through' : 'none'));
          }
          if (typeof inlineEditor.oninput === 'function') {
            inlineEditor.oninput();
          }
          if (inlineEditor.dataset.editingObjId) {
            const liveObj = this.objectManager.getObject(inlineEditor.dataset.editingObjId);
            if (liveObj && liveObj.type === 'text') {
              liveObj[styleType] = nextVal;
              this.renderer.renderObject(liveObj);
            }
          }
        }
      }

      setToolTextAlign(align) {
        const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
        const selectTool = isSelectMode ? this.toolManager.tools.get('select') : null;
        const selected = selectTool ? selectTool.getSelectedObjects() : [];
        const textObj = selected.find(o => o.type === 'text');
        const textTool = this.toolManager?.tools?.get('text');

        if (textObj && selectTool) {
          selectTool.updateSelectedProperties({ textAlign: align });
        } else if (textTool) {
          textTool.textAlign = align;
        }

        // Sync UI
        document.querySelectorAll('.text-align-btn').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-text-align') === align);
        });

        // Update live gemini editor if open
        if (this._geminiEditor) {
          this._geminiEditor.textAlign = align;
          const ta = this._geminiEditor.textarea;
          if (ta) ta.style.textAlign = align;
          if (this._geminiEditor.existingObjId) {
            const liveObj = this.objectManager.getObject(this._geminiEditor.existingObjId);
            if (liveObj) { liveObj.textAlign = align; this.renderer.renderObject(liveObj); }
          }
        }
        const inlineEditor = document.getElementById('inline-text-editor');
        if (inlineEditor && inlineEditor.style.display !== 'none') {
          inlineEditor.style.textAlign = align;
        }
      }

      setToolFontFamily(fontFamily) {
        const isSelectMode = this.toolManager && this.toolManager.activeToolName === 'select';
        const selectTool = isSelectMode ? this.toolManager.tools.get('select') : null;
        const selected = selectTool ? selectTool.getSelectedObjects() : [];
        const textObj = selected.find(o => o.type === 'text');
        const textTool = this.toolManager?.tools?.get('text');

        if (textObj && selectTool) {
          selectTool.updateSelectedProperties({ fontFamily });
        } else if (textTool) {
          textTool.fontFamily = fontFamily;
        }

        // Update live gemini editor if open
        if (this._geminiEditor) {
          this._geminiEditor.fontFamily = fontFamily;
          const ta = this._geminiEditor.textarea;
          if (ta) ta.style.fontFamily = fontFamily;
          // Also update the editing object live
          if (this._geminiEditor.existingObjId) {
            const liveObj = this.objectManager.getObject(this._geminiEditor.existingObjId);
            if (liveObj) { liveObj.fontFamily = fontFamily; this.renderer.renderObject(liveObj); }
          }
        }
        const inlineEditor = document.getElementById('inline-text-editor');
        if (inlineEditor && inlineEditor.style.display !== 'none') {
          inlineEditor.style.fontFamily = fontFamily;
        }
      }

      setToolSize(size) {
        size = Math.max(1, Math.min(48, parseInt(size, 10) || 4));
        this.syncSizeUI(size);

        const pen = this.toolManager.tools.get('pen');
        const hl = this.toolManager.tools.get('highlighter');
        const calligraphy = this.toolManager.tools.get('calligraphy');
        const eraser = this.toolManager.tools.get('eraser');
        const rect = this.toolManager.tools.get('rectangle');
        const ellipse = this.toolManager.tools.get('ellipse');
        const line = this.toolManager.tools.get('line');
        const arrow = this.toolManager.tools.get('arrow');
        const shape = this.toolManager.tools.get('shape');
        const table = this.toolManager.tools.get('table');
        
        const fontSize = MathUtils.textFontSizeFromSize(size);
        if (pen) pen.strokeWidth = size;
        if (hl) hl.strokeWidth = size * 6;
        if (calligraphy) calligraphy.strokeWidth = size * 3;
        if (eraser) eraser.radius = 12;
        if (rect) rect.strokeWidth = size;
        if (ellipse) ellipse.strokeWidth = size;
        if (line) line.strokeWidth = size;
        if (arrow) arrow.strokeWidth = size;
        if (shape) shape.strokeWidth = size;
        if (table) table.strokeWidth = size;

        const inlineEditor = document.getElementById('inline-text-editor');
        const isTextEditing = inlineEditor && inlineEditor.style.display !== 'none';

        if (this.toolManager.activeToolName === 'select' && !isTextEditing) {
          this.toolManager.activeTool.updateSelectedProperties({ strokeWidth: size, fontSize: fontSize });
        }

        // Size slider during text editing: only affects free text objects.
        // Shapes, rects, ellipses, and sticky notes use auto-shrink font locked to
        // their fixed dimensions — the slider should not touch their geometry.
        if (inlineEditor && isTextEditing) {
          const editObjId = inlineEditor.dataset.editingObjId;
          const editObj = editObjId ? this.objectManager.getObject(editObjId) : null;
          const isBoxType = editObj && (editObj.type === 'sticky' || editObj.type === 'shape' || editObj.type === 'rectangle' || editObj.type === 'ellipse');
          if (!isBoxType) {
            // Free text / line label: let the slider drive font size and editor dimensions.
            inlineEditor.style.fontSize = fontSize + 'px';
            const lines = inlineEditor.value.split('\n');
            const maxLineLen = Math.max(...lines.map(l => l.length), 1);
            const calcWidth = Math.max(maxLineLen * (fontSize * 0.75) + 30, 120);
            const calcHeight = Math.max(inlineEditor.scrollHeight + 10, lines.length * (fontSize * 1.35) + 20, 40);
            inlineEditor.style.width = `${calcWidth}px`;
            inlineEditor.style.height = `${calcHeight}px`;
            if (editObj && editObj.type === 'text') {
              editObj.fontSize = fontSize;
              editObj.width = calcWidth / (this.camera ? this.camera.zoom : 1);
              editObj.height = calcHeight / (this.camera ? this.camera.zoom : 1);
              editObj.bounds = { minX: editObj.x, minY: editObj.y, maxX: editObj.x + editObj.width, maxY: editObj.y + editObj.height, width: editObj.width, height: editObj.height };
              this.renderer.renderObject(editObj);
            }
          }
        }
      }

      setToolOpacity(opacity) {
        const tools = ['pen', 'highlighter', 'calligraphy', 'rectangle', 'ellipse', 'line', 'arrow', 'text', 'sticky', 'shape'];
        for (const t of tools) {
          const instance = this.toolManager.tools.get(t);
          if (instance) instance.opacity = t === 'highlighter' ? opacity * 0.45 : opacity;
        }

        if (this.toolManager.activeToolName === 'select') {
          this.toolManager.activeTool?.updateSelectedProperties?.({ opacity });
        }
      }

      updateZoomUI(camState) {
        const zoomLabel = document.getElementById('btn-zoom-level');
        if (zoomLabel) {
          zoomLabel.textContent = `${camState.zoomPercent}%`;
        }
        if (this.toolManager) {
          if (this.toolManager.activeToolName === 'select') {
            this.toolManager.activeTool.updateOverlay();
          }
        }
      }

      updateSelectionUI(selectedObjects) {
        const statusText = document.getElementById('selection-status-text');
        const actionGroup = document.getElementById('prop-action-group');
        const layerGroup = document.getElementById('prop-layer-group');
        const alignGroup = document.getElementById('prop-align-group');
        const lockLabel = document.getElementById('btn-lock-label');
        const propPanel = document.getElementById('property-panel');

        if (propPanel && this.toolManager && this.toolManager.activeToolName === 'select') {
          if (!selectedObjects || selectedObjects.length === 0) {
            propPanel.style.opacity = '0';
            propPanel.style.pointerEvents = 'none';
          } else {
            propPanel.style.opacity = '1';
            propPanel.style.pointerEvents = 'auto';
          }
        }

        if (lockLabel && selectedObjects) {
          const allLocked = selectedObjects.length > 0 && selectedObjects.every(o => o.locked);
          lockLabel.textContent = allLocked ? 'Unlock' : 'Lock';
          const lockIconSvg = document.getElementById('btn-lock-icon');
          if (lockIconSvg) {
            if (allLocked) {
              lockIconSvg.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>';
            } else {
              lockIconSvg.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
            }
          }
        }

        const hideStrokeAndSize = this.toolManager && this.toolManager.activeToolName === 'select' && selectedObjects && selectedObjects.length > 0 && selectedObjects.every(o => o.type === 'sticky' || o.type === 'image');

        // colorGroup and sizeGroup moved to quick-color-bar — no display toggling needed here

        const strokeStyleGroup = document.getElementById('prop-style-group') || document.getElementById('prop-stroke-style-group');
        if (strokeStyleGroup) {
          const stylableTypes = ['rectangle', 'ellipse', 'line', 'arrow', 'stroke', 'frame', 'shape'];
          const hasStylable = selectedObjects && selectedObjects.some(o => stylableTypes.includes(o.type));
          if (this.toolManager.activeToolName === 'select') {
            strokeStyleGroup.style.display = hasStylable ? 'flex' : 'none';
            if (hasStylable) {
              const stylableObj = selectedObjects.find(o => stylableTypes.includes(o.type));
              if (stylableObj) {
                const style = stylableObj.strokeStyle || 'solid';
                document.querySelectorAll('.stroke-style-btn').forEach(btn => {
                  if (btn.getAttribute('data-style') === style) btn.classList.add('active');
                  else btn.classList.remove('active');
                });
              }
            }
          }
        }

        const fillGroup = document.getElementById('prop-fill-group');
        if (fillGroup && this.toolManager.activeToolName === 'select') {
          const fillableTypes = ['rectangle', 'ellipse', 'sticky', 'frame', 'shape', 'table', 'text'];
          const hasFillable = selectedObjects && selectedObjects.some(o => fillableTypes.includes(o.type));
          fillGroup.style.display = hasFillable ? 'flex' : 'none';
          if (hasFillable) {
            const fillObj = selectedObjects.find(o => fillableTypes.includes(o.type));
            if (fillObj) {
              const curFill = fillObj.fill || 'none';
              this.syncFillUI(curFill);
              document.querySelectorAll('.fill-swatch').forEach(s => {
                if ((s.getAttribute('data-fill') || '').toLowerCase() === curFill.toLowerCase()) s.classList.add('active');
                else s.classList.remove('active');
              });
            }
          }
        }

        const patternGroup = document.getElementById('prop-pattern-group');
        if (patternGroup) {
          const patternableTypes = ['rectangle', 'ellipse', 'sticky', 'frame', 'shape'];
          if (this.toolManager.activeToolName === 'select') {
            const hasPatternable = selectedObjects && selectedObjects.some(o => patternableTypes.includes(o.type));
            patternGroup.style.display = hasPatternable ? 'flex' : 'none';
            if (hasPatternable) {
              const patObj = selectedObjects.find(o => patternableTypes.includes(o.type));
              if (patObj) {
                this.syncPatternUI(patObj.patternStyle || 'solid');
              }
            }
          } else if (patternableTypes.includes(this.toolManager.activeToolName)) {
            patternGroup.style.display = 'flex';
            const activeToolInstance = this.toolManager.tools.get(this.toolManager.activeToolName);
            if (activeToolInstance) {
              this.syncPatternUI(activeToolInstance.patternStyle || 'solid');
            }
          } else {
            patternGroup.style.display = 'none';
          }
        }

        const arrowTypeGroup = document.getElementById('prop-arrow-type-group');
        if (arrowTypeGroup) {
          const hasArrow = selectedObjects && selectedObjects.some(o => o.type === 'arrow');
          if (this.toolManager.activeToolName === 'arrow') {
            arrowTypeGroup.style.display = 'flex';
          } else if (this.toolManager.activeToolName === 'select') {
            arrowTypeGroup.style.display = hasArrow ? 'flex' : 'none';
            if (hasArrow) {
              const arrowObj = selectedObjects.find(o => o.type === 'arrow');
              if (arrowObj) {
                const aType = arrowObj.arrowType || 'single';
                document.querySelectorAll('.arrow-type-btn').forEach(btn => {
                  if (btn.getAttribute('data-arrow-type') === aType) btn.classList.add('active');
                  else btn.classList.remove('active');
                });
              }
            }
          } else {
            arrowTypeGroup.style.display = 'none';
          }
        }

        const imageCornerGroup = document.getElementById('prop-image-corner-group');
        if (imageCornerGroup) {
          const hasImage = selectedObjects && selectedObjects.some(o => o.type === 'image');
          if (this.toolManager.activeToolName === 'image') {
            imageCornerGroup.style.display = 'flex';
          } else if (this.toolManager.activeToolName === 'select') {
            imageCornerGroup.style.display = hasImage ? 'flex' : 'none';
            if (hasImage) {
              const imgObj = selectedObjects.find(o => o.type === 'image');
              if (imgObj) {
                const curRadius = imgObj.cornerRadius !== undefined ? imgObj.cornerRadius : 0;
                const slider = document.getElementById('prop-image-radius');
                const valLabel = document.getElementById('prop-image-radius-val');
                if (slider) slider.value = curRadius;
                if (valLabel) valLabel.textContent = `${curRadius}px`;
              }
            }
          } else {
            imageCornerGroup.style.display = 'none';
          }
        }

        const frameTitleGroup = document.getElementById('prop-frame-title-group');
        if (frameTitleGroup) {
          const frameObj = selectedObjects && selectedObjects.length === 1 && selectedObjects[0].type === 'frame' ? selectedObjects[0] : null;
          if (this.toolManager.activeToolName === 'select' && frameObj) {
            frameTitleGroup.style.display = 'flex';
            const titleInput = document.getElementById('prop-frame-title-input');
            if (titleInput && document.activeElement !== titleInput) {
              titleInput.value = frameObj.title || 'Frame';
            }
          } else {
            frameTitleGroup.style.display = 'none';
          }
        }

        const linkGroup = document.getElementById('prop-link-group');
        if (linkGroup) {
          const hasSelected = selectedObjects && selectedObjects.length > 0;
          if (this.toolManager && this.toolManager.activeToolName === 'select' && hasSelected) {
            linkGroup.style.display = 'flex';
            const btnEmbedLink = document.getElementById('btn-embed-link');
            const btnLinkLabel = document.getElementById('btn-link-label');
            const hasLink = selectedObjects.some(o => o.link && o.link.trim() !== '');
            if (btnEmbedLink) {
              if (hasLink) btnEmbedLink.classList.add('active');
              else btnEmbedLink.classList.remove('active');
            }
            if (btnLinkLabel) {
              if (hasLink && selectedObjects.length === 1 && selectedObjects[0].link) {
                try {
                  const urlObj = new URL(selectedObjects[0].link.startsWith('http') ? selectedObjects[0].link : 'https://' + selectedObjects[0].link);
                  const host = urlObj.hostname.replace(/^www\./, '');
                  btnLinkLabel.textContent = host.length > 12 ? host.substring(0, 10) + '…' : host;
                } catch(e) {
                  btnLinkLabel.textContent = 'Edit Link';
                }
              } else {
                btnLinkLabel.textContent = 'Link';
              }
            }
          } else {
            linkGroup.style.display = 'none';
          }
        }

        const tableGroup = document.getElementById('prop-table-group');
        if (tableGroup) {
          const isTableTool = this.toolManager && this.toolManager.activeToolName === 'table';
          const hasTable = selectedObjects && selectedObjects.some(o => o.type === 'table');
          const isSelectWithTable = this.toolManager && this.toolManager.activeToolName === 'select' && hasTable;
          const shouldShow = isTableTool || isSelectWithTable;
          tableGroup.style.display = shouldShow ? 'flex' : 'none';
          if (shouldShow) {
            const tableObj = isSelectWithTable ? selectedObjects.find(o => o.type === 'table') : this.toolManager?.tools?.get('table');
            if (tableObj) {
              const rowsInp = document.getElementById('prop-table-rows');
              const colsInp = document.getElementById('prop-table-cols');
              const headerCb = document.getElementById('prop-table-header');
              const headerBtn = document.getElementById('btn-table-header-toggle');
              if (rowsInp && document.activeElement !== rowsInp) rowsInp.value = tableObj.rows || 3;
              if (colsInp && document.activeElement !== colsInp) colsInp.value = tableObj.cols || 3;
              if (headerCb) headerCb.checked = tableObj.headerRow !== false;
              if (headerBtn) headerBtn.classList.toggle('active', tableObj.headerRow !== false);
            }
          }
        }

        const mmGroup = document.getElementById('prop-mindmap-group');
        if (mmGroup) {
          const isMindMapTool = this.toolManager && this.toolManager.activeToolName === 'mindmap';
          const hasSingleConnectable = selectedObjects && selectedObjects.length === 1 && MathUtils.isConnectableShape(selectedObjects[0]);
          mmGroup.style.display = (isMindMapTool || hasSingleConnectable) ? 'flex' : 'none';
        }

        // textStyleGroup: show only when a text object is selected (in select mode)
        // or when the text tool is active. Must be explicitly managed here so it doesn't
        // linger after the inline text editor closes or after switching to a non-text selection.
        const textStyleGroup = document.getElementById('prop-text-style-group');
        if (textStyleGroup) {
          if (this.toolManager && this.toolManager.activeToolName === 'select') {
            const hasText = selectedObjects && selectedObjects.some(o => o.type === 'text');
            textStyleGroup.style.display = hasText ? 'flex' : 'none';
            if (hasText) {
              const textObj = selectedObjects.find(o => o.type === 'text');
              if (textObj) this.syncTextStyleUI({ bold: !!textObj.bold, italic: !!textObj.italic, underline: !!textObj.underline, strike: !!textObj.strike, fontFamily: textObj.fontFamily, textAlign: textObj.textAlign || 'left' });
            }
          }
          // For non-select tools: selectTool() already manages textStyleGroup correctly,
          // so we only act in select mode here to avoid double-toggling.
        }

        if (this.toolManager.activeToolName === 'select' && selectedObjects && selectedObjects.length > 0) {
          const strokeObj = selectedObjects.find(o => o.stroke !== undefined || o.color !== undefined);
          if (strokeObj) {
            const curStroke = strokeObj.stroke || strokeObj.color;
            if (curStroke) {
              document.querySelectorAll('.stroke-swatch').forEach(s => {
                if ((s.getAttribute('data-color') || '').toLowerCase() === curStroke.toLowerCase()) s.classList.add('active');
                else s.classList.remove('active');
              });
              const customColorPicker = document.getElementById('custom-color-picker');
              if (customColorPicker && curStroke.startsWith('#')) customColorPicker.value = curStroke;
            }
          }

          const sizeObj = selectedObjects.find(o => o.strokeWidth !== undefined || o.fontSize !== undefined);
          if (sizeObj) {
            const curSize = sizeObj.strokeWidth !== undefined ? sizeObj.strokeWidth : (sizeObj.fontSize ? MathUtils.sizeFromTextFontSize(sizeObj.fontSize) : null);
            if (curSize) {
              this.syncSizeUI(curSize);
            }
          }
        }

        const groupBtn = document.getElementById('btn-group-selection');
        const ungroupBtn = document.getElementById('btn-ungroup-selection');

        if (groupBtn) {
          const canGroup = selectedObjects && selectedObjects.length >= 2;
          groupBtn.style.display = canGroup ? 'inline-flex' : 'none';
        }

        if (ungroupBtn) {
          const canUngroup = selectedObjects && selectedObjects.some(o => (o.groupIds && o.groupIds.length > 0) || o.groupId);
          ungroupBtn.style.display = canUngroup ? 'inline-flex' : 'none';
        }

        if (selectedObjects && selectedObjects.length > 0) {
          if (statusText) {
            statusText.style.display = 'inline';
            const selectTool = this.toolManager?.tools?.get('select');
            const isSingleGroup = selectTool && selectedObjects.length >= 2 && selectedObjects.every(o => {
              const topId = selectTool.getTopGroupId(o);
              return topId && topId === selectTool.getTopGroupId(selectedObjects[0]);
            });
            if (isSingleGroup) {
              statusText.textContent = `• Group (${selectedObjects.length} items)`;
            } else {
              statusText.textContent = `• ${selectedObjects.length} selected`;
            }
          }
          if (actionGroup) actionGroup.style.display = 'flex';
          if (layerGroup) layerGroup.style.display = 'flex';
          if (alignGroup) alignGroup.style.display = selectedObjects.length >= 2 ? 'flex' : 'none';
        } else {
          if (statusText) statusText.style.display = 'none';
          if (actionGroup) actionGroup.style.display = 'none';
          if (layerGroup) layerGroup.style.display = 'none';
          if (alignGroup) alignGroup.style.display = 'none';
        }
      }

      openEmbedLinkModal() {
        const selectTool = this.toolManager ? this.toolManager.tools.get('select') : null;
        const selected = selectTool ? selectTool.getSelectedObjects() : [];
        if (!selected || selected.length === 0) {
          this.showToast('Select an object to embed a link');
          return;
        }

        this.linkTargetObjects = [...selected];

        const modal = document.getElementById('link-embed-modal');
        const input = document.getElementById('link-url-input');
        const removeBtn = document.getElementById('btn-remove-link');

        if (!modal || !input) return;

        const firstLink = selected[0].link || '';
        input.value = firstLink;

        if (removeBtn) {
          removeBtn.style.display = firstLink ? 'inline-block' : 'none';
        }

        modal.style.display = 'flex';
        modal.classList.add('show');
        setTimeout(() => {
          input.focus();
          if (input.value) input.select();
        }, 50);
      }

      closeEmbedLinkModal() {
        const modal = document.getElementById('link-embed-modal');
        if (modal) {
          modal.classList.remove('show');
          modal.style.display = 'none';
        }
        this.linkTargetObjects = null;
      }

      saveEmbedLink() {
        const selectTool = this.toolManager ? this.toolManager.tools.get('select') : null;
        let selected = (this.linkTargetObjects && this.linkTargetObjects.length > 0)
          ? this.linkTargetObjects
          : (selectTool ? selectTool.getSelectedObjects() : []);

        if (!selected || selected.length === 0) return;

        const input = document.getElementById('link-url-input');
        if (!input) return;

        let val = input.value.trim();
        if (val && !/^https?:\/\//i.test(val)) {
          val = 'https://' + val;
        }

        const oldStates = selected.map(o => ({ id: o.id, link: o.link || '' }));
        const newStates = selected.map(o => ({ id: o.id, link: val }));

        const applyLinkState = (states) => {
          for (const s of states) {
            const o = this.objectManager.getObject(s.id);
            if (o) {
              if (s.link) {
                o.link = s.link;
              } else {
                delete o.link;
              }
              this.renderer.renderObject(o);
              this.storageManager.saveObject(o);
            }
          }
          const currentSelected = selectTool ? selectTool.getSelectedObjects() : [];
          this.updateSelectionUI(currentSelected);
          if (selectTool) selectTool.updateOverlay();
        };

        if (this.historyManager) {
          this.historyManager.execute({
            execute: () => applyLinkState(newStates),
            undo: () => applyLinkState(oldStates)
          });
        } else {
          applyLinkState(newStates);
        }

        this.closeEmbedLinkModal();
        this.showToast(val ? 'Link embedded successfully' : 'Link removed');
      }

      removeEmbedLink() {
        const input = document.getElementById('link-url-input');
        if (input) input.value = '';
        this.saveEmbedLink();
      }

      updateHistoryUI(state) {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.disabled = !state.canUndo;
        if (redoBtn) redoBtn.disabled = !state.canRedo;
      }

      updateSaveStatus(status) {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (status === 'saving') {
          if (dot) dot.classList.add('saving');
          if (text) text.textContent = 'Saving...';
        } else {
          if (dot) dot.classList.remove('saving');
          if (text) text.textContent = 'Saved';
        }
      }

      updateObjectCount() {
        const count = this.objectManager.count;
        const countEl = document.getElementById('object-count-text');
        if (countEl) {
          countEl.textContent = `${count} object${count === 1 ? '' : 's'}`;
        }
      }

      showToast(msg) {
        const toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = msg;
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 2500);
        }
      }

      /**
       * Opens the inline text editor for a canvas object (node, sticky, shape, arrow, table)
       */
      editObjectText(target) {
        if (!target) return;
        const obj = typeof target === 'string' ? this.objectManager.getObject(target) : target;
        if (!obj || obj.shapeType === 'custom_fill') return;

        if (obj.type === 'table') {
          const rows = Math.max(1, obj.rows || 3);
          const cols = Math.max(1, obj.cols || 3);
          const colW = obj.width / cols;
          const rowH = obj.height / rows;
          const screenPt = this.camera.svgToScreen(obj.x, obj.y);
          const isHeader = (obj.headerRow !== false);
          const currentCellText = (obj.cells && obj.cells[0] && obj.cells[0][0] !== undefined) ? String(obj.cells[0][0]) : (isHeader ? 'Header 1' : '');

          this.openInlineEditor(screenPt, currentCellText, {
            width: Math.max(colW, 80),
            height: Math.max(rowH, 32),
            fontSize: obj.fontSize || Math.max(11, Math.min(16, Math.round(rowH * 0.42))),
            color: isHeader ? (obj.headerTextColor || '#0f172a') : (obj.textColor || '#1e293b'),
            background: isHeader ? (obj.headerFill || '#f1f5f9') : (obj.fill || '#ffffff'),
            isMultiline: true,
            editingObjId: obj.id
          }, (newVal) => {
            if (newVal !== undefined && (!obj.cells || newVal !== obj.cells[0][0])) {
              const oldObj = JSON.parse(JSON.stringify(obj));
              if (!obj.cells) obj.cells = [];
              if (!obj.cells[0]) obj.cells[0] = [];
              obj.cells[0][0] = newVal;
              this.renderer.renderObject(obj);
              const newObj = JSON.parse(JSON.stringify(obj));
              const cmd = new TransformObjectsCommand(
                this.objectManager,
                this.storageManager,
                this.renderer,
                [oldObj],
                [newObj]
              );
              this.historyManager.execute(cmd);
            }
          });
          return;
        }

        // Use gemini-style embedded editor for text objects
        if (obj.type === 'text') {
          this.openGeminiTextEditor(obj.x, obj.y, obj.id, null);
          return;
        }

        const isSticky = obj.type === 'sticky';
        const isShape = obj.type === 'shape';
        const isRect = obj.type === 'rectangle';
        const isEllipse = obj.type === 'ellipse';
        const isLineOrArrow = obj.type === 'line' || obj.type === 'arrow';

        let labelSvgX, labelSvgY;
        if (isLineOrArrow) {
          const x1 = obj.x1 || 0, y1 = obj.y1 || 0, x2 = obj.x2 || 0, y2 = obj.y2 || 0;
          const cx = obj.cx !== undefined ? obj.cx : (x1 + x2) / 2;
          const cy = obj.cy !== undefined ? obj.cy : (y1 + y2) / 2;
          if (obj.arrowType === 'elbow') {
            const em = MathUtils.getElbowMid(obj);
            labelSvgX = em.x;
            labelSvgY = em.y;
          } else {
            labelSvgX = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
            labelSvgY = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
          }
        } else {
          labelSvgX = obj.x;
          labelSvgY = obj.y;
        }

        const screenPt = this.camera.svgToScreen(labelSvgX, labelSvgY);
        const currentText = obj.text || '';

        // Pre-compute shape inset and editor font size cleanly before passing to openInlineEditor
        const editorShapeInset = isShape
          ? MathUtils.getShapeTextInset(obj.shapeType || 'rectangle', 0, 0, obj.width || 180, obj.height || 180)
          : null;
        const editorFontSize = isSticky
          ? MathUtils.getStickyTextLayout(currentText, obj.width || 180, obj.height || 180).fontSize
          : obj.fontSize || (
            (isRect || isEllipse)
              ? MathUtils.calculateStickyFontSize(currentText, obj.width || 180, obj.height || 180)
              : isShape
                ? MathUtils.calculateShapeFontSize(currentText, Math.max(editorShapeInset.width, 20), Math.max(editorShapeInset.height, 20))
                : obj.isMindMapNode
                  ? Math.max(13, Math.min(20, Math.round((obj.height || 55) * 0.28)))
                  : isLineOrArrow ? 14 : 20
          );

        this.openInlineEditor(screenPt, currentText, {
          width: (isSticky || isShape || isRect || isEllipse) ? (obj.width || 160) : (isLineOrArrow ? 100 : Math.max(obj.width || 120, 120)),
          height: (isSticky || isShape || isRect || isEllipse) ? (obj.height || 55) : (isLineOrArrow ? 30 : Math.max(obj.height || 40, 40)),
          fontSize: editorFontSize,
          color: obj.textColor || (obj.isMindMapNode ? (obj.stroke || '#0f172a') : (obj.stroke || '#0f172a')),
          background: isSticky ? (obj.fill || '#fef08a') : (isLineOrArrow ? 'rgba(255, 255, 255, 0.95)' : ((obj.fill && obj.fill !== 'none' && obj.fill !== 'transparent') ? obj.fill : 'rgba(255, 255, 255, 0.96)')),
          bold: obj.bold !== undefined ? obj.bold : (obj.isMindMapNode ? true : false),
          italic: obj.italic,
          underline: obj.underline,
          strike: obj.strike,
          isMultiline: true,
          editingObjId: obj.id
        }, (newVal) => {
          if (newVal !== undefined && newVal !== obj.text) {
            const oldObj = JSON.parse(JSON.stringify(obj));
            obj.text = newVal;
            if (obj.type === 'text') {
              const lines = newVal.split('\n');
              const maxLineLen = Math.max(...lines.map(l => l.length), 1);
              const fs = obj.fontSize || 24;
              const charRatio = obj.bold ? 0.64 : 0.58;
              const bgVal = (obj.fill && obj.fill !== 'none' && obj.fill !== 'transparent') ? obj.fill : 'transparent';
              const hasBg = bgVal !== 'transparent';
              const padW = hasBg ? 12 : 8;
              const padH = hasBg ? 6 : 4;
              obj.width = Math.max(Math.ceil(maxLineLen * (fs * charRatio)) + padW, 24);
              obj.height = Math.max(Math.ceil(lines.length * (fs * 1.2)) + padH, Math.ceil(fs * 1.2));
              obj.bounds = { minX: obj.x, minY: obj.y, maxX: obj.x + obj.width, maxY: obj.y + obj.height, width: obj.width, height: obj.height };
            } else if (obj.type === 'sticky') {
              // Note bounds stay fixed; retain the current responsive font size for
              // project data while rendering continues to calculate it from the text.
              obj.fontSize = MathUtils.getStickyTextLayout(newVal, obj.width || 160, obj.height || 55).fontSize;
            } else if (obj.type === 'shape') {
              const inset = MathUtils.getShapeTextInset(obj.shapeType || 'rectangle', obj.x, obj.y, obj.width || 160, obj.height || 55);
              obj.fontSize = MathUtils.calculateShapeFontSize(newVal, Math.max(inset.width, 20), Math.max(inset.height, 20));
            } else if (obj.type === 'rectangle' || obj.type === 'ellipse') {
              obj.fontSize = MathUtils.calculateStickyFontSize(newVal, obj.width || 160, obj.height || 55);
            }
            this.renderer.renderObject(obj);
            const newObj = JSON.parse(JSON.stringify(obj));
            const cmd = new TransformObjectsCommand(
              this.objectManager,
              this.storageManager,
              this.renderer,
              [oldObj],
              [newObj]
            );
            this.historyManager.execute(cmd);
            const selectTool = this.toolManager.tools.get('select');
            this.updateSelectionUI(selectTool ? selectTool.getSelectedObjects() : []);
          }
        });
      }

      /**
       * Adds a connected child branch node to a mind map node
       */
      addMindMapChild(parentId, preferredSide, targetY) {
        const parent = this.objectManager.getObject(parentId);
        if (!parent) return null;

        const allObjs = this.objectManager.getAllObjects();
        const baseTime = Date.now();

        // 1. Determine incoming parent connector to see if parent is already on a branch side
        const incomingConn = allObjs.find(o => (o.type === 'arrow' || o.type === 'line') && o.endBinding && o.endBinding.objectId === parent.id);

        // 2. Find existing outgoing child connectors from this parent
        const outgoingConns = allObjs.filter(o => (o.type === 'arrow' || o.type === 'line') && o.startBinding && o.startBinding.objectId === parent.id);
        const rightChildrenConns = outgoingConns.filter(c => c.startBinding.pointId === 'right');
        const leftChildrenConns = outgoingConns.filter(c => c.startBinding.pointId === 'left');

        // Determine branch side: 'right' | 'left'
        let side = preferredSide;
        if (!side) {
          if (incomingConn && incomingConn.startBinding) {
            // Parent is on a branch; propagate to the same side
            side = incomingConn.startBinding.pointId === 'left' ? 'left' : 'right';
          } else {
            // Parent is root: balance between right and left sides
            side = rightChildrenConns.length <= leftChildrenConns.length ? 'right' : 'left';
          }
        }

        const sameSideConns = side === 'right' ? rightChildrenConns : leftChildrenConns;
        const sameSideChildObjs = sameSideConns
          .map(c => this.objectManager.getObject(c.endBinding?.objectId))
          .filter(Boolean);

        const childW = 160;
        const childH = 55;
        const hGap = 90; // horizontal gap
        const vGap = 20; // vertical gap

        const childX = side === 'right' ? (parent.x + (parent.width || 160) + hGap) : (parent.x - childW - hGap);
        let childY;

        if (targetY !== undefined) {
          childY = targetY;
        } else if (sameSideChildObjs.length === 0) {
          childY = parent.y + ((parent.height || 60) - childH) / 2;
        } else {
          let maxY = -Infinity;
          for (const c of sameSideChildObjs) {
            const bottom = c.y + (c.height || childH);
            if (bottom > maxY) maxY = bottom;
          }
          childY = maxY + vGap;
        }

        // Color palettes for mindmap hierarchy
        const palettes = [
          { fill: '#eff6ff', stroke: '#2563eb' }, // Blue
          { fill: '#ecfdf5', stroke: '#059669' }, // Emerald
          { fill: '#f5f3ff', stroke: '#7c3aed' }, // Purple
          { fill: '#fffbeb', stroke: '#d97706' }, // Amber
          { fill: '#fff1f2', stroke: '#e11d48' }, // Rose
          { fill: '#ecfeff', stroke: '#0891b2' }, // Cyan
          { fill: '#fdf4ff', stroke: '#c026d3' }  // Fuchsia
        ];

        let childFill = '#eff6ff';
        let childStroke = parent.stroke || '#2563eb';
        if (parent.stroke) {
          const matched = palettes.find(p => p.stroke.toLowerCase() === parent.stroke.toLowerCase());
          if (matched) {
            childFill = matched.fill;
            childStroke = matched.stroke;
          } else {
            childFill = parent.fill && parent.fill !== 'none' ? parent.fill : '#eff6ff';
            childStroke = parent.stroke;
          }
        } else {
          const colorIdx = outgoingConns.length % palettes.length;
          childFill = palettes[colorIdx].fill;
          childStroke = palettes[colorIdx].stroke;
        }

        const childNode = {
          id: `mm_node_${baseTime}_${Math.random().toString(36).substring(2, 7)}`,
          type: parent.type === 'sticky' ? 'sticky' : 'rectangle',
          x: childX,
          y: childY,
          width: childW,
          height: childH,
          text: 'Subtopic',
          fill: childFill,
          stroke: childStroke,
          strokeWidth: 2,
          cornerStyle: 'rounded',
          cornerRadius: 10,
          opacity: 1,
          isMindMapNode: true,
          bounds: { minX: childX, minY: childY, maxX: childX + childW, maxY: childY + childH, width: childW, height: childH },
          zIndex: (parent.zIndex || 2) + 1
        };

        const parentPort = side === 'right' ? 'right' : 'left';
        const childPort = side === 'right' ? 'left' : 'right';

        const p1 = MathUtils.getObjectConnectionPoint(parent, parentPort);
        const p2 = MathUtils.getObjectConnectionPoint(childNode, childPort);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const connector = {
          id: `mm_arr_${baseTime}_${Math.random().toString(36).substring(2, 7)}`,
          type: 'arrow',
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          cx: midX,
          cy: midY,
          startBinding: { objectId: parent.id, pointId: parentPort },
          endBinding: { objectId: childNode.id, pointId: childPort },
          stroke: childStroke,
          strokeWidth: 2,
          arrowType: 'single',
          opacity: 0.9,
          isMindMapConnector: true,
          bounds: MathUtils.getObjectBounds({ type: 'arrow', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, cx: midX, cy: midY, strokeWidth: 2 }),
          zIndex: 1
        };

        const cmd = new AddObjectsCommand(this.objectManager, this.storageManager, this.renderer, [childNode, connector]);
        this.historyManager.execute(cmd);
        this.updateObjectCount();

        // Switch to select tool, select the new child node and open text editor immediately
        this.selectTool('select');
        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) {
          selectTool.selectObject(childNode.id);
        }
        this.editObjectText(childNode);
        this.showToast('Added Mind Map child node');
        return childNode;
      }

      /**
       * Adds a connected sibling branch node sharing the same parent (above or below)
       */
      addMindMapSibling(nodeId, direction = 'below') {
        const node = this.objectManager.getObject(nodeId);
        if (!node) return null;

        const allObjs = this.objectManager.getAllObjects();
        const incomingConn = allObjs.find(o => (o.type === 'arrow' || o.type === 'line') && o.endBinding && o.endBinding.objectId === node.id);

        const childH = 55;
        const vGap = 20;

        if (incomingConn && incomingConn.startBinding && incomingConn.startBinding.objectId) {
          const parentId = incomingConn.startBinding.objectId;
          const side = incomingConn.startBinding.pointId === 'left' ? 'left' : 'right';

          let targetY = undefined;
          if (direction === 'above') {
            const outgoingConns = allObjs.filter(o => (o.type === 'arrow' || o.type === 'line') && o.startBinding && o.startBinding.objectId === parentId);
            const sideConns = outgoingConns.filter(c => c.startBinding.pointId === (side === 'right' ? 'right' : 'left'));
            const sideChildObjs = sideConns.map(c => this.objectManager.getObject(c.endBinding?.objectId)).filter(Boolean);

            let minY = node.y;
            for (const c of sideChildObjs) {
              if (c.y < minY) minY = c.y;
            }
            targetY = minY - childH - vGap;
          }

          const newNode = this.addMindMapChild(parentId, side, targetY);
          this.showToast(direction === 'above' ? 'Added Mind Map sibling node above' : 'Added Mind Map sibling node below');
          return newNode;
        } else {
          // Root node: add child
          let targetY = undefined;
          if (direction === 'above') {
            targetY = node.y - childH - vGap;
          }
          const newNode = this.addMindMapChild(node.id, undefined, targetY);
          this.showToast(direction === 'above' ? 'Added Mind Map branch above' : 'Added Mind Map branch below');
          return newNode;
        }
      }

      /**
       * Cleanly reorganizes mind map branch positions and spacing
       */
      relayoutMindMap(rootId) {
        const allObjs = this.objectManager.getAllObjects();
        const connectableObjs = allObjs.filter(o => MathUtils.isConnectableShape(o));
        if (connectableObjs.length === 0) {
          this.showToast('No mind map nodes found to organize');
          return;
        }

        let roots = [];
        if (rootId) {
          const specified = this.objectManager.getObject(rootId);
          if (specified) roots = [specified];
        }

        if (roots.length === 0) {
          const incomingTargetIds = new Set();
          allObjs.forEach(o => {
            if ((o.type === 'arrow' || o.type === 'line') && o.endBinding && o.endBinding.objectId) {
              incomingTargetIds.add(o.endBinding.objectId);
            }
          });

          roots = connectableObjs.filter(o => !incomingTargetIds.has(o.id));
          if (roots.length === 0) {
            roots = [connectableObjs[0]];
          }
        }

        const oldObjs = [];
        const newObjs = [];

        roots.forEach(root => {
          const outgoingConns = allObjs.filter(o => (o.type === 'arrow' || o.type === 'line') && o.startBinding && o.startBinding.objectId === root.id);

          const getSubtree = (nodeId) => {
            const childConns = allObjs.filter(o => (o.type === 'arrow' || o.type === 'line') && o.startBinding && o.startBinding.objectId === nodeId);
            const children = [];
            for (const conn of childConns) {
              const childObj = this.objectManager.getObject(conn.endBinding?.objectId);
              if (childObj) {
                children.push({
                  node: childObj,
                  children: getSubtree(childObj.id)
                });
              }
            }
            return children;
          };

          const rightBranches = outgoingConns
            .filter(c => c.startBinding.pointId === 'right')
            .map(c => this.objectManager.getObject(c.endBinding?.objectId))
            .filter(Boolean)
            .map(node => ({ node, children: getSubtree(node.id) }));

          const leftBranches = outgoingConns
            .filter(c => c.startBinding.pointId === 'left')
            .map(c => this.objectManager.getObject(c.endBinding?.objectId))
            .filter(Boolean)
            .map(node => ({ node, children: getSubtree(node.id) }));

          const hGap = 90;
          const vGap = 20;

          const calcHeight = (item) => {
            if (!item.children || item.children.length === 0) {
              return (item.node.height || 55) + vGap;
            }
            let total = 0;
            for (const child of item.children) {
              total += calcHeight(child);
            }
            return Math.max(total, (item.node.height || 55) + vGap);
          };

          const layoutSide = (branches, side) => {
            const totalH = branches.reduce((sum, b) => sum + calcHeight(b), 0);
            let curY = root.y + (root.height || 60) / 2 - totalH / 2;

            const placeItem = (item, level, yTop) => {
              const subH = calcHeight(item);
              const nodeW = item.node.width || 160;
              const nodeH = item.node.height || 55;
              const nodeX = side === 'right'
                ? root.x + (root.width || 180) + hGap + (level - 1) * (nodeW + hGap)
                : root.x - nodeW - hGap - (level - 1) * (nodeW + hGap);
              const nodeY = yTop + (subH - nodeH) / 2;

              oldObjs.push(JSON.parse(JSON.stringify(item.node)));
              item.node.x = nodeX;
              item.node.y = nodeY;
              item.node.bounds = { minX: nodeX, minY: nodeY, maxX: nodeX + nodeW, maxY: nodeY + nodeH, width: nodeW, height: nodeH };
              newObjs.push(JSON.parse(JSON.stringify(item.node)));

              let childYTop = yTop;
              for (const child of item.children) {
                const ch = calcHeight(child);
                placeItem(child, level + 1, childYTop);
                childYTop += ch;
              }
            };

            for (const branch of branches) {
              const bh = calcHeight(branch);
              placeItem(branch, 1, curY);
              curY += bh;
            }
          };

          layoutSide(rightBranches, 'right');
          layoutSide(leftBranches, 'left');
        });

        if (oldObjs.length > 0) {
          for (const no of newObjs) {
            this.renderer.renderObject(no);
          }
          this.objectManager.updateBoundConnectors(this);
          const cmd = new TransformObjectsCommand(this.objectManager, this.storageManager, this.renderer, oldObjs, newObjs);
          this.historyManager.execute(cmd);
          const selectTool = this.toolManager.tools.get('select');
          if (selectTool) selectTool.updateOverlay();
          this.showToast('Mind Map layout organized!');
        } else {
          this.showToast('Mind map is already organized');
        }
      }

      handleImageUpload(file, dropPt) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target.result;
          const img = new Image();
          img.onload = () => {
            let w = img.width || 300;
            let h = img.height || 200;
            const maxDim = 320;
            if (w > maxDim || h > maxDim) {
              const ratio = Math.min(maxDim / w, maxDim / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }

            let pt = dropPt;
            if (!pt) {
              const rect = this.svgStage.getBoundingClientRect();
              pt = this.camera.screenToSvg(rect.left + rect.width / 2 - w / 2, rect.top + rect.height / 2 - h / 2);
            }

            const radiusSlider = document.getElementById('prop-image-radius');
            const defaultRadius = radiusSlider ? (parseInt(radiusSlider.value, 10) || 0) : 0;

            const newObj = {
              id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              type: 'image',
              src,
              x: pt.x,
              y: pt.y,
              width: w,
              height: h,
              bounds: { minX: pt.x, minY: pt.y, maxX: pt.x + w, maxY: pt.y + h, width: w, height: h },
              cornerRadius: defaultRadius,
              opacity: 1,
              zIndex: this.objectManager.count + 1,
              createdAt: Date.now()
            };

            const cmd = new AddObjectCommand(
              this.objectManager,
              this.storageManager,
              this.renderer,
              newObj
            );
            this.historyManager.execute(cmd);
            this.updateObjectCount();
            this.selectTool('select');
            const selectTool = this.toolManager.tools.get('select');
            if (selectTool) {
              selectTool.selectObject(newObj.id);
            }
            this.showToast('Image uploaded!');
          };
          img.src = src;
        };
        reader.readAsDataURL(file);
      }

      clearCanvas() {
        if (this.objectManager.count === 0) {
          this.showToast('Canvas is already empty');
          return;
        }

        const inlineEditor = document.getElementById('inline-text-editor');
        if (inlineEditor && typeof inlineEditor._finish === 'function') {
          inlineEditor._finish();
        } else if (inlineEditor) {
          inlineEditor.style.display = 'none';
          delete inlineEditor.dataset.editingObjId;
        }

        const cmd = new ClearCanvasCommand(
          this.objectManager,
          this.storageManager,
          this.renderer
        );
        this.historyManager.execute(cmd);

        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) {
          selectTool.clearSelection();
        }

        this.renderer.clearPreview();
        this.updateObjectCount();
        this.updateSelectionUI([]);
        this.showToast('Canvas cleared (Ctrl+Z to undo)');
      }

      insertTemplate(templateName) {
        const rect = this.svgStage.getBoundingClientRect();
        const center = this.camera.screenToSvg(rect.width / 2, rect.height / 2);
        let objects = [];
        const baseTime = Date.now();

        if (templateName === 'mindmap') {
          const cx = center.x;
          const cy = center.y;
          const centerId = `tpl_mm_center_${baseTime}`;

          // Central Root Node
          objects.push({
            id: centerId,
            type: 'sticky',
            x: cx - 120,
            y: cy - 45,
            width: 240,
            height: 90,
            fill: '#dbeafe',
            stroke: '#2563eb',
            text: '🚀 Core Concept / Central Theme',
            bounds: { minX: cx - 120, minY: cy - 45, maxX: cx + 120, maxY: cy + 45, width: 240, height: 90 },
            opacity: 1,
            zIndex: 3
          });

          // Multi-level Branch Hierarchy
          const branches = [
            {
              id: `tpl_mm_b1_${baseTime}`,
              title: '1. Research & Discovery',
              color: '#fef08a',
              stroke: '#ca8a04',
              x: cx - 440,
              y: cy - 200,
              w: 200,
              h: 75,
              centerPort: 'left',
              branchPort: 'right',
              children: [
                {
                  id: `tpl_mm_c1a_${baseTime}`,
                  title: '• User Interviews\n  (Pain points & goals)',
                  color: '#fef9c3',
                  stroke: '#eab308',
                  x: cx - 720,
                  y: cy - 260,
                  w: 180,
                  h: 65,
                  parentPort: 'left',
                  childPort: 'right'
                },
                {
                  id: `tpl_mm_c1b_${baseTime}`,
                  title: '• Market Analysis\n  (Trends & benchmark)',
                  color: '#fef9c3',
                  stroke: '#eab308',
                  x: cx - 720,
                  y: cy - 160,
                  w: 180,
                  h: 65,
                  parentPort: 'left',
                  childPort: 'right'
                }
              ]
            },
            {
              id: `tpl_mm_b2_${baseTime}`,
              title: '2. Product & UX',
              color: '#bbf7d0',
              stroke: '#16a34a',
              x: cx + 240,
              y: cy - 200,
              w: 200,
              h: 75,
              centerPort: 'right',
              branchPort: 'left',
              children: [
                {
                  id: `tpl_mm_c2a_${baseTime}`,
                  title: '• Visual Canvas\n  (Wireframes & flows)',
                  color: '#dcfce7',
                  stroke: '#22c55e',
                  x: cx + 520,
                  y: cy - 260,
                  w: 180,
                  h: 65,
                  parentPort: 'right',
                  childPort: 'left'
                },
                {
                  id: `tpl_mm_c2b_${baseTime}`,
                  title: '• Design System\n  (Components & tokens)',
                  color: '#dcfce7',
                  stroke: '#22c55e',
                  x: cx + 520,
                  y: cy - 160,
                  w: 180,
                  h: 65,
                  parentPort: 'right',
                  childPort: 'left'
                }
              ]
            },
            {
              id: `tpl_mm_b3_${baseTime}`,
              title: '3. Growth & Launch',
              color: '#fbcfe8',
              stroke: '#db2777',
              x: cx - 440,
              y: cy + 125,
              w: 200,
              h: 75,
              centerPort: 'left',
              branchPort: 'right',
              children: [
                {
                  id: `tpl_mm_c3a_${baseTime}`,
                  title: '• Landing Page\n  & Demo Showcase',
                  color: '#fce7f3',
                  stroke: '#f472b6',
                  x: cx - 720,
                  y: cy + 85,
                  w: 180,
                  h: 65,
                  parentPort: 'left',
                  childPort: 'right'
                },
                {
                  id: `tpl_mm_c3b_${baseTime}`,
                  title: '• Community Outreach\n  & Beta Program',
                  color: '#fce7f3',
                  stroke: '#f472b6',
                  x: cx - 720,
                  y: cy + 185,
                  w: 180,
                  h: 65,
                  parentPort: 'left',
                  childPort: 'right'
                }
              ]
            },
            {
              id: `tpl_mm_b4_${baseTime}`,
              title: '4. Tech Architecture',
              color: '#e9d5ff',
              stroke: '#9333ea',
              x: cx + 240,
              y: cy + 125,
              w: 200,
              h: 75,
              centerPort: 'right',
              branchPort: 'left',
              children: [
                {
                  id: `tpl_mm_c4a_${baseTime}`,
                  title: '• Data Persistence\n  & Offline Sync',
                  color: '#f3e8ff',
                  stroke: '#c084fc',
                  x: cx + 520,
                  y: cy + 85,
                  w: 180,
                  h: 65,
                  parentPort: 'right',
                  childPort: 'left'
                },
                {
                  id: `tpl_mm_c4b_${baseTime}`,
                  title: '• Performance\n  & Export Engines',
                  color: '#f3e8ff',
                  stroke: '#c084fc',
                  x: cx + 520,
                  y: cy + 185,
                  w: 180,
                  h: 65,
                  parentPort: 'right',
                  childPort: 'left'
                }
              ]
            }
          ];

          let arrowIdx = 0;

          branches.forEach(branch => {
            // Main branch node (Level 1)
            const branchObj = {
              id: branch.id,
              type: 'sticky',
              x: branch.x,
              y: branch.y,
              width: branch.w,
              height: branch.h,
              fill: branch.color,
              stroke: branch.stroke,
              text: branch.title,
              bounds: { minX: branch.x, minY: branch.y, maxX: branch.x + branch.w, maxY: branch.y + branch.h, width: branch.w, height: branch.h },
              opacity: 1,
              zIndex: 3
            };
            objects.push(branchObj);

            // Dynamic Arrow from Center to Main Branch
            const centerPt = branch.centerPort === 'left' ? { x: cx - 120, y: cy } : { x: cx + 120, y: cy };
            const branchPt = branch.branchPort === 'right' ? { x: branch.x + branch.w, y: branch.y + branch.h / 2 } : { x: branch.x, y: branch.y + branch.h / 2 };
            const midX = (centerPt.x + branchPt.x) / 2;
            const midY = (centerPt.y + branchPt.y) / 2;

            objects.push({
              id: `tpl_mm_arr_main_${baseTime}_${arrowIdx++}`,
              type: 'arrow',
              x1: centerPt.x,
              y1: centerPt.y,
              x2: branchPt.x,
              y2: branchPt.y,
              cx: midX,
              cy: midY,
              startBinding: { objectId: centerId, pointId: branch.centerPort },
              endBinding: { objectId: branch.id, pointId: branch.branchPort },
              stroke: branch.stroke,
              strokeWidth: 2.5,
              arrowType: 'single',
              bounds: MathUtils.getObjectBounds({ type: 'arrow', x1: centerPt.x, y1: centerPt.y, x2: branchPt.x, y2: branchPt.y, cx: midX, cy: midY, strokeWidth: 2.5 }),
              opacity: 0.9,
              zIndex: 1
            });

            // Sub-branches / child nodes (Level 2)
            branch.children.forEach(child => {
              const childObj = {
                id: child.id,
                type: 'sticky',
                x: child.x,
                y: child.y,
                width: child.w,
                height: child.h,
                fill: child.color,
                stroke: child.stroke,
                text: child.title,
                bounds: { minX: child.x, minY: child.y, maxX: child.x + child.w, maxY: child.y + child.h, width: child.w, height: child.h },
                opacity: 1,
                zIndex: 3
              };
              objects.push(childObj);

              const parentPt = child.parentPort === 'left' ? { x: branch.x, y: branch.y + branch.h / 2 } : { x: branch.x + branch.w, y: branch.y + branch.h / 2 };
              const cPt = child.childPort === 'right' ? { x: child.x + child.w, y: child.y + child.h / 2 } : { x: child.x, y: child.y + child.h / 2 };
              const cMidX = (parentPt.x + cPt.x) / 2;
              const cMidY = (parentPt.y + cPt.y) / 2;

              objects.push({
                id: `tpl_mm_arr_sub_${baseTime}_${arrowIdx++}`,
                type: 'arrow',
                x1: parentPt.x,
                y1: parentPt.y,
                x2: cPt.x,
                y2: cPt.y,
                cx: cMidX,
                cy: cMidY,
                startBinding: { objectId: branch.id, pointId: child.parentPort },
                endBinding: { objectId: child.id, pointId: child.childPort },
                stroke: branch.stroke,
                strokeWidth: 2,
                arrowType: 'single',
                bounds: MathUtils.getObjectBounds({ type: 'arrow', x1: parentPt.x, y1: parentPt.y, x2: cPt.x, y2: cPt.y, cx: cMidX, cy: cMidY, strokeWidth: 2 }),
                opacity: 0.85,
                zIndex: 1
              });
            });
          });
        }

        if (objects.length > 0) {
          const cmd = new AddObjectsCommand(
            this.objectManager,
            this.storageManager,
            this.renderer,
            objects
          );
          this.historyManager.execute(cmd);
          this.updateObjectCount();
          this.showToast(`Inserted ${templateName.toUpperCase()} template!`);
          this.camera.zoomToFit(this.objectManager.getAllObjects());
        }
      }

      /**
       * Expands a tight content bounding box out to a fixed aspect ratio
       * (default 16:9, the standard wallpaper/display ratio), centering
       * the original content inside the new canvas. Any extra space is
       * just background — nothing is cropped or scaled.
       */
      getWallpaperBounds(bounds, padding = 20, ratio = 16 / 9) {
        const contentW = Math.max(bounds.width + padding * 2, 20);
        const contentH = Math.max(bounds.height + padding * 2, 20);
        const contentCenterX = bounds.minX + bounds.width / 2;
        const contentCenterY = bounds.minY + bounds.height / 2;

        let canvasW = contentW;
        let canvasH = contentH;

        if (contentW / contentH > ratio) {
          // content is wider than target ratio -> grow height
          canvasH = contentW / ratio;
        } else {
          // content is taller than (or equal to) target ratio -> grow width
          canvasW = contentH * ratio;
        }

        return {
          minX: contentCenterX - canvasW / 2,
          minY: contentCenterY - canvasH / 2,
          width: canvasW,
          height: canvasH
        };
      }

      generateExportSVG(objects, options = {}) {
        if (!objects || objects.length === 0) return '';

        const bounds = options.customBounds || MathUtils.getObjectsBounds(objects);
        const padding = options.padding !== undefined ? options.padding : 20;
        const minX = bounds.minX - padding;
        const minY = bounds.minY - padding;
        const width = Math.max(bounds.width + padding * 2, 10);
        const height = Math.max(bounds.height + padding * 2, 10);

        const activeBoardId = this.boardManager ? this.boardManager.getActiveBoardId() : null;
        const defaultCanvasBg = (activeBoardId && this.boardManager) ? this.boardManager.getBoardCanvasColor(activeBoardId) : (SafeStorage.getItem('vector_board_canvas_color') || '#ffffff');
        const canvasBg = options.backgroundColor !== undefined ? options.backgroundColor : (options.transparentBg ? 'transparent' : defaultCanvasBg);
        const bgAttr = '';  // background handled by <rect> below

        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}">\n`;
        // Background rect — CSS "background:" on the SVG root is ignored when rendered to <canvas>
        if (canvasBg && canvasBg !== 'none' && canvasBg !== 'transparent') {
          svgContent += `  <rect x="0" y="0" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="${canvasBg}" />\n`;
        }

        svgContent += `  <defs>\n`;
        // Live-canvas markers (used by getArrowMarkers — kept for any inline SVG that references them)
        svgContent += `    <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker>\n`;
        svgContent += `    <marker id="arrow-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><circle cx="5" cy="5" r="4" fill="currentColor" /></marker>\n`;
        svgContent += `    <marker id="arrow-diamond" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><polygon points="5 0, 10 5, 5 10, 0 5" fill="currentColor" /></marker>\n`;
        svgContent += `    <marker id="arrow-barb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 L 3 5 z" fill="currentColor" /></marker>\n`;
        // Export markers — match the live-canvas marker geometry exactly:
        //   viewBox="0 0 10 10" keeps the coordinate system consistent.
        //   refX="8" (not 10) pulls the line endpoint to 2 units inside the tip so the
        //   stroke does NOT poke through the arrowhead — same as the live markers.
        //   markerUnits="strokeWidth" scales the head with the stroke so thin/thick
        //   arrows both look right.
        //   fill="currentColor" inherits the path stroke colour automatically.
        svgContent += `    <marker id="export-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" markerUnits="strokeWidth" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker>\n`;
        svgContent += `    <marker id="export-arrow-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" markerUnits="strokeWidth" orient="auto"><circle cx="5" cy="5" r="4" fill="currentColor" /></marker>\n`;
        svgContent += `    <marker id="export-arrow-diamond" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" markerUnits="strokeWidth" orient="auto"><polygon points="5 0, 10 5, 5 10, 0 5" fill="currentColor" /></marker>\n`;
        svgContent += `    <marker id="export-arrow-barb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" markerUnits="strokeWidth" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 L 3 5 z" fill="currentColor" /></marker>\n`;
        svgContent += `    <filter id="sticky-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.12" /></filter>\n`;

        // Dynamic Pattern Definitions
        const patternTypes = new Set();
        for (const obj of objects) {
          if (obj.patternStyle && obj.patternStyle !== 'solid') {
            let baseColor = obj.fill || '#3b82f6';
            if (baseColor === 'none' || baseColor === 'transparent') baseColor = '#3b82f6';
            const cleanColor = baseColor.replace(/[^a-zA-Z0-9]/g, '');
            const patternKey = `${obj.patternStyle}_${cleanColor}`;
            if (!patternTypes.has(patternKey)) {
              patternTypes.add(patternKey);
              const patId = `pat_${obj.patternStyle}_${cleanColor}`;
              if (obj.patternStyle === 'stripes') {
                svgContent += `    <pattern id="${patId}" patternUnits="userSpaceOnUse" width="16" height="16" patternTransform="rotate(45)"><rect width="16" height="16" fill="${baseColor}" fill-opacity="0.12" /><line x1="0" y1="0" x2="0" y2="16" stroke="${baseColor}" stroke-width="3" /></pattern>\n`;
              } else if (obj.patternStyle === 'crosshatch') {
                svgContent += `    <pattern id="${patId}" patternUnits="userSpaceOnUse" width="16" height="16"><rect width="16" height="16" fill="${baseColor}" fill-opacity="0.12" /><line x1="0" y1="0" x2="16" y2="0" stroke="${baseColor}" stroke-width="2" /><line x1="0" y1="0" x2="0" y2="16" stroke="${baseColor}" stroke-width="2" /></pattern>\n`;
              } else if (obj.patternStyle === 'dots') {
                svgContent += `    <pattern id="${patId}" patternUnits="userSpaceOnUse" width="18" height="18"><rect width="18" height="18" fill="${baseColor}" fill-opacity="0.10" /><circle cx="9" cy="9" r="3.5" fill="${baseColor}" /></pattern>\n`;
              } else if (obj.patternStyle === 'checkered') {
                svgContent += `    <pattern id="${patId}" patternUnits="userSpaceOnUse" width="20" height="20"><rect width="20" height="20" fill="${baseColor}" fill-opacity="0.08" /><rect x="0" y="0" width="10" height="10" fill="${baseColor}" fill-opacity="0.75" /><rect x="10" y="10" width="10" height="10" fill="${baseColor}" fill-opacity="0.75" /></pattern>\n`;
              } else if (obj.patternStyle === 'waves') {
                svgContent += `    <pattern id="${patId}" patternUnits="userSpaceOnUse" width="24" height="12"><rect width="24" height="12" fill="${baseColor}" fill-opacity="0.10" /><path d="M 0 6 Q 6 0, 12 6 T 24 6" fill="none" stroke="${baseColor}" stroke-width="2" /></pattern>\n`;
              } else if (obj.patternStyle === 'honeycomb') {
                svgContent += `    <pattern id="${patId}" patternUnits="userSpaceOnUse" width="24" height="41.57"><rect width="24" height="41.57" fill="${baseColor}" fill-opacity="0.08" /><path d="M 12 0 L 24 6.93 L 24 20.78 L 12 27.71 L 0 20.78 L 0 6.93 Z M 12 20.78 L 24 27.71 L 24 41.57 L 12 48.5 L 0 41.57 L 0 27.71 Z" fill="none" stroke="${baseColor}" stroke-width="1.8" /></pattern>\n`;
              } else if (obj.patternStyle === 'dots-grid') {
                svgContent += `    <pattern id="${patId}" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="${baseColor}" fill-opacity="0.08" /><circle cx="6" cy="6" r="1.8" fill="${baseColor}" /></pattern>\n`;
              }
            }
          }
        }
        svgContent += `  </defs>\n`;
        // Shift all content so that (minX, minY) maps to (0, 0) in the output
        svgContent += `  <g transform="translate(${(-minX).toFixed(2)}, ${(-minY).toFixed(2)})">\n`;

        for (const obj of objects) {
          if (obj.link && options.includeLinks !== false) {
            const targetUrl = obj.link.startsWith('http') ? obj.link : 'https://' + obj.link;
            svgContent += `  <a href="${MathUtils.escapeSvgText(targetUrl)}" target="_blank" rel="noopener">\n`;
          }

          if (obj.type === 'stroke') {
            const strokeColor = obj.stroke || '#0f172a';
            const strokeWidth = obj.strokeWidth || 4;
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const strokeDash = MathUtils.getDashArray(obj.strokeStyle, strokeWidth);
            const dashAttr = strokeDash ? `stroke-dasharray="${strokeDash}"` : '';
            const fillVal = this.renderer ? this.renderer.getFillValue(obj.fill || 'none', obj.patternStyle) : (obj.fill || 'none');
            const blendStyle = obj.blendMode ? `style="mix-blend-mode:${obj.blendMode};"` : '';

            svgContent += `  <path id="obj-${obj.id}" d="${obj.pathData || ''}" fill="${fillVal}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${dashAttr} opacity="${opacity}" ${blendStyle} />\n`;
          } else if (obj.type === 'calligraphy') {
            const fillVal = obj.fill || obj.stroke || '#0f172a';
            const strokeColor = obj.stroke || '#0f172a';
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const blendStyle = obj.blendMode ? `style="mix-blend-mode:${obj.blendMode};"` : '';

            svgContent += `  <path id="obj-${obj.id}" d="${obj.pathData || ''}" fill="${fillVal}" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill-rule="nonzero" opacity="${opacity}" ${blendStyle} />\n`;
          } else if (obj.type === 'rectangle') {
            const rxVal = obj.cornerRadius !== undefined ? obj.cornerRadius : 0;
            const fillVal = this.renderer ? this.renderer.getFillValue(obj.fill, obj.patternStyle) : (obj.fill || 'none');
            const strokeColor = obj.stroke || '#0f172a';
            const strokeWidth = obj.strokeWidth || 2;
            const rectDash = MathUtils.getDashArray(obj.strokeStyle, strokeWidth);
            const dashAttr = rectDash ? `stroke-dasharray="${rectDash}"` : '';
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const labelText = obj.text || '';
            const fontSize = obj.fontSize || MathUtils.calculateStickyFontSize(obj.text || '', obj.width, obj.height);
            const fontW = obj.bold ? '700' : (obj.isMindMapNode ? '600' : '500');
            const fontS = obj.italic ? 'italic' : 'normal';
            const textDeco = (obj.underline && obj.strike) ? 'underline line-through' : (obj.underline ? 'underline' : (obj.strike ? 'line-through' : 'none'));
            const textDecoAttr = textDeco !== 'none' ? ` text-decoration="${textDeco}"` : '';
            const textColor = obj.textColor || (obj.isMindMapNode ? strokeColor : '#0f172a');
            const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation.toFixed(2)} ${(obj.x + obj.width/2).toFixed(2)} ${(obj.y + obj.height/2).toFixed(2)})"` : '';
            const blendStyle = obj.blendMode ? `style="mix-blend-mode:${obj.blendMode};"` : '';

            // Pixel-width wrapping — matches canvas padding:6px 12px, line-height:1.25
            const rectPadX = 12; // canvas padding:6px 12px → 12px per side
            const rectPadY = 6;
            const rectAvailW = Math.max(obj.width - rectPadX * 2, 20);
            const rectLineH = fontSize * 1.25; // matches canvas line-height:1.25
            const rectCharW = fontSize * 0.58;
            const rectLines = [];
            for (const rawLine of String(labelText || '').split('\n')) {
              if (!rawLine) { rectLines.push(''); continue; }
              const words = rawLine.split(' ');
              let cur = '', curW = 0;
              for (const word of words) {
                const wordW = word.length * rectCharW;
                const spW = cur ? rectCharW : 0;
                if (wordW > rectAvailW) {
                  if (cur) { rectLines.push(cur); cur = ''; curW = 0; }
                  const cpp = Math.max(1, Math.floor(rectAvailW / rectCharW));
                  for (let ci = 0; ci < word.length; ci += cpp) rectLines.push(word.slice(ci, ci + cpp));
                  const last = rectLines.pop(); cur = last; curW = last.length * rectCharW;
                } else if (cur && curW + spW + wordW > rectAvailW) {
                  rectLines.push(cur); cur = word; curW = wordW;
                } else { cur = cur ? cur + ' ' + word : word; curW += spW + wordW; }
              }
              rectLines.push(cur);
            }
            const rectClipId = `rect-clip-${obj.id}`;
            svgContent += `  <defs><clipPath id="${rectClipId}"><rect x="${obj.x}" y="${obj.y}" width="${Math.max(obj.width, 2)}" height="${Math.max(obj.height, 2)}" ${rxVal > 0 ? `rx="${rxVal}"` : ''}/></clipPath></defs>\n`;
            svgContent += `  <g id="obj-${obj.id}" opacity="${opacity}"${rotTransform} ${blendStyle}>\n`;
            svgContent += `    <rect x="${obj.x}" y="${obj.y}" width="${Math.max(obj.width, 2)}" height="${Math.max(obj.height, 2)}" ${rxVal > 0 ? `rx="${rxVal}"` : ''} fill="${fillVal}" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${dashAttr} />\n`;
            if (labelText) {
              const textX = (obj.x + obj.width / 2).toFixed(1);
              const totalH = rectLines.length * rectLineH;
              const innerH = obj.height - rectPadY * 2;
              const startY = (obj.y + rectPadY + (innerH - totalH) / 2 + fontSize * 0.8).toFixed(1);
              svgContent += `    <text x="${textX}" y="${startY}" text-anchor="middle" font-size="${fontSize}px" font-weight="${fontW}" font-style="${fontS}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"${textDecoAttr} clip-path="url(#${rectClipId})" pointer-events="none">\n`;
              rectLines.forEach((line, idx) => {
                const lineEsc = MathUtils.escapeSvgTextLine(line);
                if (idx === 0) svgContent += `      <tspan x="${textX}">${lineEsc}</tspan>\n`;
                else svgContent += `      <tspan x="${textX}" dy="${rectLineH.toFixed(2)}">${lineEsc}</tspan>\n`;
              });
              svgContent += `    </text>\n`;
            }
            svgContent += `  </g>\n`;
          } else if (obj.type === 'ellipse') {
            const cx = obj.x + obj.width / 2;
            const cy = obj.y + obj.height / 2;
            const rx = Math.max(obj.width / 2, 1);
            const ry = Math.max(obj.height / 2, 1);
            const fillVal = this.renderer ? this.renderer.getFillValue(obj.fill, obj.patternStyle) : (obj.fill || 'none');
            const strokeColor = obj.stroke || '#0f172a';
            const strokeWidth = obj.strokeWidth || 2;
            const ellipseDash = MathUtils.getDashArray(obj.strokeStyle, strokeWidth);
            const dashAttr = ellipseDash ? `stroke-dasharray="${ellipseDash}"` : '';
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const labelText = obj.text || '';
            const fontSize = obj.fontSize || MathUtils.calculateStickyFontSize(obj.text || '', obj.width, obj.height);
            const fontW = obj.bold ? '700' : '500';
            const fontS = obj.italic ? 'italic' : 'normal';
            const textDeco = (obj.underline && obj.strike) ? 'underline line-through' : (obj.underline ? 'underline' : (obj.strike ? 'line-through' : 'none'));
            const textDecoAttr = textDeco !== 'none' ? ` text-decoration="${textDeco}"` : '';
            const textColor = obj.textColor || strokeColor;
            const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"` : '';
            const blendStyle = obj.blendMode ? `style="mix-blend-mode:${obj.blendMode};"` : '';

            // Pixel-width wrapping — matches canvas padding:10px 16px, line-height:1.25
            // Canvas uses full bounding-box foreignObject with padding:10px 16px, not a geometric inset.
            const ellPadX = 16; // canvas padding:10px 16px → 16px per side
            const ellPadY = 10;
            const ellAvailW = Math.max(obj.width - ellPadX * 2, 20);
            const ellLineH = fontSize * 1.25; // matches canvas line-height:1.25
            const ellCharW = fontSize * 0.58;
            const ellLines = [];
            for (const rawLine of String(labelText || '').split('\n')) {
              if (!rawLine) { ellLines.push(''); continue; }
              const words = rawLine.split(' ');
              let cur = '', curW = 0;
              for (const word of words) {
                const wordW = word.length * ellCharW;
                const spW = cur ? ellCharW : 0;
                if (wordW > ellAvailW) {
                  if (cur) { ellLines.push(cur); cur = ''; curW = 0; }
                  const cpp = Math.max(1, Math.floor(ellAvailW / ellCharW));
                  for (let ci = 0; ci < word.length; ci += cpp) ellLines.push(word.slice(ci, ci + cpp));
                  const last = ellLines.pop(); cur = last; curW = last.length * ellCharW;
                } else if (cur && curW + spW + wordW > ellAvailW) {
                  ellLines.push(cur); cur = word; curW = wordW;
                } else { cur = cur ? cur + ' ' + word : word; curW += spW + wordW; }
              }
              ellLines.push(cur);
            }
            const ellClipId = `ellipse-clip-${obj.id}`;
            svgContent += `  <defs><clipPath id="${ellClipId}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath></defs>\n`;
            svgContent += `  <g id="obj-${obj.id}" opacity="${opacity}"${rotTransform} ${blendStyle}>\n`;
            svgContent += `    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fillVal}" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${dashAttr} />\n`;
            if (labelText) {
              const textX = cx.toFixed(1);
              const totalH = ellLines.length * ellLineH;
              const innerH = obj.height - ellPadY * 2;
              const startY = (obj.y + ellPadY + (innerH - totalH) / 2 + fontSize * 0.8).toFixed(1);
              svgContent += `    <text x="${textX}" y="${startY}" text-anchor="middle" font-size="${fontSize}px" font-weight="${fontW}" font-style="${fontS}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"${textDecoAttr} clip-path="url(#${ellClipId})" pointer-events="none">\n`;
              ellLines.forEach((line, idx) => {
                const lineEsc = MathUtils.escapeSvgTextLine(line);
                if (idx === 0) svgContent += `      <tspan x="${textX}">${lineEsc}</tspan>\n`;
                else svgContent += `      <tspan x="${textX}" dy="${ellLineH.toFixed(2)}">${lineEsc}</tspan>\n`;
              });
              svgContent += `    </text>\n`;
            }
            svgContent += `  </g>\n`;
          } else if (obj.type === 'line' || obj.type === 'arrow') {
            const x1 = obj.x1 || 0;
            const y1 = obj.y1 || 0;
            const x2 = obj.x2 || 0;
            const y2 = obj.y2 || 0;
            const cx = obj.cx !== undefined ? obj.cx : (x1 + x2) / 2;
            const cy = obj.cy !== undefined ? obj.cy : (y1 + y2) / 2;
            const strokeWidth = obj.strokeWidth || 2;
            const strokeColor = obj.stroke || '#0f172a';
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            // Use export-specific marker IDs (defined in export <defs>) not the live stage IDs
            const markerAttr = obj.type === 'arrow' ? MathUtils.getExportArrowMarkers(obj.arrowType || 'single') : '';
            const dashAttr = MathUtils.getDashAttr(obj.strokeStyle, strokeWidth);
            const pathD = MathUtils.getArrowPathD(obj.arrowType || 'single', x1, y1, x2, y2, cx, cy, obj.elbowDir, obj.elbowTracks, MathUtils.getElbowSide(obj, 'start'), MathUtils.getElbowSide(obj, 'end'));

            let textMarkup = '';
            if (obj.text && obj.text.trim()) {
              let midX, midY;
              if (obj.arrowType === 'elbow') {
                const em = MathUtils.getElbowMid(obj);
                midX = em.x;
                midY = em.y;
              } else {
                midX = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
                midY = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
              }
              const lines = obj.text.split('\n');
              const maxLineLen = Math.max(...lines.map(l => l.length), 1);
              const labelWidth = Math.max(maxLineLen * 9 + 20, 50);
              const labelHeight = Math.max(lines.length * 18 + 8, 26);
              const lx = midX - labelWidth / 2;
              const ly = midY - labelHeight / 2;
              const totalH = lines.length * 16;
              const startY = (ly + labelHeight / 2 - totalH / 2 + 12).toFixed(1);
              const tX = midX.toFixed(1);

              textMarkup = `    <rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${labelWidth}" height="${labelHeight}" rx="6" fill="#ffffff" stroke="${strokeColor}" stroke-width="1.5" />\n` +
                `    <text x="${tX}" y="${startY}" text-anchor="middle" font-size="14px" font-weight="600" fill="${strokeColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">\n`;
              lines.forEach((line, idx) => {
                const lineEsc = MathUtils.escapeSvgTextLine(line);
                if (idx === 0) {
                  textMarkup += `      <tspan x="${tX}">${lineEsc}</tspan>\n`;
                } else {
                  textMarkup += `      <tspan x="${tX}" dy="16">${lineEsc}</tspan>\n`;
                }
              });
              textMarkup += `    </text>\n`;
            }
            svgContent += `  <g id="obj-${obj.id}" opacity="${opacity}">\n`;
            svgContent += `    <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${dashAttr} ${markerAttr} />\n`;
            svgContent += `${textMarkup}`;
            svgContent += `  </g>\n`;
          } else if (obj.type === 'shape') {
            const labelText = obj.text || '';
            const shapeD = obj.pathData || MathUtils.getShapePathD(obj.shapeType || 'diamond', obj.x, obj.y, obj.width, obj.height);
            const strokeColor = obj.stroke === 'none' ? 'none' : (obj.stroke || '#0f172a');
            const strokeWidth = obj.strokeWidth !== undefined ? obj.strokeWidth : 2;
            const dashAttr = strokeColor !== 'none' && strokeWidth > 0 ? MathUtils.getDashAttr(obj.strokeStyle, strokeWidth) : '';
            const shapeInset = MathUtils.getShapeTextInset(obj.shapeType || 'rectangle', obj.x, obj.y, obj.width, obj.height);
            const shapeFill = this.renderer ? this.renderer.getFillValue(obj.fill || 'none', obj.patternStyle) : (obj.fill || 'none');
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation.toFixed(2)} ${(obj.x + obj.width/2).toFixed(2)} ${(obj.y + obj.height/2).toFixed(2)})"` : '';
            const blendStyle = obj.blendMode ? `style="mix-blend-mode:${obj.blendMode};"` : '';

            // Same responsive wrapping and font fitting as the canvas label.
            const textLayout = MathUtils.getFittedTextLayout(labelText, shapeInset.width, shapeInset.height, { fontSize: obj.fontSize || 18, paddingX: 0, paddingY: 0, lineHeight: 1.2 });
            const fontSize = textLayout.fontSize;
            const shpLineH = textLayout.lineHeight;
            const shpLines = textLayout.lines;
            const shpClipId = `shape-clip-${obj.id}`;
            svgContent += `  <defs><clipPath id="${shpClipId}"><path d="${shapeD}"/></clipPath></defs>\n`;
            svgContent += `  <g id="obj-${obj.id}" opacity="${opacity}"${rotTransform} ${blendStyle}>\n`;
            svgContent += `    <path d="${shapeD}" fill="${shapeFill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${dashAttr} />\n`;
            if (labelText) {
              const textX = (shapeInset.x + shapeInset.width / 2).toFixed(1);
              const totalH = shpLines.length * shpLineH;
              const startY = (shapeInset.y + shapeInset.height / 2 - totalH / 2 + fontSize * 0.8).toFixed(1);
              svgContent += `    <text x="${textX}" y="${startY}" text-anchor="middle" font-size="${fontSize}px" font-weight="600" fill="${obj.textColor || obj.stroke || '#0f172a'}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" clip-path="url(#${shpClipId})" pointer-events="none">\n`;
              shpLines.forEach((line, idx) => {
                const lineEsc = MathUtils.escapeSvgTextLine(line);
                if (idx === 0) svgContent += `      <tspan x="${textX}">${lineEsc}</tspan>\n`;
                else svgContent += `      <tspan x="${textX}" dy="${shpLineH.toFixed(2)}">${lineEsc}</tspan>\n`;
              });
              svgContent += `    </text>\n`;
            }
            svgContent += `  </g>\n`;
          } else if (obj.type === 'sticky') {
            const textVal = obj.text || '';
            const stickyFill = this.renderer ? this.renderer.getFillValue(obj.fill || '#fef08a', obj.patternStyle) : (obj.fill || '#fef08a');
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation.toFixed(2)} ${(obj.x + obj.width/2).toFixed(2)} ${(obj.y + obj.height/2).toFixed(2)})"` : '';
            // Keep export in lockstep with the responsive canvas layout.
            const textLayout = MathUtils.getStickyTextLayout(textVal, obj.width, obj.height);
            const fs = textLayout.fontSize;
            const lineH = textLayout.lineHeight;
            const padX = textLayout.paddingX;
            const padY = textLayout.paddingY;
            const lines = textLayout.lines;
            const centerX = (obj.x + obj.width / 2).toFixed(1);
            const totalTextH = lines.length * lineH;
            // Canvas uses display:flex + align-items:center with padding:12px top/bottom.
            // The inner available height for centering is (height - 2*padY).
            // SVG baseline: first tspan y = top-of-text-block + fs (ascender ≈ fs).
            const innerH = obj.height - padY * 2;
            const textBlockTop = obj.y + padY + (innerH - totalTextH) / 2;
            // SVG text y is the baseline of the first line; ascender ≈ fs * 0.8 (matches
            // the CSS box model where line-box top to baseline ≈ 0.8 * font-size).
            const startY = (textBlockTop + fs * 0.8).toFixed(1);
            const fontW = obj.bold ? '700' : '600'; // matches canvas font-weight:600 (bold → 700)
            const fontS = obj.italic ? 'italic' : 'normal';
            const textDeco = (obj.underline && obj.strike) ? 'underline line-through' : (obj.underline ? 'underline' : (obj.strike ? 'line-through' : 'none'));
            const textDecoAttr = textDeco !== 'none' ? ` text-decoration="${textDeco}"` : '';
            const textColor = obj.textColor || obj.stroke || '#0f172a';

            const stickyClipId = `sticky-clip-${obj.id}`;
            svgContent += `  <defs><clipPath id="${stickyClipId}"><rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="10"/></clipPath></defs>\n`;
            svgContent += `  <g id="obj-${obj.id}" opacity="${opacity}"${rotTransform}>\n`;
            svgContent += `    <rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="10" fill="${stickyFill}" filter="url(#sticky-shadow)" />\n`;
            svgContent += `    <text x="${centerX}" y="${startY}" text-anchor="middle" font-size="${fs}px" font-weight="${fontW}" font-style="${fontS}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"${textDecoAttr} clip-path="url(#${stickyClipId})">\n`;
            lines.forEach((line, idx) => {
              const lineEsc = MathUtils.escapeSvgTextLine(line);
              if (idx === 0) {
                svgContent += `      <tspan x="${centerX}">${lineEsc}</tspan>\n`;
              } else {
                svgContent += `      <tspan x="${centerX}" dy="${lineH.toFixed(2)}">${lineEsc}</tspan>\n`;
              }
            });
            svgContent += `    </text>\n`;
            svgContent += `  </g>\n`;
          } else if (obj.type === 'text') {
            const fs = obj.fontSize || 24;
            const rawLines = MathUtils.wrapTextToWidth(obj.text || '', fs, obj.bold, obj.italic, obj.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
            const maxLineLen = Math.max(...rawLines.map(l => l.length), 1);
            const bgVal = (obj.fill && obj.fill !== 'none' && obj.fill !== 'transparent') ? obj.fill : 'transparent';
            const hasBg = bgVal !== 'transparent';
            const padW = hasBg ? 12 : 8;
            const padH = hasBg ? 6 : 4;
            const charRatio = obj.bold ? 0.64 : 0.58;
            // Use obj.width/obj.bounds when available — these are set by the live renderer via
            // getBBox() and reflect the actual glyph width.  Falling back to the char-ratio
            // estimate (which can overshoot) causes the background rect to extend beyond the
            // text on the right side in exported files.
            const boundsWidth = obj.bounds ? obj.bounds.width : (obj.width || 0);
            const estimatedWidth = Math.ceil(maxLineLen * (fs * charRatio)) + padW;
            // Prefer the smaller of the two when bounds are available (bounds already include
            // padding from the live renderer); when no bounds exist yet, use the estimate.
            const calcWidth = obj.bounds
              ? Math.max(boundsWidth, 24)
              : Math.max(boundsWidth, estimatedWidth, 24);
            // Use fs*1.2 to match the live SVG renderer (which uses lineHeight = fs * 1.2)
            const calcHeight = Math.max(obj.height || 0, Math.ceil(rawLines.length * (fs * 1.2)) + padH, Math.ceil(fs * 1.2));
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const fontW = obj.bold ? '700' : '400';
            const fontS = obj.italic ? 'italic' : 'normal';
            const objFontFamily = obj.fontFamily || '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif';
            const textDeco = (obj.underline && obj.strike) ? 'underline line-through' : (obj.underline ? 'underline' : (obj.strike ? 'line-through' : 'none'));
            const textDecoAttr = textDeco !== 'none' ? ` text-decoration="${textDeco}"` : '';
            const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation.toFixed(2)} ${(obj.x + calcWidth/2).toFixed(2)} ${(obj.y + calcHeight/2).toFixed(2)})"` : '';

            svgContent += `  <g id="obj-${obj.id}" opacity="${opacity}"${rotTransform}>\n`;
            if (hasBg) {
              // When obj.bounds is available, use the exact glyph-box position and size so
              // the background rect matches what was shown on the canvas precisely.
              if (obj.bounds) {
                // obj.bounds already has bgPad baked in by the live renderer
                // (bx = bbox.x - bgPad, bw = bbox.width + bgPad*2), so use directly.
                svgContent += `    <rect x="${obj.bounds.minX.toFixed(2)}" y="${obj.bounds.minY.toFixed(2)}" width="${obj.bounds.width.toFixed(2)}" height="${obj.bounds.height.toFixed(2)}" rx="4" fill="${bgVal}" />\n`;
              } else {
                svgContent += `    <rect x="${obj.x}" y="${obj.y}" width="${calcWidth}" height="${calcHeight}" rx="4" fill="${bgVal}" />\n`;
              }
            }
            const textX = (obj.x + (hasBg ? 6 : 4)).toFixed(1);
            // fs*0.85 baseline offset matches the live renderer (baselineY = obj.y + fs * 0.85)
            const startY = (obj.y + (hasBg ? 4 : 2) + fs * 0.85).toFixed(1);
            const lineH = (fs * 1.2).toFixed(1);
            // textAlign: match canvas which uses text-anchor + adjusted anchorX
            const objTextAlign = obj.textAlign || 'left';
            let textAnchor = 'start';
            let alignedX = parseFloat(textX);
            if (objTextAlign === 'center') { textAnchor = 'middle'; alignedX = obj.x + (calcWidth / 2); }
            else if (objTextAlign === 'right') { textAnchor = 'end'; alignedX = obj.x + calcWidth - (hasBg ? 6 : 4); }
            const alignedXStr = alignedX.toFixed(1);
            svgContent += `    <text x="${alignedXStr}" y="${startY}" font-size="${fs}px" font-weight="${fontW}" font-style="${fontS}" fill="${obj.stroke || '#0f172a'}" font-family="${objFontFamily}" text-anchor="${textAnchor}"${textDecoAttr}>\n`;
            rawLines.forEach((line, idx) => {
              const lineEsc = MathUtils.escapeSvgTextLine(line);
              if (idx === 0) {
                svgContent += `      <tspan x="${alignedXStr}">${lineEsc}</tspan>\n`;
              } else {
                svgContent += `      <tspan x="${alignedXStr}" dy="${lineH}">${lineEsc}</tspan>\n`;
              }
            });
            svgContent += `    </text>\n`;
            svgContent += `  </g>\n`;
          } else if (obj.type === 'image') {
            const cr = obj.cornerRadius !== undefined ? obj.cornerRadius : 0;
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation.toFixed(2)} ${(obj.x + obj.width/2).toFixed(2)} ${(obj.y + obj.height/2).toFixed(2)})"` : '';
            const ecx = obj.cropX || 0, ecy = obj.cropY || 0;
            const ecw = obj.cropW || 1, ech = obj.cropH || 1;
            const fullW = obj.width / ecw, fullH = obj.height / ech;
            const imgX = obj.x - ecx * fullW, imgY = obj.y - ecy * fullH;
            const clipId = `exp-img-clip-${obj.id}`;
            svgContent += `  <defs><clipPath id="${clipId}"><rect x="${obj.x}" y="${obj.y}" width="${Math.max(obj.width,10)}" height="${Math.max(obj.height,10)}" rx="${cr}" ry="${cr}"/></clipPath></defs>\n`;
            svgContent += `  <g id="obj-${obj.id}" opacity="${opacity}" clip-path="url(#${clipId})"${rotTransform}>\n`;
            svgContent += `    <image href="${obj.src}" xlink:href="${obj.src}" x="${imgX.toFixed(2)}" y="${imgY.toFixed(2)}" width="${fullW.toFixed(2)}" height="${fullH.toFixed(2)}" preserveAspectRatio="none" />\n`;
            svgContent += `  </g>\n`;
          } else if (obj.type === 'frame') {
            const strokeColor = obj.stroke || '#3b82f6';
            const fillColor = this.renderer ? this.renderer.getFillValue(obj.fill || 'rgba(59, 130, 246, 0.03)', obj.patternStyle) : (obj.fill || 'rgba(59, 130, 246, 0.03)');
            const titleText = MathUtils.escapeSvgText(obj.title || 'Frame');
            const strokeW = obj.strokeWidth || 2;
            const frameDash = MathUtils.getDashArray('dashed', strokeW);
            const opac = obj.opacity !== undefined ? obj.opacity : 1;
            const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation.toFixed(2)} ${(obj.x + obj.width/2).toFixed(2)} ${(obj.y + obj.height/2).toFixed(2)})"` : '';
            const titleTabW = Math.min(Math.max((obj.title || 'Frame').length * 8 + 24, 60), Math.max(obj.width, 60));

            svgContent += `  <g id="obj-${obj.id}" opacity="${opac}"${rotTransform}>\n`;
            svgContent += `    <rect x="${obj.x}" y="${obj.y}" width="${Math.max(obj.width, 10)}" height="${Math.max(obj.height, 10)}" rx="8" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-dasharray="${frameDash}" />\n`;
            svgContent += `    <rect x="${obj.x}" y="${obj.y - 24}" width="${titleTabW}" height="24" rx="6" fill="${strokeColor}" />\n`;
            svgContent += `    <text x="${obj.x + 8}" y="${obj.y - 8}" font-size="12px" font-weight="700" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">${titleText}</text>\n`;
            svgContent += `  </g>\n`;
          } else if (obj.type === 'table') {
            const x = obj.x || 0;
            const y = obj.y || 0;
            const w = Math.max(obj.width || 180, 40);
            const h = Math.max(obj.height || 100, 30);
            const rows = Math.max(1, obj.rows || 3);
            const cols = Math.max(1, obj.cols || 3);
            const headerRow = obj.headerRow !== false;
            const stroke = obj.stroke || '#cbd5e1';
            const strokeWidth = obj.strokeWidth || 1.5;
            const opacity = obj.opacity !== undefined ? obj.opacity : 1;
            const baseFill = this.renderer ? this.renderer.getFillValue(obj.fill || '#ffffff', obj.patternStyle) : (obj.fill || '#ffffff');
            const headerFill = obj.headerFill || '#f1f5f9';
            const colW = w / cols;
            const rowH = h / rows;
            const cells = obj.cells || [];
            const fontSize = obj.fontSize || Math.max(11, Math.min(16, Math.round(rowH * 0.42)));
            let gridD = '';
            for (let r = 1; r < rows; r++) {
              const ry = (y + r * rowH).toFixed(1);
              gridD += `M ${x.toFixed(1)} ${ry} L ${(x + w).toFixed(1)} ${ry} `;
            }
            for (let c = 1; c < cols; c++) {
              const cx = (x + c * colW).toFixed(1);
              gridD += `M ${cx} ${y.toFixed(1)} L ${cx} ${(y + h).toFixed(1)} `;
            }
            const paddingX = 8;
            const paddingY = 4;
            let cellsSVG = '';
            let cellClipDefs = '';
            for (let r = 0; r < rows; r++) {
              const isH = headerRow && r === 0;
              const cellY = y + r * rowH;
              for (let c = 0; c < cols; c++) {
                const cellX = x + c * colW;
                const cellText = (cells[r] && cells[r][c] !== undefined) ? String(cells[r][c]) : (isH ? `Header ${c + 1}` : '');
                if (!cellText) continue;
                const fw = isH ? '700' : '500';
                const textCol = isH ? (obj.headerTextColor || '#0f172a') : (obj.textColor || '#1e293b');
                const textLayout = MathUtils.getFittedTextLayout(cellText, colW, rowH, { fontSize, paddingX, paddingY, lineHeight: 1.25 });
                const clipId = `tbl-clip-${obj.id}-r${r}-c${c}`;
                const textX = cellX + textLayout.paddingX;
                const totalTextH = textLayout.lines.length * textLayout.lineHeight;
                const startY = cellY + textLayout.paddingY + (textLayout.availH - totalTextH) / 2 + textLayout.fontSize * 0.8;
                cellClipDefs += `    <clipPath id="${clipId}"><rect x="${textX.toFixed(1)}" y="${(cellY + textLayout.paddingY).toFixed(1)}" width="${textLayout.availW.toFixed(1)}" height="${textLayout.availH.toFixed(1)}" /></clipPath>\n`;
                cellsSVG += `    <text x="${textX.toFixed(1)}" y="${startY.toFixed(1)}" font-size="${textLayout.fontSize}px" font-weight="${fw}" fill="${textCol}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" clip-path="url(#${clipId})">\n`;
                textLayout.lines.forEach((line, li) => {
                  const lineEsc = MathUtils.escapeSvgTextLine(line);
                  cellsSVG += li === 0 ? `      <tspan x="${textX.toFixed(1)}">${lineEsc}</tspan>\n` : `      <tspan x="${textX.toFixed(1)}" dy="${textLayout.lineHeight.toFixed(1)}">${lineEsc}</tspan>\n`;
                });
                cellsSVG += `    </text>\n`;
              }
            }
            const rotTransform = obj.rotation ? ` transform="rotate(${obj.rotation.toFixed(2)} ${(x + w/2).toFixed(2)} ${(y + h/2).toFixed(2)})"` : '';
            if (cellClipDefs) svgContent += `  <defs>\n${cellClipDefs}  </defs>\n`;
            svgContent += `  <g id="obj-${obj.id}" opacity="${opacity}"${rotTransform}>\n`;
            svgContent += `    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${baseFill}" opacity="${opacity}" />\n`;
            if (headerRow) {
              svgContent += `    <path d="M ${x} ${y + 6} A 6 6 0 0 1 ${x + 6} ${y} L ${x + w - 6} ${y} A 6 6 0 0 1 ${x + w} ${y + 6} L ${x + w} ${y + rowH} L ${x} ${y + rowH} Z" fill="${headerFill}" opacity="${opacity}" />\n`;
            }
            svgContent += `    <path d="${gridD}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, strokeWidth * 0.75)}" opacity="${opacity}" />\n`;
            svgContent += `    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="${stroke}" stroke-width="${Math.max(strokeWidth, 1.5)}" opacity="${opacity}" />\n`;
            svgContent += `${cellsSVG}`;
            svgContent += `  </g>\n`;

          }

          if (obj.link && options.includeLinks !== false) {
            svgContent += `  </a>\n`;
          }
        }

        svgContent += `  </g>\n`; // close translate group

        /* ── Watermark (in output coordinate space, not world space) ── */
        const wmFontSize = Math.max(11, Math.min(18, width * 0.022));
        const wmPadX = 10;
        const wmPadY = 8;
        const wmX = (width  - wmPadX).toFixed(2);
        const wmY = (height - wmPadY).toFixed(2);
        svgContent += `  <text x="${wmX}" y="${wmY}" text-anchor="end" font-size="${wmFontSize.toFixed(1)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="500" letter-spacing="0.02em" fill="#b0b8c1" opacity="0.55" pointer-events="none" user-select="none" style="user-select:none;pointer-events:none;">onlinewhiteboard.org</text>\n`;
        svgContent += `</svg>`;
        return svgContent;
      }

      exportSVG() {
        zqGateCheck(); // ZQ-GATE: 5 - SVG export
        const objects = this.objectManager.getAllObjects().filter(o => !o.hidden);
        if (objects.length === 0) {
          this.showToast('Canvas is empty');
          return;
        }

        const rawBounds = MathUtils.getObjectsBounds(objects);
        const padding = 20;
        const wallpaperBounds = this.getWallpaperBounds(rawBounds, padding);
        const activeBoardId = this.boardManager ? this.boardManager.getActiveBoardId() : null;
        const canvasBg = (activeBoardId && this.boardManager) ? this.boardManager.getBoardCanvasColor(activeBoardId) : (SafeStorage.getItem('vector_board_canvas_color') || '#ffffff');

        const svgContent = this.generateExportSVG(objects, { customBounds: wallpaperBounds, padding: 0, backgroundColor: canvasBg });
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `onlinewhiteboard.org_${Date.now()}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('SVG Exported!');
      }

      exportPNG() {
        zqGateCheck(); // ZQ-GATE: 6 - PNG export
        const objects = this.objectManager.getAllObjects().filter(o => !o.hidden);
        if (objects.length === 0) {
          this.showToast('Canvas is empty');
          return;
        }

        const rawBounds = MathUtils.getObjectsBounds(objects);
        const padding = 20;
        const wallpaperBounds = this.getWallpaperBounds(rawBounds, padding);
        const width = Math.max(Math.ceil(wallpaperBounds.width), 20);
        const height = Math.max(Math.ceil(wallpaperBounds.height), 20);
        const activeBoardId = this.boardManager ? this.boardManager.getActiveBoardId() : null;
        const canvasBg = (activeBoardId && this.boardManager) ? this.boardManager.getBoardCanvasColor(activeBoardId) : (SafeStorage.getItem('vector_board_canvas_color') || '#ffffff');

        const svgContent = this.generateExportSVG(objects, { customBounds: wallpaperBounds, padding: 0, backgroundColor: canvasBg });
        // Use Blob URL instead of data URL — avoids canvas taint that blocks toDataURL()
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const svgBlobUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        // Do NOT set crossOrigin on a blob: URL — it causes unnecessary taint on some browsers
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const scale = 2 * dpr;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = canvasBg;
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            URL.revokeObjectURL(svgBlobUrl);
            const pngData = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = pngData;
            a.download = `onlinewhiteboard.org_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.showToast('PNG Exported!');
          } catch (err) {
            URL.revokeObjectURL(svgBlobUrl);
            console.error('PNG export failed:', err);
            this.showToast('PNG Export failed');
          }
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(svgBlobUrl);
          console.error('PNG image rendering failed:', e);
          this.showToast('PNG Export failed');
        };
        img.src = svgBlobUrl;
      }

      exportPDF() {
        const objects = this.objectManager.getAllObjects().filter(o => !o.hidden);
        if (objects.length === 0) {
          this.showToast('Canvas is empty');
          return;
        }

        this.showToast('Generating PDF...');

        const rawBounds = MathUtils.getObjectsBounds(objects);
        const padding = 20;
        const wallpaperBounds = this.getWallpaperBounds(rawBounds, padding);
        const width = Math.max(Math.ceil(wallpaperBounds.width), 20);
        const height = Math.max(Math.ceil(wallpaperBounds.height), 20);
        const activeBoardId = this.boardManager ? this.boardManager.getActiveBoardId() : null;
        const canvasBg = (activeBoardId && this.boardManager) ? this.boardManager.getBoardCanvasColor(activeBoardId) : (SafeStorage.getItem('vector_board_canvas_color') || '#ffffff');

        const svgContent = this.generateExportSVG(objects, { customBounds: wallpaperBounds, padding: 0, backgroundColor: canvasBg });
        // Use Blob URL instead of data URL — avoids canvas taint that blocks toDataURL()
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const svgBlobUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        // Do NOT set crossOrigin on a blob: URL — it causes unnecessary taint on some browsers
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const scale = 2 * dpr;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = canvasBg;
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            URL.revokeObjectURL(svgBlobUrl);
            const imgData = canvas.toDataURL('image/png');
            // Resolve jsPDF — handle defer-loaded script that may not be ready yet
            const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || (typeof window.jspdf === 'function' ? window.jspdf : null));

            if (jsPDFClass) {
              const orientation = width > height ? 'landscape' : 'portrait';
              const pdf = new jsPDFClass({
                orientation: orientation,
                unit: 'pt',
                format: [width, height]
              });
              pdf.addImage(imgData, 'PNG', 0, 0, width, height);
              pdf.save(`onlinewhiteboard.org_${Date.now()}.pdf`);
              this.showToast('PDF Exported!');
            } else {
              // Fallback: Trigger direct print/pdf save
              const printWin = window.open('', '_blank');
              if (printWin) {
                printWin.document.write(`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <title>Whiteboard PDF Export</title>
                      <style>
                        @page { size: auto; margin: 0mm; }
                        body { margin: 0; display: flex; justify-content: center; align-items: center; background: #ffffff; }
                        img { max-width: 100%; height: auto; display: block; }
                      </style>
                    </head>
                    <body>
                      <img src="${imgData}" onload="window.print(); setTimeout(() => window.close(), 500);" />
                    </body>
                  </html>
                `);
                printWin.document.close();
                this.showToast('PDF library unavailable — use Print → Save as PDF');
              } else {
                this.showToast('Export failed: Please allow popups for PDF export');
              }
            }
          } catch (err) {
            URL.revokeObjectURL(svgBlobUrl);
            console.error('PDF export failed:', err);
            this.showToast('PDF export failed');
          }
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(svgBlobUrl);
          console.error('PDF image rendering failed:', e);
          this.showToast('Failed to render PDF export');
        };
        img.src = svgBlobUrl;
      }

      async switchBoard(boardId) {
        if (!boardId) return;

        // Save current board camera state before switching
        if (this.boardManager && this.camera) {
          this.boardManager.setBoardCameraState(null, { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom });
        }

        // Cancel active tool drawing / editing
        if (this.toolManager && this.toolManager.activeTool) {
          this.toolManager.activeTool.cancel();
        }

        // Clear selection overlay if select tool active
        const activeSelectTool = this.toolManager.getTool('select');
        if (activeSelectTool && activeSelectTool.clearSelection) {
          activeSelectTool.clearSelection();
        }

        // Clear current canvas state & history
        this.objectManager.clear();
        this.renderer.clear();
        this.historyManager.clear();

        // Set new active board ID
        this.boardManager.activeBoardId = boardId;
        try {
          SafeStorage.setItem('vector_active_board_id', boardId);
        } catch (e) {}

        // Restore target board's canvas settings, view & camera state
        const activeBoard = this.boardManager.getActiveBoard();
        const boardColor = activeBoard.canvasColor || '#ffffff';
        const boardGridStyle = activeBoard.gridStyle || 'none';
        const boardSnap = !!activeBoard.snapToGrid;
        const boardCam = activeBoard.cameraState || { x: 0, y: 0, zoom: 1 };

        this.setCanvasColor(boardColor, false);
        this.setCanvasGridStyle(boardGridStyle, false);
        this.setSnapToGrid(boardSnap, false);

        if (boardCam) {
          this.camera.x = boardCam.x || 0;
          this.camera.y = boardCam.y || 0;
          this.camera.zoom = boardCam.zoom || 1;
          this.camera.applyTransform();
        }

        // Load new board objects
        try {
          const storedObjects = await this.storageManager.loadObjectsForBoard(boardId);
          for (const obj of storedObjects) {
            this.objectManager.addObject(obj);
            this.renderer.renderObject(obj);
          }
          this.updateObjectCount();
          this.updateSaveStatus('saved');
          this.boardManager.renderUI();
          this.showToast(`Switched to "${this.boardManager.getActiveBoard().name}"`);
        } catch (err) {
          console.error('Failed to switch board:', err);
          this.showToast('Failed to load board');
        }
      }

      showConfirmModal(title, message, confirmText, onConfirm) {
        let modal = document.getElementById('app-confirm-modal');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'app-confirm-modal';
          modal.className = 'modal-overlay';
          modal.innerHTML = `
            <div class="glass-panel modal-card">
              <h3 id="modal-title" class="modal-title"></h3>
              <p id="modal-message" class="modal-message"></p>
              <div class="modal-actions">
                <button id="modal-btn-cancel" class="modal-btn secondary">Cancel</button>
                <button id="modal-btn-confirm" class="modal-btn primary danger">Confirm</button>
              </div>
            </div>
          `;
          document.body.appendChild(modal);
        }

        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        const confirmBtn = document.getElementById('modal-btn-confirm');
        confirmBtn.textContent = confirmText || 'Confirm';

        modal.style.display = 'flex';

        const close = () => {
          modal.style.display = 'none';
        };

        document.getElementById('modal-btn-cancel').onclick = () => close();
        confirmBtn.onclick = () => {
          close();
          if (onConfirm) onConfirm();
        };
      }

      exportJSON() {
        const objects = this.objectManager.getAllObjects();
        if (objects.length === 0) {
          this.showToast('Canvas is empty');
          return;
        }

        try {
          const jsonStr = JSON.stringify(objects, null, 2);
          // Use Blob URL — Chrome 65+ blocks data: URI downloads for security
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const downloadAnchor = document.createElement('a');
          downloadAnchor.href = url;
          downloadAnchor.download = `onlinewhiteboard.org_${Date.now()}.json`;
          document.body.appendChild(downloadAnchor);
          downloadAnchor.click();
          document.body.removeChild(downloadAnchor);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.showToast('JSON Board Exported!');
        } catch (err) {
          console.error('JSON export failed:', err);
          this.showToast('JSON export failed');
        }
      }

      importJSON(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const objects = JSON.parse(e.target.result);
            if (!Array.isArray(objects)) {
              this.showToast('Invalid board file');
              return;
            }

            const existing = this.objectManager.getAllObjects();
            if (existing.length > 0) {
              const choice = confirm(
                `The canvas already has ${existing.length} object${existing.length !== 1 ? 's' : ''}.\n\n` +
                `OK — Add imported objects on top of existing ones\n` +
                `Cancel — Clear canvas first, then import`
              );
              if (!choice) {
                // Clear canvas then import
                const toDelete = [...existing];
                const delCmd = new DeleteObjectsCommand(
                  this.objectManager,
                  this.storageManager,
                  this.renderer,
                  toDelete
                );
                this.historyManager.execute(delCmd);
              }
            }

            const activeBoardId = this.boardManager.getActiveBoardId();
            for (const obj of objects) {
              obj.boardId = activeBoardId;
            }

            const cmd = new AddObjectsCommand(
              this.objectManager,
              this.storageManager,
              this.renderer,
              objects
            );
            this.historyManager.execute(cmd);
            this.updateObjectCount();
            this.showToast(`Imported ${objects.length} elements!`);
            this.camera.zoomToFit(this.objectManager.getAllObjects());
          } catch (err) {
            this.showToast('Error reading board file');
          }
        };
        reader.readAsText(file);
      }

      // ==========================================
      // FRAMES & PRESENTATION MODE CONTROLLER
      // ==========================================
      getOrderedFrames() {
        const objects = this.objectManager.getAllObjects();
        const frames = objects.filter(o => o.type === 'frame');
        if (!this.frameOrder) this.frameOrder = [];

        const existingIds = new Set(frames.map(f => f.id));
        this.frameOrder = this.frameOrder.filter(id => existingIds.has(id));

        frames.forEach(f => {
          if (!this.frameOrder.includes(f.id)) {
            this.frameOrder.push(f.id);
          }
        });

        const frameMap = new Map(frames.map(f => [f.id, f]));
        return this.frameOrder.map(id => frameMap.get(id)).filter(Boolean);
      }

      toggleFramesPanel(show) {
        const panel = document.getElementById('frames-panel');
        if (!panel) return;
        const btn = document.getElementById('btn-frames-panel');
        if (show === undefined) {
          show = panel.style.display === 'none';
        }
        panel.style.display = show ? 'flex' : 'none';
        if (btn) {
          if (show) btn.classList.add('active');
          else btn.classList.remove('active');
        }
        if (show) {
          this.renderFramesPanel();
        }
      }

      isFramesPanelOpen() {
        const panel = document.getElementById('frames-panel');
        return panel && panel.style.display !== 'none';
      }

      renderFramesPanel() {
        const container = document.getElementById('frames-list-container');
        if (!container) return;

        const frames = this.getOrderedFrames();

        if (frames.length === 0) {
          container.innerHTML = `
            <div class="frames-empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/><path d="M3 9h18"/></svg>
              <span>No frames yet.<br>Press <b>F</b> to draw a frame.</span>
            </div>
          `;
          return;
        }

        let html = '';
        frames.forEach((frame, idx) => {
          const title = (frame.title || `Frame ${idx + 1}`).replace(/"/g, '&quot;');
          html += `
            <div class="frame-item" data-frame-id="${frame.id}">
              <span class="frame-num-badge">${idx + 1}</span>
              <input type="text" class="frame-title-input" value="${title}" data-frame-id="${frame.id}" placeholder="Frame Title">
              <button class="frame-item-btn export-frame" data-frame-id="${frame.id}" title="Export as PNG">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button class="frame-item-btn delete" data-frame-id="${frame.id}" title="Delete Frame">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.frame-title-input').forEach(input => {
          input.addEventListener('input', (e) => {
            const fid = e.target.getAttribute('data-frame-id');
            const frame = this.objectManager.getObject(fid);
            if (frame) {
              frame.title = e.target.value;
              this.renderer.renderObject(frame);
              this.storageManager.saveObject(frame);
              const propInput = document.getElementById('prop-frame-title-input');
              if (propInput) propInput.value = frame.title;
            }
          });
        });

        container.querySelectorAll('.export-frame').forEach(btn => {
          btn.addEventListener('click', () => {
            this.exportFramePNG(btn.getAttribute('data-frame-id'));
          });
        });

        container.querySelectorAll('.delete').forEach(btn => {
          btn.addEventListener('click', () => {
            const fid = btn.getAttribute('data-frame-id');
            const frame = this.objectManager.getObject(fid);
            if (frame) {
              const cmd = new DeleteObjectsCommand(
                this.objectManager,
                this.storageManager,
                this.renderer,
                frame
              );
              this.historyManager.execute(cmd);
              this.updateObjectCount();
              this.renderFramesPanel();
            }
          });
        });
      }

      exportFramePNG(frameId) {
        const frame = this.objectManager.getObject(frameId);
        if (!frame) { this.showToast('Frame not found'); return; }

        const bounds = { minX: frame.x, minY: frame.y, maxX: frame.x + frame.width, maxY: frame.y + frame.height, width: frame.width, height: frame.height };
        const exportObjects = this.objectManager.getAllObjects().filter(o => {
          if (o.type === 'frame') return false;
          const ob = o.bounds || MathUtils.getObjectBounds(o);
          return ob && ob.maxX > bounds.minX && ob.minX < bounds.maxX && ob.maxY > bounds.minY && ob.minY < bounds.maxY;
        });
        if (exportObjects.length === 0) { this.showToast('Frame is empty'); return; }
        const activeBoardId = this.boardManager ? this.boardManager.getActiveBoardId() : null;
        const canvasBg = (activeBoardId && this.boardManager) ? this.boardManager.getBoardCanvasColor(activeBoardId) : (SafeStorage.getItem('vector_board_canvas_color') || '#ffffff');

        const svgContent = this.generateExportSVG(exportObjects, {
          padding: 0, backgroundColor: canvasBg,
          customBounds: bounds
        });
        const width = Math.ceil(frame.width);
        const height = Math.ceil(frame.height);
        // Use Blob URL instead of data URL — avoids canvas taint that blocks toDataURL()
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const svgBlobUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const scale = 2 * dpr;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = canvasBg;
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(svgBlobUrl);
            const pngData = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = pngData;
            const safeName = (frame.title || 'frame').replace(/[^a-z0-9_-]/gi, '_');
            a.download = `onlinewhiteboard.org_${safeName}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.showToast(`Exported "${frame.title || 'Frame'}"`);
          } catch (err) {
            URL.revokeObjectURL(svgBlobUrl);
            this.showToast('Export failed');
          }
        };
        img.onerror = () => { URL.revokeObjectURL(svgBlobUrl); this.showToast('Export failed'); };
        img.src = svgBlobUrl;
      }

      /* ==========================================================================
         FULL-SCREEN MODE CONTROLLER
         ========================================================================== */

      toggleFullscreen() {
        if (this.isFullscreenMode()) {
          this.exitFullscreen();
        } else {
          this.enterFullscreen();
        }
      }

      isFullscreenMode() {
        return !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          this.isCustomFullscreen ||
          document.body.classList.contains('fullscreen-mode')
        );
      }

      enterFullscreen() {
        this.isCustomFullscreen = true;
        document.body.classList.add('fullscreen-mode');

        const el = document.documentElement;
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => {
            // Silently handled: Fallback to CSS full-screen mode when iframe/browser sandbox denies native API
          });
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen().catch(() => {});
        }

        this.updateFullscreenUI(true);
        this.showToast('Entered Full-Screen Mode (Press Esc to Exit)');
      }

      exitFullscreen() {
        this.isCustomFullscreen = false;
        document.body.classList.remove('fullscreen-mode');

        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen().catch(() => {});
          }
        }

        this.updateFullscreenUI(false);
        this.showToast('Exited Full-Screen Mode');
      }

      updateFullscreenUI(isFullscreen) {
        this.isFullscreen = isFullscreen;
        if (isFullscreen) {
          document.body.classList.add('fullscreen-mode');
        } else {
          document.body.classList.remove('fullscreen-mode');
        }

        // Toolbar Button Toggle
        const enterIcon = document.getElementById('icon-fullscreen-enter');
        const exitIcon = document.getElementById('icon-fullscreen-exit');
        const fsBtn = document.getElementById('btn-fullscreen');
        if (enterIcon && exitIcon) {
          enterIcon.style.display = isFullscreen ? 'none' : 'block';
          exitIcon.style.display = isFullscreen ? 'block' : 'none';
        }
        if (fsBtn) {
          fsBtn.setAttribute('data-tooltip', isFullscreen ? 'Exit Full-Screen (Esc / F11)' : 'Full-Screen Mode (F11 / Ctrl+Shift+F)');
          if (isFullscreen) fsBtn.classList.add('active');
          else fsBtn.classList.remove('active');
        }

        // Zoom Panel Button Toggle
        const zoomEnterIcon = document.getElementById('icon-zoom-fullscreen-enter');
        const zoomExitIcon = document.getElementById('icon-zoom-fullscreen-exit');
        const zoomFsBtn = document.getElementById('btn-zoom-fullscreen');
        if (zoomEnterIcon && zoomExitIcon) {
          zoomEnterIcon.style.display = isFullscreen ? 'none' : 'block';
          zoomExitIcon.style.display = isFullscreen ? 'block' : 'none';
        }
        if (zoomFsBtn) {
          zoomFsBtn.title = isFullscreen ? 'Exit Full-Screen (Esc / F11)' : 'Full-Screen Mode (F11 / Ctrl+Shift+F)';
          if (isFullscreen) zoomFsBtn.classList.add('active');
          else zoomFsBtn.classList.remove('active');
        }

        // Context Menu Label Toggle
        const ctxLabel = document.getElementById('ctx-fullscreen-label');
        if (ctxLabel) {
          ctxLabel.textContent = isFullscreen ? 'Exit Full-Screen' : 'Full-Screen Mode';
        }
      }

      /* ==========================================================================
         RIGHT-CLICK CONTEXT MENU & QUICK ACTIONS
         ========================================================================== */

      handleContextMenu(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        if (this.isMobileDevice()) {
          return;
        }

        // Release any canvas pointer dragging / panning states
        this.isPointerDown = false;
        this.isMiddleMousePanning = false;
        this.svgStage.classList.remove('panning');
        if (this.activePointers) this.activePointers.clear();

        const selectTool = this.toolManager?.tools?.get('select');
        if (selectTool) {
          selectTool.actionState = null;
          selectTool.activeHandle = null;
          selectTool.marqueeBox = null;
        }

        const clientX = e.clientX;
        const clientY = e.clientY;
        const pt = this.camera.screenToSvg(clientX, clientY);
        this.contextMenuPos = { x: clientX, y: clientY, svgPt: pt };

        // Hit testing for objects under cursor
        const hitIds = this.objectManager.hitTestStroke(pt, 12 / this.camera.zoom);

        if (hitIds.length > 0) {
          const topHitId = hitIds[hitIds.length - 1];
          if (selectTool) {
            // If right-clicked object is not in current selection, select it exclusively
            if (!selectTool.selectedIds.has(topHitId)) {
              if (this.toolManager.activeToolName !== 'select') {
                this.selectTool('select');
              }
              selectTool.selectObject(topHitId, false);
            }
            selectTool.actionState = null;
          }
        } else {
          // If right-clicked on empty canvas, clear selection so canvas context menu shows
          if (selectTool && selectTool.selectedIds.size > 0) {
            selectTool.clearSelection();
          }
        }

        const selected = selectTool ? selectTool.getSelectedObjects() : [];
        this.renderAndShowContextMenu(clientX, clientY, selected, pt);
      }

      renderAndShowContextMenu(x, y, selected, svgPt) {
        const menu = document.getElementById('canvas-context-menu');
        if (!menu) return;

        const hasSelection = selected && selected.length > 0;
        const isSingle = selected && selected.length === 1;
        const singleObj = isSingle ? selected[0] : null;
        const canGroup = selected && selected.length >= 2;
        const canUngroup = selected && selected.some(o => (o.groupIds && o.groupIds.length > 0) || o.groupId);
        const canConnect = isSingle && MathUtils.isConnectableShape(singleObj);
        const canEditText = isSingle && ['text', 'sticky', 'shape', 'rectangle', 'ellipse', 'table', 'arrow', 'line'].includes(singleObj.type);
        const hasLink = isSingle && singleObj.link;
        const isLocked = selected && selected.length > 0 && selected.every(o => o.locked);
        const canPaste = (this.clipboard && this.clipboard.length > 0);
        const canPasteStyle = !!this.copiedStyle;
        const canUndo = this.historyManager && this.historyManager.undoStack.length > 0;
        const canRedo = this.historyManager && this.historyManager.redoStack.length > 0;

        let html = '';

        if (hasSelection) {
          // SELECTION CONTEXT MENU
          const headerLabel = isSingle 
            ? ((singleObj.type === 'rectangle' && singleObj.isMindMapNode) ? 'MIND MAP NODE' : (singleObj.type.toUpperCase() + ' ITEM'))
            : (`${selected.length} OBJECTS SELECTED`);

          html += `
            <div class="ctx-header">${headerLabel}</div>
            
            <div class="ctx-item" data-action="cut">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                    <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
                  </svg>
                </div>
                <span class="ctx-label">Cut</span>
              </div>
              <span class="ctx-shortcut">Ctrl+X</span>
            </div>

            <div class="ctx-item" data-action="copy">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </div>
                <span class="ctx-label">Copy</span>
              </div>
              <span class="ctx-shortcut">Ctrl+C</span>
            </div>

            <div class="ctx-item ${canPaste ? '' : 'disabled'}" data-action="paste">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                  </svg>
                </div>
                <span class="ctx-label">Paste</span>
              </div>
              <span class="ctx-shortcut">Ctrl+V</span>
            </div>

            <div class="ctx-item" data-action="duplicate">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>
                  </svg>
                </div>
                <span class="ctx-label">Duplicate</span>
              </div>
              <span class="ctx-shortcut">Ctrl+D</span>
            </div>

            <div class="ctx-item danger" data-action="delete">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </div>
                <span class="ctx-label">Delete</span>
              </div>
              <span class="ctx-shortcut">Del</span>
            </div>

            <div class="ctx-separator"></div>

            <div class="ctx-item" data-action="copy-style">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                  </svg>
                </div>
                <span class="ctx-label">Copy Style</span>
              </div>
              <span class="ctx-shortcut">Ctrl+Alt+C</span>
            </div>

            <div class="ctx-item ${canPasteStyle ? '' : 'disabled'}" data-action="paste-style">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 11V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7"/>
                    <path d="M2 11h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9z"/>
                  </svg>
                </div>
                <span class="ctx-label">Paste Style</span>
              </div>
              <span class="ctx-shortcut">Ctrl+Alt+V</span>
            </div>

            <div class="ctx-separator"></div>
          `;

          if (canEditText) {
            html += `
              <div class="ctx-item" data-action="edit-text">
                <div class="ctx-left">
                  <div class="ctx-icon">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                  </div>
                  <span class="ctx-label">Edit Text / Content</span>
                </div>
                <span class="ctx-shortcut">F2</span>
              </div>
            `;
          }

          if (canConnect) {
            html += `
              <div class="ctx-item" data-action="add-child">
                <div class="ctx-left">
                  <div class="ctx-icon">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </div>
                  <span class="ctx-label">Add Branch Child</span>
                </div>
                <span class="ctx-shortcut">Tab</span>
              </div>

              <div class="ctx-item" data-action="add-sibling">
                <div class="ctx-left">
                  <div class="ctx-icon">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </div>
                  <span class="ctx-label">Add Sibling Branch</span>
                </div>
                <span class="ctx-shortcut">Enter</span>
              </div>

              <div class="ctx-item" data-action="tidy-mindmap">
                <div class="ctx-left">
                  <div class="ctx-icon">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                  </div>
                  <span class="ctx-label">Auto-Tidy Mind Map</span>
                </div>
              </div>
            `;
          }

          if (isSingle) {
            html += `
              <div class="ctx-item" data-action="embed-link">
                <div class="ctx-left">
                  <div class="ctx-icon">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  </div>
                  <span class="ctx-label">${hasLink ? 'Edit Destination Link' : 'Attach Link / URL'}</span>
                </div>
                <span class="ctx-shortcut">Ctrl+K</span>
              </div>
            `;

            if (hasLink) {
              html += `
                <div class="ctx-item" data-action="open-link">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </div>
                    <span class="ctx-label">Open Link Destination</span>
                  </div>
                </div>
                <div class="ctx-item danger" data-action="remove-link">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </div>
                    <span class="ctx-label">Remove Link</span>
                  </div>
                </div>
              `;
            }

          }

          html += `
            <div class="ctx-separator"></div>

            <!-- Layer Arrangement Submenu -->
            <div class="ctx-item ctx-has-submenu">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
                  </svg>
                </div>
                <span class="ctx-label">Arrange Layers</span>
              </div>
              <svg class="ctx-submenu-arrow" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              
              <div class="ctx-submenu">
                <div class="ctx-item" data-action="bring-front">
                  <div class="ctx-left"><span class="ctx-label">Bring to Front</span></div>
                  <span class="ctx-shortcut">Ctrl+]</span>
                </div>
                <div class="ctx-item" data-action="bring-forward">
                  <div class="ctx-left"><span class="ctx-label">Bring Forward</span></div>
                  <span class="ctx-shortcut">]</span>
                </div>
                <div class="ctx-item" data-action="send-backward">
                  <div class="ctx-left"><span class="ctx-label">Send Backward</span></div>
                  <span class="ctx-shortcut">[</span>
                </div>
                <div class="ctx-item" data-action="send-back">
                  <div class="ctx-left"><span class="ctx-label">Send to Back</span></div>
                  <span class="ctx-shortcut">Ctrl+[</span>
                </div>
              </div>
            </div>
          `;

          if (canGroup || canUngroup) {
            if (canGroup) {
              html += `
                <div class="ctx-item" data-action="group">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                      </svg>
                    </div>
                    <span class="ctx-label">Group</span>
                  </div>
                  <span class="ctx-shortcut">Ctrl+G</span>
                </div>
              `;
            }
            if (canUngroup) {
              html += `
                <div class="ctx-item" data-action="ungroup">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="2" width="8" height="8" stroke-dasharray="2 2"/><rect x="14" y="14" width="8" height="8" stroke-dasharray="2 2"/>
                      </svg>
                    </div>
                    <span class="ctx-label">Ungroup</span>
                  </div>
                  <span class="ctx-shortcut">Ctrl+Shift+G</span>
                </div>
              `;
            }
          }

          if (selected.length >= 2) {
            html += `
              <!-- Align Submenu -->
              <div class="ctx-item ctx-has-submenu">
                <div class="ctx-left">
                  <div class="ctx-icon">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/>
                    </svg>
                  </div>
                  <span class="ctx-label">Align</span>
                </div>
                <svg class="ctx-submenu-arrow" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>

                <div class="ctx-submenu">
                  <div class="ctx-item" data-action="align-left"><span class="ctx-label">Align Left</span></div>
                  <div class="ctx-item" data-action="align-center"><span class="ctx-label">Align Center (H)</span></div>
                  <div class="ctx-item" data-action="align-right"><span class="ctx-label">Align Right</span></div>
                  <div class="ctx-separator"></div>
                  <div class="ctx-item" data-action="align-top"><span class="ctx-label">Align Top</span></div>
                  <div class="ctx-item" data-action="align-middle"><span class="ctx-label">Align Middle (V)</span></div>
                  <div class="ctx-item" data-action="align-bottom"><span class="ctx-label">Align Bottom</span></div>
                </div>
              </div>
            `;
          }

          html += `
            <div class="ctx-item" data-action="toggle-lock">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="${isLocked ? 'M7 11V7a5 5 0 0 1 10 0v4' : 'M7 11V7a5 5 0 0 1 9.9-1'}"/>
                  </svg>
                </div>
                <span class="ctx-label">${isLocked ? 'Unlock Selection' : 'Lock Selection'}</span>
              </div>
            </div>

            <div class="ctx-separator"></div>

            <!-- Export Selection Submenu -->
            <div class="ctx-item ctx-has-submenu">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </div>
                <span class="ctx-label">Export Selection</span>
              </div>
              <svg class="ctx-submenu-arrow" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>

              <div class="ctx-submenu">
                <div class="ctx-item" data-action="export-selection-png"><span class="ctx-label">Export as PNG</span></div>
                <div class="ctx-item" data-action="export-selection-svg"><span class="ctx-label">Export as SVG</span></div>
                <div class="ctx-item" data-action="export-selection-pdf"><span class="ctx-label">Export as PDF</span></div>
                <div class="ctx-separator"></div>
                <div class="ctx-item" data-action="copy-selection-svg"><span class="ctx-label">Copy SVG Markup</span></div>
              </div>
            </div>
          `;
        } else {
          // CANVAS CONTEXT MENU (Blank Area)
          html += `
            <div class="ctx-header">CANVAS ACTIONS</div>

            <div class="ctx-item ${canPaste ? '' : 'disabled'}" data-action="paste-here">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                  </svg>
                </div>
                <span class="ctx-label">Paste Here</span>
              </div>
              <span class="ctx-shortcut">Ctrl+V</span>
            </div>

            <div class="ctx-item ${canUndo ? '' : 'disabled'}" data-action="undo">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                </div>
                <span class="ctx-label">Undo</span>
              </div>
              <span class="ctx-shortcut">Ctrl+Z</span>
            </div>

            <div class="ctx-item ${canRedo ? '' : 'disabled'}" data-action="redo">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                </div>
                <span class="ctx-label">Redo</span>
              </div>
              <span class="ctx-shortcut">Ctrl+Y</span>
            </div>

            <div class="ctx-item" data-action="select-all">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/>
                  </svg>
                </div>
                <span class="ctx-label">Select All</span>
              </div>
              <span class="ctx-shortcut">Ctrl+A</span>
            </div>

            <div class="ctx-separator"></div>

            <!-- Insert Object Submenu -->
            <div class="ctx-item ctx-has-submenu">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                </div>
                <span class="ctx-label">Insert Object</span>
              </div>
              <svg class="ctx-submenu-arrow" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>

              <div class="ctx-submenu">
                <div class="ctx-item" data-action="insert-sticky">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>
                    </div>
                    <span class="ctx-label">Sticky Note</span>
                  </div>
                  <span class="ctx-shortcut">N</span>
                </div>
                <div class="ctx-item" data-action="insert-text">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                    </div>
                    <span class="ctx-label">Text Box</span>
                  </div>
                  <span class="ctx-shortcut">T</span>
                </div>
                <div class="ctx-item" data-action="insert-mindmap">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><path d="M9.8 10.2 6.5 7.5"/><path d="M14.2 10.2 17.5 7.5"/></svg>
                    </div>
                    <span class="ctx-label">Mind Map Node</span>
                  </div>
                  <span class="ctx-shortcut">M</span>
                </div>
                <div class="ctx-item" data-action="insert-table">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 9v12M15 9v12"/></svg>
                    </div>
                    <span class="ctx-label">Table Grid</span>
                  </div>
                  <span class="ctx-shortcut">Shift+T</span>
                </div>
                <div class="ctx-item" data-action="insert-frame">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                    </div>
                    <span class="ctx-label">Presentation Frame</span>
                  </div>
                  <span class="ctx-shortcut">F</span>
                </div>
                <div class="ctx-item" data-action="insert-image">
                  <div class="ctx-left">
                    <div class="ctx-icon">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                    </div>
                    <span class="ctx-label">Upload Image...</span>
                  </div>
                  <span class="ctx-shortcut">I</span>
                </div>
              </div>
            </div>

            <!-- Templates Submenu -->
            <div class="ctx-item ctx-has-submenu">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 3h16a2 2 0 0 1 2 2v6a10 10 0 0 1-10 10A10 10 0 0 1 2 11V5a2 2 0 0 1 2-2z"/>
                    <polyline points="8 10 12 14 16 10"/>
                  </svg>
                </div>
                <span class="ctx-label">Insert Template</span>
              </div>
              <svg class="ctx-submenu-arrow" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>

              <div class="ctx-submenu">
                <div class="ctx-item" data-action="template-mindmap"><span class="ctx-label">Mind Map Diagram</span></div>
              </div>
            </div>

            <div class="ctx-separator"></div>

            <div class="ctx-item" data-action="zoom-reset">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                </div>
                <span class="ctx-label">Reset Zoom (100%)</span>
              </div>
              <span class="ctx-shortcut">Ctrl+0</span>
            </div>

            <div class="ctx-item" data-action="zoom-fit">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                </div>
                <span class="ctx-label">Zoom to Fit All</span>
              </div>
              <span class="ctx-shortcut">Shift+1</span>
            </div>

            <div class="ctx-item" data-action="toggle-grid">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
                  </svg>
                </div>
                <span class="ctx-label">Cycle Grid Style</span>
              </div>
            </div>

            <div class="ctx-item" data-action="toggle-fullscreen">
              <div class="ctx-left">
                <div class="ctx-icon">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                </div>
                <span class="ctx-label" id="ctx-fullscreen-label">${this.isFullscreenMode() ? 'Exit Full-Screen' : 'Full-Screen Mode'}</span>
              </div>
              <span class="ctx-shortcut">F11</span>
            </div>
          `;
        }

        menu.innerHTML = html;

        menu.onpointerdown = (ev) => ev.stopPropagation();
        menu.onmousedown = (ev) => ev.stopPropagation();
        menu.oncontextmenu = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        };

        // Position and display menu with boundary clamping
        menu.style.display = 'block';
        menu.style.visibility = 'hidden';
        menu.classList.remove('show');

        // Measure menu dimensions
        const menuW = menu.offsetWidth || 230;
        const menuH = menu.offsetHeight || 320;
        const pad = 12;

        let posX = x;
        let posY = y;

        if (posX + menuW > window.innerWidth - pad) {
          posX = Math.max(pad, window.innerWidth - menuW - pad);
        }
        if (posY + menuH > window.innerHeight - pad) {
          posY = Math.max(pad, window.innerHeight - menuH - pad);
        }

        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;
        menu.style.visibility = 'visible';

        // Trigger smooth entry transition
        requestAnimationFrame(() => {
          menu.classList.add('show');
        });

        // Submenu positioning bounds adjustment and click/tap toggling
        menu.querySelectorAll('.ctx-has-submenu').forEach(parent => {
          const sub = parent.querySelector('.ctx-submenu');
          if (sub) {
            const adjustSubmenuPos = () => {
              const parentRect = parent.getBoundingClientRect();
              const subW = sub.offsetWidth || 220;
              const subH = sub.offsetHeight || 220;

              if (parentRect.right + subW > window.innerWidth - 10) {
                sub.classList.add('flip-left');
              } else {
                sub.classList.remove('flip-left');
              }

              if (parentRect.top + subH > window.innerHeight - 10) {
                sub.classList.add('flip-up');
              } else {
                sub.classList.remove('flip-up');
              }
            };

            parent.addEventListener('mouseenter', adjustSubmenuPos);

            // Enable tapping / clicking submenu title to open & pin it (essential for tablet and mobile)
            parent.addEventListener('click', (ev) => {
              if (ev.target.closest('.ctx-item[data-action]')) return;
              ev.stopPropagation();
              const wasOpen = parent.classList.contains('open');
              menu.querySelectorAll('.ctx-has-submenu').forEach(p => {
                if (p !== parent) p.classList.remove('open');
              });
              if (!wasOpen) {
                parent.classList.add('open');
                adjustSubmenuPos();
              } else {
                parent.classList.remove('open');
              }
            });
          }
        });

        // Bind Context Menu Item Click Handlers
        menu.querySelectorAll('.ctx-item[data-action]').forEach(item => {
          item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const action = item.getAttribute('data-action');
            this.executeContextMenuAction(action, selected, svgPt);
            this.hideContextMenu();
          });
        });
      }

      executeContextMenuAction(action, selected, svgPt) {
        const selectTool = this.toolManager.tools.get('select');

        switch (action) {
          case 'cut':
            this.cutSelection();
            break;
          case 'copy':
            this.copySelection();
            break;
          case 'paste':
          case 'paste-here':
            this.pasteObjects(svgPt);
            break;
          case 'duplicate':
            if (selectTool) selectTool.duplicateSelection();
            break;
          case 'delete':
            if (selectTool) selectTool.deleteSelection();
            break;
          case 'copy-style':
            this.copySelectionStyle(selected);
            break;
          case 'paste-style':
            this.pasteSelectionStyle(selected);
            break;
          case 'rotate-cw':
            if (selectTool) selectTool.rotateSelection(90);
            break;
          case 'rotate-ccw':
            if (selectTool) selectTool.rotateSelection(-90);
            break;
          case 'rotate-180':
            if (selectTool) selectTool.rotateSelection(180);
            break;
          case 'rotate-reset':
            if (selectTool) selectTool.resetSelectionRotation();
            break;
          case 'flip-h':
            if (selectTool) selectTool.flipSelection('h');
            break;
          case 'flip-v':
            if (selectTool) selectTool.flipSelection('v');
            break;
          case 'edit-text':
            if (selected && selected.length === 1) this.editObjectText(selected[0]);
            break;
          case 'add-child':
            if (selected && selected.length === 1) this.addMindMapChild(selected[0].id);
            break;
          case 'add-sibling':
            if (selected && selected.length === 1) this.addMindMapSibling(selected[0].id);
            break;
          case 'tidy-mindmap':
            this.relayoutMindMap(selected && selected.length === 1 ? selected[0].id : null);
            break;
          case 'embed-link':
            this.openEmbedLinkModal();
            break;
          case 'open-link':
            if (selected && selected.length === 1 && selected[0].link) {
              window.open(selected[0].link, '_blank', 'noopener,noreferrer');
            }
            break;
          case 'remove-link':
            if (selected && selected.length === 1) this.removeEmbedLink(selected[0]);
            break;
          case 'bring-front':
            if (selectTool) selectTool.bringToFront();
            break;
          case 'bring-forward':
            if (selectTool) selectTool.bringForward();
            break;
          case 'send-backward':
            if (selectTool) selectTool.sendBackward();
            break;
          case 'send-back':
            if (selectTool) selectTool.sendToBack();
            break;
          case 'group':
            if (selectTool) selectTool.groupSelection();
            break;
          case 'ungroup':
            if (selectTool) selectTool.ungroupSelection();
            break;
          case 'toggle-lock':
            if (selectTool) selectTool.toggleLockSelection();
            break;
          case 'align-left':
          case 'align-center':
          case 'align-right':
          case 'align-top':
          case 'align-middle':
          case 'align-bottom':
            if (selectTool) {
              const type = action.replace('align-', '');
              selectTool.alignSelection(type);
            }
            break;
          case 'export-selection-png':
            this.exportSelectionPNG(selected);
            break;
          case 'export-selection-svg':
            this.exportSelectionSVG(selected);
            break;
          case 'export-selection-pdf':
            this.exportSelectionPDF(selected);
            break;
          case 'copy-selection-svg':
            this.copySelectionSVGToClipboard(selected);
            break;
          case 'undo':
            this.historyManager.undo();
            this.updateObjectCount();
            if (this.toolManager.activeToolName === 'select') this.toolManager.activeTool.updateOverlay();
            break;
          case 'redo':
            this.historyManager.redo();
            this.updateObjectCount();
            if (this.toolManager.activeToolName === 'select') this.toolManager.activeTool.updateOverlay();
            break;
          case 'select-all':
            this.selectTool('select');
            if (selectTool) selectTool.selectAll();
            break;
          case 'insert-sticky':
            this.insertStickyAt(svgPt);
            break;
          case 'insert-text':
            this.insertTextAt(svgPt);
            break;
          case 'insert-mindmap':
            this.insertMindMapRootAt(svgPt);
            break;
          case 'insert-table':
            this.insertTableAt(svgPt);
            break;
          case 'insert-frame':
            this.insertFrameAt(svgPt);
            break;
          case 'insert-image':
            document.getElementById('image-file-input')?.click();
            break;
          case 'template-mindmap':
            this.insertTemplate('mindmap', svgPt);
            break;
          case 'zoom-reset':
            this.camera.reset();
            break;
          case 'zoom-fit':
            this.camera.zoomToFit(this.objectManager.getAllObjects());
            break;
          case 'toggle-grid':
            this.cycleCanvasGrid();
            break;
          case 'toggle-fullscreen':
            this.toggleFullscreen();
            break;
        }
      }

      hideContextMenu() {
        const menu = document.getElementById('canvas-context-menu');
        if (menu && menu.style.display !== 'none') {
          menu.classList.remove('show');
          setTimeout(() => {
            if (!menu.classList.contains('show')) {
              menu.style.display = 'none';
            }
          }, 120);
        }
      }

      cycleCanvasGrid() {
        const styles = ['none', 'graph', 'dots', 'ruled'];
        const activeBoard = this.boardManager ? this.boardManager.getActiveBoard() : null;
        const curStyle = activeBoard ? (activeBoard.gridStyle || 'none') : 'none';
        const nextIdx = (styles.indexOf(curStyle) + 1) % styles.length;
        const nextStyle = styles[nextIdx];
        this.setCanvasGridStyle(nextStyle);
        const names = { none: 'Blank Canvas', graph: 'Graph Paper', dots: 'Dot Grid', ruled: 'Ruled Lines' };
        this.showToast('Grid: ' + (names[nextStyle] || nextStyle));
      }

      /* ==========================================================================
         CLIPBOARD & QUICK INSERTION LOGIC
         ========================================================================== */

      copySelection() {
        const selectTool = this.toolManager.tools.get('select');
        const selected = selectTool ? selectTool.getSelectedObjects() : [];
        if (selected.length === 0) return;

        this.clipboard = selected.map(o => JSON.parse(JSON.stringify(o)));

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(JSON.stringify({
              app: 'vector_whiteboard',
              objects: this.clipboard
            }));
          }
        } catch (e) {}

        this.showToast(`Copied ${selected.length} object${selected.length > 1 ? 's' : ''}`);
      }

      cutSelection() {
        const selectTool = this.toolManager.tools.get('select');
        const selected = selectTool ? selectTool.getSelectedObjects() : [];
        if (selected.length === 0) return;

        this.copySelection();
        if (selectTool) selectTool.deleteSelection();
      }

      async pasteObjects(targetPt) {
        let itemsToPaste = this.clipboard;

        if (!itemsToPaste || itemsToPaste.length === 0) {
          try {
            if (navigator.clipboard && navigator.clipboard.readText) {
              const text = await navigator.clipboard.readText();
              if (text) {
                const parsed = JSON.parse(text);
                if (parsed && parsed.app === 'vector_whiteboard' && Array.isArray(parsed.objects)) {
                  itemsToPaste = parsed.objects;
                }
              }
            }
          } catch (e) {}
        }

        if (!itemsToPaste || itemsToPaste.length === 0) {
          this.showToast('Clipboard is empty');
          return;
        }

        const oldBounds = MathUtils.getObjectsBounds(itemsToPaste);
        let dx = 24;
        let dy = 24;

        if (targetPt && oldBounds) {
          const oldCenterX = oldBounds.minX + oldBounds.width / 2;
          const oldCenterY = oldBounds.minY + oldBounds.height / 2;
          dx = targetPt.x - oldCenterX;
          dy = targetPt.y - oldCenterY;
        }

        const idMap = new Map();
        const groupMap = new Map();
        const pastedObjects = [];
        const baseTime = Date.now();

        // Pass 1: Clone and remap positions & IDs
        for (const orig of itemsToPaste) {
          const clone = JSON.parse(JSON.stringify(orig));
          const newId = (clone.type || 'obj') + '_' + baseTime + '_' + Math.random().toString(36).substr(2, 6);
          idMap.set(orig.id, newId);
          clone.id = newId;
          clone.createdAt = baseTime;

          if (clone.groupIds && Array.isArray(clone.groupIds)) {
            clone.groupIds = clone.groupIds.map(g => {
              if (!groupMap.has(g)) groupMap.set(g, 'group_' + baseTime + '_' + Math.random().toString(36).substring(2, 8));
              return groupMap.get(g);
            });
            clone.groupId = clone.groupIds[clone.groupIds.length - 1];
          } else if (clone.groupId) {
            if (!groupMap.has(clone.groupId)) groupMap.set(clone.groupId, 'group_' + baseTime + '_' + Math.random().toString(36).substring(2, 8));
            clone.groupId = groupMap.get(clone.groupId);
            clone.groupIds = [clone.groupId];
          }

          if (clone.type === 'stroke' || clone.type === 'calligraphy') {
            clone.points = clone.points.map(p => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure }));
            if (clone.type === 'calligraphy') {
              clone.pathData = StrokeManager.generateCalligraphyPathData(clone.points, clone.strokeWidth, clone.nibAngle);
            } else if (clone.type === 'stroke') {
              clone.pathData = StrokeManager.generatePathData(clone.points);

              clone.pathData = MathUtils.rebuildPathFromPoints(clone.points, false, !!clone.isSmooth);
            }
            clone.bounds = MathUtils.getBounds(clone.points);
          } else if (clone.type === 'line' || clone.type === 'arrow') {
            clone.x1 += dx; clone.y1 += dy;
            clone.x2 += dx; clone.y2 += dy;
            const cx = clone.cx !== undefined ? clone.cx : (clone.x1 + clone.x2) / 2;
            const cy = clone.cy !== undefined ? clone.cy : (clone.y1 + clone.y2) / 2;
            clone.cx = cx + dx;
            clone.cy = cy + dy;
            if (clone.elbowTracks) clone.elbowTracks = MathUtils.mapElbowTracks(clone, v => v + dx, v => v + dy);
            clone.bounds = MathUtils.getObjectBounds(clone);
          } else {
            clone.x += dx; clone.y += dy;
            if (clone.points && clone.points.length > 0) {
              clone.points = clone.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
              const isClosed = clone.type !== 'line' && clone.type !== 'arrow';
              clone.pathData = MathUtils.rebuildPathFromPoints(clone.points, isClosed, !!clone.isSmooth);
            } else if (clone.pathData) {
              clone.pathData = MathUtils.translatePathData(clone.pathData, dx, dy);
            }
            clone.bounds = MathUtils.getObjectBounds(clone);
          }

          pastedObjects.push(clone);
        }

        // Pass 2: Remap connector start / end bindings
        for (const obj of pastedObjects) {
          if (obj.startBinding && idMap.has(obj.startBinding.objectId)) {
            obj.startBinding.objectId = idMap.get(obj.startBinding.objectId);
          }
          if (obj.endBinding && idMap.has(obj.endBinding.objectId)) {
            obj.endBinding.objectId = idMap.get(obj.endBinding.objectId);
          }
        }

        const cmd = new AddObjectsCommand(this.objectManager, this.storageManager, this.renderer, pastedObjects);
        this.historyManager.execute(cmd);
        this.updateObjectCount();

        this.selectTool('select');
        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) {
          selectTool.selectedIds = new Set(pastedObjects.map(p => p.id));
          selectTool.updateOverlay();
          this.updateSelectionUI(pastedObjects);
        }

        this.showToast(`Pasted ${pastedObjects.length} object${pastedObjects.length > 1 ? 's' : ''}`);
      }

      insertStickyAt(pt) {
        const w = 180;
        const h = 180;
        const x = pt ? (pt.x - w / 2) : 100;
        const y = pt ? (pt.y - h / 2) : 100;
        const stickyTool = this.toolManager.tools.get('sticky');
        const fill = stickyTool ? (stickyTool.fill || '#fef08a') : '#fef08a';

        const newObj = {
          id: 'sticky_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'sticky',
          x, y, width: w, height: h,
          bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
          text: '',
          fill,
          opacity: 1,
          zIndex: this.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(this.objectManager, this.storageManager, this.renderer, newObj);
        this.historyManager.execute(cmd);
        this.updateObjectCount();

        this.selectTool('select');
        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) selectTool.selectObject(newObj.id, false);

        this.editObjectText(newObj);
        this.showToast('Inserted Sticky Note');
      }

      insertTextAt(pt) {
        const textTool = this.toolManager.tools.get('text');
        const stroke = textTool ? textTool.stroke : '#0f172a';
        const fontSize = textTool ? textTool.fontSize : 24;
        const fill = textTool ? textTool.fill : 'transparent';
        const x = pt ? pt.x : 100;
        const y = pt ? pt.y : 100;

        const newObj = {
          id: 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'text',
          x, y, width: 80, height: 30,
          bounds: { minX: x, minY: y, maxX: x + 80, maxY: y + 30, width: 80, height: 30 },
          text: 'Type text...',
          stroke,
          fill,
          fontSize,
          bold: textTool ? textTool.bold : false,
          italic: textTool ? textTool.italic : false,
          underline: textTool ? textTool.underline : false,
          opacity: 1,
          zIndex: this.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(this.objectManager, this.storageManager, this.renderer, newObj);
        this.historyManager.execute(cmd);
        this.updateObjectCount();

        this.selectTool('select');
        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) selectTool.selectObject(newObj.id, false);

        this.editObjectText(newObj);
      }

      insertMindMapRootAt(pt) {
        const width = 180;
        const height = 65;
        const x = pt ? (pt.x - width / 2) : 100;
        const y = pt ? (pt.y - height / 2) : 100;

        const rootNode = {
          id: 'mindmap_root_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          type: 'rectangle',
          x, y, width, height,
          text: 'Central Topic',
          fill: '#eff6ff',
          stroke: '#2563eb',
          strokeWidth: 2,
          patternStyle: 'solid',
          cornerStyle: 'rounded',
          cornerRadius: 12,
          opacity: 1,
          isMindMapNode: true,
          bounds: { minX: x, minY: y, maxX: x + width, maxY: y + height, width, height },
          zIndex: this.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(this.objectManager, this.storageManager, this.renderer, rootNode);
        this.historyManager.execute(cmd);
        this.updateObjectCount();

        this.selectTool('select');
        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) selectTool.selectObject(rootNode.id, false);
        this.editObjectText(rootNode);
        this.showToast('Inserted Central Topic Node');
      }

      insertTableAt(pt) {
        const w = 360;
        const h = 180;
        const x = pt ? (pt.x - w / 2) : 100;
        const y = pt ? (pt.y - h / 2) : 100;

        const newObj = {
          id: 'table_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'table',
          x, y, width: w, height: h,
          bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
          rows: 3,
          cols: 3,
          data: [
            ['Header 1', 'Header 2', 'Header 3'],
            ['Item 1', 'Item 2', 'Item 3'],
            ['Item 4', 'Item 5', 'Item 6']
          ],
          headerRow: true,
          fill: '#ffffff',
          stroke: '#0f172a',
          strokeWidth: 1.5,
          opacity: 1,
          zIndex: this.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(this.objectManager, this.storageManager, this.renderer, newObj);
        this.historyManager.execute(cmd);
        this.updateObjectCount();

        this.selectTool('select');
        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) selectTool.selectObject(newObj.id, false);
        this.showToast('Inserted Table');
      }

      insertFrameAt(pt) {
        const w = 600;
        const h = 400;
        const x = pt ? (pt.x - w / 2) : 100;
        const y = pt ? (pt.y - h / 2) : 100;
        const existingFrames = this.objectManager.getAllObjects().filter(o => o.type === 'frame');
        const autoTitle = `Frame ${existingFrames.length + 1}`;

        const newObj = {
          id: 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'frame',
          title: autoTitle,
          x, y, width: w, height: h,
          bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h },
          fill: 'rgba(59, 130, 246, 0.03)',
          stroke: '#3b82f6',
          strokeWidth: 2,
          strokeStyle: 'dashed',
          opacity: 1,
          zIndex: this.objectManager.count + 1,
          createdAt: Date.now()
        };

        const cmd = new AddObjectCommand(this.objectManager, this.storageManager, this.renderer, newObj);
        this.historyManager.execute(cmd);
        this.updateObjectCount();

        if (!this.frameOrder) this.frameOrder = [];
        if (!this.frameOrder.includes(newObj.id)) this.frameOrder.push(newObj.id);

        this.selectTool('select');
        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) selectTool.selectObject(newObj.id, false);
        this.showToast(`Created ${autoTitle}`);
      }

      removeEmbedLink(obj) {
        if (!obj) {
          const selectTool = this.toolManager.tools.get('select');
          const selected = selectTool ? selectTool.getSelectedObjects() : [];
          if (selected.length === 1) obj = selected[0];
        }
        if (obj && obj.link) {
          const oldState = [JSON.parse(JSON.stringify(obj))];
          delete obj.link;
          const newState = [JSON.parse(JSON.stringify(obj))];
          const cmd = new TransformObjectsCommand(this.objectManager, this.storageManager, this.renderer, oldState, newState);
          this.historyManager.execute(cmd);
          this.renderer.renderObject(obj);
          this.showToast('Link removed');
        }
      }

      exportSelectionSVG(selected) {
        const objects = (selected && selected.length > 0) ? selected : this.objectManager.getAllObjects();
        if (objects.length === 0) {
          this.showToast('No objects to export');
          return;
        }

        const svgContent = this.generateExportSVG(objects, { padding: 24 });
        if (!svgContent) {
          this.showToast('Failed to generate SVG');
          return;
        }

        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `onlinewhiteboard.org_selection_${Date.now()}.svg`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Exported selection SVG');
      }

      exportSelectionPNG(selected) {
        const objects = (selected && selected.length > 0) ? selected : this.objectManager.getAllObjects();
        if (objects.length === 0) {
          this.showToast('No objects to export');
          return;
        }

        const bounds = MathUtils.getObjectsBounds(objects);
        const padding = 24;
        const width = bounds.width + padding * 2;
        const height = bounds.height + padding * 2;
        const activeBoardId = this.boardManager ? this.boardManager.getActiveBoardId() : null;
        const canvasBg = (activeBoardId && this.boardManager) ? this.boardManager.getBoardCanvasColor(activeBoardId) : (SafeStorage.getItem('vector_board_canvas_color') || '#ffffff');

        const svgContent = this.generateExportSVG(objects, { padding, backgroundColor: canvasBg });
        if (!svgContent) {
          this.showToast('Failed to generate PNG');
          return;
        }

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const URLObj = window.URL || window.webkitURL || window;
        const imgURL = URLObj.createObjectURL(blob);

        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const scale = 2 * dpr;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = canvasBg;
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `onlinewhiteboard.org_selection_${Date.now()}.png`;
            a.click();
            URLObj.revokeObjectURL(imgURL);
            this.showToast('Exported selection PNG');
          } catch (err) {
            console.warn('Selection PNG export fallback:', err);
            URLObj.revokeObjectURL(imgURL);
            this.copySelectionSVGToClipboard(objects);
            this.showToast('Export fallback: SVG copied to clipboard');
          }
        };
        img.onerror = () => {
          URLObj.revokeObjectURL(imgURL);
          this.showToast('Failed to export selection PNG');
        };
        img.src = imgURL;
      }

      copySelectionSVGToClipboard(selected) {
        const objects = (selected && selected.length > 0) ? selected : (this.toolManager.tools.get('select')?.getSelectedObjects() || []);
        if (objects.length === 0) {
          this.showToast('No objects selected');
          return;
        }

        const svgContent = this.generateExportSVG(objects, { padding: 20, transparentBg: true });
        if (!svgContent) {
          this.showToast('Failed to copy SVG');
          return;
        }

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(svgContent);
            this.showToast('SVG markup copied to clipboard');
          }
        } catch (e) {
          this.showToast('Failed to copy to clipboard');
        }
      }

      copySelectionStyle(selected) {
        const objects = (selected && selected.length > 0) ? selected : (this.toolManager.tools.get('select')?.getSelectedObjects() || []);
        if (objects.length === 0) {
          this.showToast('Select an object to copy its style');
          return;
        }
        const source = objects[0];
        this.copiedStyle = {
          stroke: source.stroke,
          strokeWidth: source.strokeWidth,
          strokeStyle: source.strokeStyle,
          fill: source.fill,
          opacity: source.opacity !== undefined ? source.opacity : 1,
          fontSize: source.fontSize,
          fontFamily: source.fontFamily,
          textAlign: source.textAlign,
          cornerRadius: source.cornerRadius,
          roughness: source.roughness,
          arrowType: source.arrowType,
          tableTheme: source.tableTheme
        };
        this.showToast('Style copied to clipboard');
      }

      pasteSelectionStyle(selected) {
        if (!this.copiedStyle) {
          this.showToast('No style copied yet (Ctrl+Alt+C to copy style)');
          return;
        }
        const objects = (selected && selected.length > 0) ? selected : (this.toolManager.tools.get('select')?.getSelectedObjects() || []);
        if (objects.length === 0) {
          this.showToast('Select object(s) to paste style');
          return;
        }

        const oldState = objects.map(o => JSON.parse(JSON.stringify(o)));
        const style = this.copiedStyle;

        for (const obj of objects) {
          if (obj.locked) continue;
          if (style.stroke !== undefined && obj.stroke !== undefined) obj.stroke = style.stroke;
          if (style.strokeWidth !== undefined && obj.strokeWidth !== undefined) obj.strokeWidth = style.strokeWidth;
          if (style.strokeStyle !== undefined && obj.strokeStyle !== undefined) obj.strokeStyle = style.strokeStyle;
          if (style.fill !== undefined && obj.fill !== undefined) obj.fill = style.fill;
          if (style.opacity !== undefined && obj.opacity !== undefined) obj.opacity = style.opacity;
          if (style.fontSize !== undefined && obj.fontSize !== undefined) obj.fontSize = style.fontSize;
          if (style.fontFamily !== undefined && obj.fontFamily !== undefined) obj.fontFamily = style.fontFamily;
          if (style.textAlign !== undefined && obj.textAlign !== undefined) obj.textAlign = style.textAlign;
          if (style.cornerRadius !== undefined && obj.cornerRadius !== undefined) obj.cornerRadius = style.cornerRadius;
          if (style.roughness !== undefined && obj.roughness !== undefined) obj.roughness = style.roughness;
          if (style.arrowType !== undefined && (obj.type === 'arrow' || obj.arrowType !== undefined)) obj.arrowType = style.arrowType;
          if (style.tableTheme !== undefined && obj.type === 'table') obj.tableTheme = style.tableTheme;
        }

        const newState = objects.map(o => JSON.parse(JSON.stringify(o)));
        const cmd = new TransformObjectsCommand(
          this.objectManager,
          this.storageManager,
          this.renderer,
          oldState,
          newState
        );
        this.historyManager.execute(cmd);
        const selectTool = this.toolManager.tools.get('select');
        if (selectTool) selectTool.updateOverlay();
        this.showToast(`Applied style to ${objects.length} item${objects.length > 1 ? 's' : ''}`);
      }

      exportSelectionPDF(selected) {
        const objects = (selected && selected.length > 0) ? selected : this.objectManager.getAllObjects();
        if (objects.length === 0) {
          this.showToast('No objects to export');
          return;
        }

        this.showToast('Generating selection PDF...');

        const bounds = MathUtils.getObjectsBounds(objects);
        const padding = 24;
        const width = bounds.width + padding * 2;
        const height = bounds.height + padding * 2;
        const activeBoardId = this.boardManager ? this.boardManager.getActiveBoardId() : null;
        const canvasBg = (activeBoardId && this.boardManager) ? this.boardManager.getBoardCanvasColor(activeBoardId) : (SafeStorage.getItem('vector_board_canvas_color') || '#ffffff');

        const svgContent = this.generateExportSVG(objects, { padding, backgroundColor: canvasBg });
        if (!svgContent) {
          this.showToast('Failed to generate selection PDF');
          return;
        }

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const URLObj = window.URL || window.webkitURL || window;
        const imgURL = URLObj.createObjectURL(blob);

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const scale = 2 * dpr;
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext('2d');
          ctx.scale(scale, scale);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = canvasBg;
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          try {
            const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || (typeof window.jspdf === 'function' ? window.jspdf : null));
            const imgData = canvas.toDataURL('image/png');
            if (jsPDFClass) {
              const orientation = width > height ? 'l' : 'p';
              const pdf = new jsPDFClass(orientation, 'pt', [width, height]);
              pdf.addImage(imgData, 'PNG', 0, 0, width, height);
              pdf.save(`onlinewhiteboard.org_selection_${Date.now()}.pdf`);
              URLObj.revokeObjectURL(imgURL);
              this.showToast('Selection PDF Exported!');
            } else {
              // Fallback: open print dialog
              URLObj.revokeObjectURL(imgURL);
              const printWin = window.open('', '_blank');
              if (printWin) {
                printWin.document.write(`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <title>Whiteboard PDF Export</title>
                      <style>
                        @page { size: auto; margin: 0mm; }
                        body { margin: 0; display: flex; justify-content: center; align-items: center; background: #ffffff; }
                        img { max-width: 100%; height: auto; display: block; }
                      </style>
                    </head>
                    <body>
                      <img src="${imgData}" onload="window.print(); setTimeout(() => window.close(), 500);" />
                    </body>
                  </html>
                `);
                printWin.document.close();
                this.showToast('PDF library unavailable — use Print → Save as PDF');
              } else {
                this.showToast('Export failed: Please allow popups for PDF export');
              }
            }
          } catch (err) {
            console.error('Selection PDF export failed:', err);
            this.showToast('Selection PDF Export failed');
            URLObj.revokeObjectURL(imgURL);
          }
        };
        img.onerror = () => {
          URLObj.revokeObjectURL(imgURL);
          this.showToast('Selection PDF Export failed');
        };
        img.src = imgURL;
      }
    }

    // Launch Application
    window.addEventListener('DOMContentLoaded', () => {
      window.app = new WhiteboardApp();

      // Floating Tooltip Instance
      const floatingTooltip = document.createElement('div');
      floatingTooltip.id = 'floating-tooltip';
      document.body.appendChild(floatingTooltip);

      let suppressTooltipUntil = 0;

      const hideTooltip = () => {
        floatingTooltip.classList.remove('show');
      };

      document.addEventListener('mouseover', (e) => {
        if (Date.now() < suppressTooltipUntil) return;
        const btn = e.target.closest('[data-tooltip]');
        if (btn) {
          const text = btn.getAttribute('data-tooltip');
          if (text) {
            floatingTooltip.textContent = text;
            const rect = btn.getBoundingClientRect();
            if (rect.bottom + 36 > window.innerHeight) {
              floatingTooltip.style.top = `${Math.max(8, rect.top - 32)}px`;
            } else {
              floatingTooltip.style.top = `${rect.bottom + 8}px`;
            }
            floatingTooltip.style.left = `${rect.left + rect.width / 2}px`;
            floatingTooltip.classList.add('show');
          }
        }
      });

      document.addEventListener('mouseout', (e) => {
        const btn = e.target.closest('[data-tooltip]');
        if (btn) {
          hideTooltip();
        }
      });

      document.addEventListener('scroll', () => {
        suppressTooltipUntil = Date.now() + 250;
        hideTooltip();
      }, true);

      // Main Toolbar Horizontal Scroll (Wheel & Drag)
      const mainToolbar = document.getElementById('main-toolbar');
      if (mainToolbar) {
        mainToolbar.addEventListener('wheel', (e) => {
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (delta !== 0) {
            e.preventDefault();
            mainToolbar.scrollLeft += delta;
            suppressTooltipUntil = Date.now() + 250;
            hideTooltip();
          }
        }, { passive: false });

        mainToolbar.addEventListener('scroll', () => {
          suppressTooltipUntil = Date.now() + 250;
          hideTooltip();
        }, { passive: true });

        let isDraggingToolbar = false;
        let startX = 0;
        let startScrollLeft = 0;

        mainToolbar.addEventListener('mousedown', (e) => {
          if (e.target === mainToolbar || e.target.classList.contains('toolbar-divider')) {
            isDraggingToolbar = true;
            startX = e.pageX - mainToolbar.offsetLeft;
            startScrollLeft = mainToolbar.scrollLeft;
            mainToolbar.style.cursor = 'grabbing';
            suppressTooltipUntil = Date.now() + 250;
            hideTooltip();
          }
        });

        window.addEventListener('mouseup', () => {
          if (isDraggingToolbar) {
            isDraggingToolbar = false;
            if (mainToolbar) mainToolbar.style.cursor = '';
          }
        });

        mainToolbar.addEventListener('mousemove', (e) => {
          if (!isDraggingToolbar) return;
          e.preventDefault();
          const x = e.pageX - mainToolbar.offsetLeft;
          const walk = (x - startX) * 1.5;
          mainToolbar.scrollLeft = startScrollLeft - walk;
          suppressTooltipUntil = Date.now() + 250;
          hideTooltip();
        });
      }

      // Property Panel Horizontal Scroll (Wheel & Drag) — mirrors mainToolbar handler
      const propPanel = document.getElementById('property-panel');
      if (propPanel) {
        propPanel.addEventListener('wheel', (e) => {
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (delta !== 0) {
            e.preventDefault();
            e.stopPropagation();
            propPanel.scrollLeft += delta;
          }
        }, { passive: false });

        propPanel.addEventListener('scroll', () => {
          suppressTooltipUntil = Date.now() + 250;
          hideTooltip();
        }, { passive: true });

        let isDraggingProp = false;
        let propStartX = 0;
        let propStartScrollLeft = 0;

        propPanel.addEventListener('mousedown', (e) => {
          if (e.target === propPanel || e.target.classList.contains('property-group') || e.target.classList.contains('property-divider')) {
            isDraggingProp = true;
            propStartX = e.pageX - propPanel.offsetLeft;
            propStartScrollLeft = propPanel.scrollLeft;
            propPanel.style.cursor = 'grabbing';
          }
        });

        window.addEventListener('mouseup', () => {
          if (isDraggingProp) {
            isDraggingProp = false;
            if (propPanel) propPanel.style.cursor = '';
          }
        });

        propPanel.addEventListener('mousemove', (e) => {
          if (!isDraggingProp) return;
          e.preventDefault();
          const x = e.pageX - propPanel.offsetLeft;
          const walk = (x - propStartX) * 1.5;
          propPanel.scrollLeft = propStartScrollLeft - walk;
        });

        // Touch scroll support for mobile/tablet
        let propTouchStartX = 0;
        let propTouchScrollLeft = 0;
        propPanel.addEventListener('touchstart', (e) => {
          propTouchStartX = e.touches[0].clientX;
          propTouchScrollLeft = propPanel.scrollLeft;
        }, { passive: true });
        propPanel.addEventListener('touchmove', (e) => {
          const dx = propTouchStartX - e.touches[0].clientX;
          propPanel.scrollLeft = propTouchScrollLeft + dx;
        }, { passive: true });
      }
    });

/* ── Touch/Scroll Prevention ── */
    /* ── Prevent canvas interactions from scrolling the page ── *
     *
     * CRITICAL: We must NOT call preventDefault on touch events that
     * originate inside the toolbar, property panel, or any other
     * horizontally-scrollable UI panel — doing so freezes their
     * horizontal swipe scroll on iOS and Android.
     *
     * Strategy:
     *   - On touchstart, record whether the touch began on the raw
     *     SVG canvas (svgStage) or on a UI panel.
     *   - On touchmove, only preventDefault when the touch is on the
     *     canvas. Let the browser handle panel touches natively so
     *     overflow-x:auto scroll works on every device.
     *   - Wheel events on the canvas still always preventDefault to
     *     prevent page scroll while zooming/panning with a trackpad.
     */
    (function () {
      const container = document.getElementById('app-container');
      const svgStage  = document.getElementById('svg-stage');
      if (!container) return;

      /* Elements whose touch events must NEVER be cancelled.
         Any element that has overflow-x:auto / scroll must be listed
         here (or be a descendant of one of these IDs).             */
      const SCROLL_ROOTS = ['main-toolbar', 'property-panel'];

      function isTouchOnScrollableUI(target) {
        if (!target) return false;
        for (var i = 0; i < SCROLL_ROOTS.length; i++) {
          var el = document.getElementById(SCROLL_ROOTS[i]);
          if (el && el.contains(target)) return true;
        }
        /* Also spare any .glass-panel (dropdowns, popovers) and modal */
        if (target.closest &&
            (target.closest('.glass-panel') ||
             target.closest('.modal-overlay') ||
             target.closest('.shapes-dropdown-popover') ||
             target.closest('.boards-dropdown') ||
             target.closest('#brand-header') ||
             target.closest('#workspace-panel'))) {
          return true;
        }
        return false;
      }

      /* Track whether the current touch sequence started on the canvas
         vs a UI panel. Reset on every touchstart.                    */
      var touchOnCanvas = false;

      container.addEventListener('touchstart', function (e) {
        touchOnCanvas = !isTouchOnScrollableUI(e.target);
      }, { passive: true });

      container.addEventListener('touchmove', function (e) {
        /* Only suppress page scroll when genuinely drawing on canvas.
           Never preventDefault when the gemini text editor foreignObject is
           active — doing so prevents the virtual keyboard from appearing on
           mobile browsers.                                                  */
        if (touchOnCanvas) {
          var fo = document.getElementById('gemini-fo-editor');
          if (fo && fo.contains(e.target)) return;
          e.preventDefault();
        }
        /* If touch is on a scrollable panel, do nothing — let the
           browser scroll the panel horizontally as normal.          */
      }, { passive: false });

      container.addEventListener('touchend',    function () { touchOnCanvas = false; }, { passive: true });
      container.addEventListener('touchcancel', function () { touchOnCanvas = false }, { passive: true });

      /* Wheel: always block on canvas area to prevent page scroll
         while the user zooms or pans with a trackpad / mouse wheel. */
      container.addEventListener('wheel', function (e) {
        /* Allow wheel to scroll UI panels (toolbar, property panel)  */
        if (isTouchOnScrollableUI(e.target)) return;
        e.preventDefault();
      }, { passive: false });

    })();

    /* ── Sidebar toggle ── */
    (function () {
      const sidebar = document.getElementById('right-sidebar');
      const btn = document.getElementById('sidebar-toggle-btn');
      const icon = document.getElementById('sidebar-toggle-icon');

      const CHEVRON_RIGHT = '<polyline points="9 18 15 12 9 6"/>';
      const CHEVRON_LEFT  = '<polyline points="15 18 9 12 15 6"/>';

      let isOpen = true;

      function updateState() {
        if (isOpen) {
          sidebar.classList.remove('collapsed');
          btn.classList.add('sidebar-open');
          icon.innerHTML = CHEVRON_RIGHT;
          btn.setAttribute('title', 'Close sidebar');
        } else {
          sidebar.classList.add('collapsed');
          btn.classList.remove('sidebar-open');
          icon.innerHTML = CHEVRON_LEFT;
          btn.setAttribute('title', 'Open sidebar');
        }
      }

      btn.addEventListener('click', () => {
        isOpen = !isOpen;
        updateState();
      });

      updateState();
    })();

/* ── Mobile Navigation ── */
    // Mobile navigation — hamburger toggle (matches did.html)
    (function() {
      const btn = document.getElementById('hamburger-btn');
      const nav = document.getElementById('mob-nav');
      const closeBtn = document.getElementById('mob-nav-close');
      if (!btn || !nav) return;

      function openNav() {
        nav.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
      }
      function closeNav() {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }

      btn.addEventListener('click', function() {
        nav.classList.contains('open') ? closeNav() : openNav();
      });
      if (closeBtn) closeBtn.addEventListener('click', closeNav);

      // Close on overlay click (outside nav links)
      nav.addEventListener('click', function(e) {
        if (e.target === nav) closeNav();
      });

      // Close on Escape key
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && nav.classList.contains('open')) closeNav();
      });

      // Close nav when any link is tapped
      nav.querySelectorAll('a').forEach(function(a) {
        a.addEventListener('click', closeNav);
      });
    })();

/* ── Permanent Canvas Watermark (onlinewhiteboard.org) ── */
    (function () {
      const WATERMARK_TEXT = 'onlinewhiteboard.org';

      function injectWatermark() {
        // Always append to body so overflow:hidden on #app-container doesn't clip it
        const host = document.body;
        if (!host || document.getElementById('canvas-watermark')) return;

        const mark = document.createElement('div');
        mark.id = 'canvas-watermark';
        mark.textContent = WATERMARK_TEXT;
        Object.assign(mark.style, {
          position: 'fixed',
          right: '14px',
          bottom: '10px',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: '13px',
          fontWeight: '500',
          letterSpacing: '0.02em',
          color: 'rgba(100, 116, 139, 0.35)', // light grey
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: '2147483647',
          whiteSpace: 'nowrap'
        });

        host.appendChild(mark);

        // Guard against removal/tampering: re-attach if it ever disappears
        const observer = new MutationObserver(function () {
          if (!document.getElementById('canvas-watermark')) {
            injectWatermark();
          }
        });
        observer.observe(host, { childList: true });
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectWatermark);
      } else {
        injectWatermark();
      }
    })();

    /* ==========================================================================
       SELF-DESTRUCTION MODULE
       --------------------------------------------------------------------------
       Provides a controlled teardown of the whiteboard application.

       Public API (available as window.AppSelfDestruct):
         AppSelfDestruct.arm(options)   – configure & arm the destruct sequence
         AppSelfDestruct.trigger()      – manually fire destruction immediately
         AppSelfDestruct.disarm()       – cancel any armed timer / conditions
         AppSelfDestruct.status()       – returns current armed state info

       Options for arm():
         delayMs      {number}   – destroy after N milliseconds (0 = immediate)
         maxSessions  {number}   – destroy after this many page-load sessions
         expiresAt    {Date|string} – destroy when this UTC timestamp is reached
         onDestroyed  {Function} – callback fired after teardown completes
         wipeStorage  {boolean}  – clear all localStorage keys (default: true)
         removeDOM    {boolean}  – remove #app-container from DOM (default: false)
         showMessage  {string}   – optional message shown in place of the app

       All options are optional and combinable. The first condition that fires
       wins; the others are automatically disarmed.
       ========================================================================== */
    (function () {
      'use strict';

      // ── Storage keys managed by this app ──────────────────────────────────────
      const OWN_STORAGE_KEYS = [
        'ow-property-panel-layout',
        'ow-whiteboard-shapes',
        'ow-whiteboard-viewport',
        'ow-whiteboard-theme',
        'ow-whiteboard-prefs',
        'ow-undo-stack',
        'ow-redo-stack',
        'ow-active-board',
        'ow-board-list',
      ];

      // ── Internal state ────────────────────────────────────────────────────────
      let _armed       = false;
      let _timer       = null;
      let _expiryTimer = null;
      let _options     = {};
      let _sessionKey  = 'ow-sd-sessions';

      // ── Helpers ───────────────────────────────────────────────────────────────

      /**
       * Wipe every localStorage key belonging to this application.
       * Falls back silently if localStorage is unavailable.
       */
      function _wipeStorage() {
        OWN_STORAGE_KEYS.forEach(function (k) {
          try { localStorage.removeItem(k); } catch (_) {}
        });
        // Also clear the session counter itself
        try { localStorage.removeItem(_sessionKey); } catch (_) {}
      }

      /**
       * Clear the live SVG canvas — removes all drawn shapes from the stage
       * without removing the SVG element itself, leaving a blank board.
       */
      function _clearCanvas() {
        const stage = document.getElementById('svg-stage');
        if (!stage) return;
        // Remove every child that is not a <defs> block (keep gradients/filters)
        Array.from(stage.childNodes).forEach(function (node) {
          if (node.nodeName !== 'defs') stage.removeChild(node);
        });
      }

      /**
       * Tear down global event listeners registered by the engine.
       * Replaces the container with a shallow clone, which drops all
       * addEventListener bindings without needing explicit references.
       */
      function _teardownListeners() {
        const container = document.getElementById('app-container');
        if (container && container.parentNode) {
          const clone = container.cloneNode(false); // shallow — no children
          container.parentNode.replaceChild(clone, container);
        }
      }

      /**
       * Remove the entire application container from the DOM.
       */
      function _removeDOM() {
        const container = document.getElementById('app-container');
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
        // Also remove watermark
        const wm = document.getElementById('canvas-watermark');
        if (wm && wm.parentNode) wm.parentNode.removeChild(wm);
      }

      /**
       * Render a replacement message in place of the app.
       */
      function _showMessage(msg) {
        const existing = document.getElementById('app-container');
        const host = (existing && existing.parentNode) || document.body;
        const el = document.createElement('div');
        el.id = 'app-destroyed-notice';
        Object.assign(el.style, {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100%',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: '18px',
          color: '#64748b',
          background: '#f8fafc',
          textAlign: 'center',
          padding: '32px',
          boxSizing: 'border-box',
        });
        el.innerHTML = '<div>' + String(msg).replace(/</g, '&lt;') + '</div>';
        host.appendChild(el);
      }

      // ── Core destruction sequence ─────────────────────────────────────────────

      /**
       * Execute the full teardown. Safe to call multiple times — subsequent
       * calls are no-ops once destruction has already run.
       */
      let _destroyed = false;
      function _execute() {
        if (_destroyed) return;
        _destroyed = true;

        // Cancel any pending timers first (inline — avoids referencing
        // AppSelfDestruct before its const declaration is reached)
        if (_timer)       { clearTimeout(_timer);       _timer       = null; }
        if (_expiryTimer) { clearTimeout(_expiryTimer); _expiryTimer = null; }
        _armed = false;

        // 1. Clear all drawn content from the canvas
        _clearCanvas();

        // 2. Tear down event listeners by cloning the container
        _teardownListeners();

        // 3. Wipe localStorage if requested (default: true)
        if (_options.wipeStorage !== false) {
          _wipeStorage();
        }

        // 4. Remove the app DOM entirely if requested
        if (_options.removeDOM === true) {
          _removeDOM();
        }

        // 5. Show replacement message if provided
        if (_options.showMessage) {
          _showMessage(_options.showMessage);
        }

        // 6. Fire user callback
        if (typeof _options.onDestroyed === 'function') {
          try { _options.onDestroyed(); } catch (_) {}
        }

        console.info('[AppSelfDestruct] Teardown complete.');
      }

      // ── Session counter logic ─────────────────────────────────────────────────

      function _checkSessionLimit(maxSessions) {
        let count = 0;
        try { count = parseInt(localStorage.getItem(_sessionKey) || '0', 10) || 0; } catch (_) {}
        count += 1;
        try { localStorage.setItem(_sessionKey, String(count)); } catch (_) {}
        if (count >= maxSessions) {
          console.info('[AppSelfDestruct] Session limit reached (' + count + '/' + maxSessions + ').');
          _execute();
          return true;
        }
        return false;
      }

      // ── Expiry timer logic ────────────────────────────────────────────────────

      function _scheduleExpiry(expiresAt) {
        const target = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
        const msUntil = target.getTime() - Date.now();
        if (msUntil <= 0) {
          console.info('[AppSelfDestruct] expiresAt is in the past — triggering immediately.');
          _execute();
          return;
        }
        console.info('[AppSelfDestruct] Will self-destruct at ' + target.toISOString() + ' (in ' + Math.round(msUntil / 1000) + 's).');
        _expiryTimer = setTimeout(_execute, msUntil);
      }

      // ── Public API ────────────────────────────────────────────────────────────

      const AppSelfDestruct = {

        /**
         * Arm the self-destruction sequence with the given options.
         * Can only be armed once; call disarm() first to re-arm.
         *
         * @param {object} opts
         * @param {number}        [opts.delayMs]      destroy after N ms
         * @param {number}        [opts.maxSessions]  destroy after N total loads
         * @param {Date|string}   [opts.expiresAt]    destroy at this UTC time
         * @param {boolean}       [opts.wipeStorage]  clear app localStorage (default true)
         * @param {boolean}       [opts.removeDOM]    remove app container from DOM
         * @param {string}        [opts.showMessage]  message shown after destruction
         * @param {Function}      [opts.onDestroyed]  callback after teardown
         */
        arm(opts) {
          if (_armed) {
            console.warn('[AppSelfDestruct] Already armed. Call disarm() first.');
            return this;
          }
          _options = Object.assign({}, opts || {});
          _armed   = true;
          _destroyed = false;

          // ── Condition: fixed delay ──────────────────────────────────────────
          if (typeof _options.delayMs === 'number') {
            if (_options.delayMs <= 0) {
              console.info('[AppSelfDestruct] delayMs ≤ 0 — triggering immediately.');
              _execute();
              return this;
            }
            console.info('[AppSelfDestruct] Armed with delay of ' + _options.delayMs + 'ms.');
            _timer = setTimeout(_execute, _options.delayMs);
          }

          // ── Condition: session limit ────────────────────────────────────────
          if (typeof _options.maxSessions === 'number' && _options.maxSessions > 0) {
            _checkSessionLimit(_options.maxSessions);
          }

          // ── Condition: expiry timestamp ────────────────────────────────────
          if (_options.expiresAt) {
            _scheduleExpiry(_options.expiresAt);
          }

          return this;
        },

        /** Fire destruction immediately, regardless of armed state. */
        trigger() {
          _armed = true;
          _execute();
          return this;
        },

        /** Cancel any pending timers and disarm. Does not undo a completed destruction. */
        disarm() {
          _armed = false;
          if (_timer)       { clearTimeout(_timer);       _timer       = null; }
          if (_expiryTimer) { clearTimeout(_expiryTimer); _expiryTimer = null; }
          return this;
        },

        /** Returns a snapshot of the current armed state. */
        status() {
          return {
            armed:     _armed,
            destroyed: _destroyed,
            options:   Object.assign({}, _options),
          };
        },
      };

      // Expose globally
      window.AppSelfDestruct = AppSelfDestruct;

      console.info('[AppSelfDestruct] Module loaded. Call AppSelfDestruct.arm(options) to configure.');

    })();