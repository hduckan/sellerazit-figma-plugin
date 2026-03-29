/**
 * 셀러들의 아지트 디자이너 — HTML to Figma 플러그인 v3
 * HTML DOM 트리를 재귀적으로 순회하여 Figma 노드 트리로 변환합니다.
 * grid/flex 레이아웃 → Figma Auto Layout 변환 지원.
 */

figma.showUI(__html__, { width: 480, height: 620 });

figma.ui.onmessage = async function(msg) {
  if (msg.type === "import-html") {
    await handleHtmlImport(msg.html, msg.title);
  }
  if (msg.type === "close") {
    figma.closePlugin();
  }
};

async function handleHtmlImport(html, title) {
  try {
    progress("폰트 로딩 중...", 5);
    var fonts = [
      { family: "Inter", style: "Regular" },
      { family: "Inter", style: "Medium" },
      { family: "Inter", style: "Semi Bold" },
      { family: "Inter", style: "Bold" },
    ];
    for (var i = 0; i < fonts.length; i++) {
      try { await figma.loadFontAsync(fonts[i]); } catch (e) { /* skip */ }
    }

    progress("HTML 파싱 중...", 10);

    // 전역 CSS 클래스 파싱
    parseGlobalStyles(html);

    // 캔버스 너비 추출
    var canvasWidth = 860;
    var wm = html.match(/width\s*:\s*(\d+)\s*px/);
    if (wm) canvasWidth = parseInt(wm[1]);

    // 섹션 분리
    var sectionHtmls = html.split(/(?=<div[^>]*data-section-type)/i);
    var sections = [];
    for (var i = 0; i < sectionHtmls.length; i++) {
      var s = sectionHtmls[i].trim();
      if (s && s.match(/data-section-type/)) sections.push(s);
    }

    if (sections.length === 0) {
      figma.notify("섹션을 찾을 수 없습니다.", { error: true });
      figma.ui.postMessage({ type: "fail", message: "data-section-type 속성이 있는 섹션을 찾을 수 없습니다." });
      return;
    }

    // 최상위 프레임
    var root = figma.createFrame();
    root.name = title || "상세페이지";
    root.resize(canvasWidth, 100);
    root.layoutMode = "VERTICAL";
    root.primaryAxisSizingMode = "AUTO";
    root.counterAxisSizingMode = "FIXED";
    root.fills = [solid("#FFFFFF")];

    for (var s = 0; s < sections.length; s++) {
      progress("섹션 " + (s+1) + "/" + sections.length, Math.round(15 + (s/sections.length)*80));
      var sectionNode = await htmlToFigmaNode(sections[s], canvasWidth);
      if (sectionNode) root.appendChild(sectionNode);
    }

    figma.currentPage.appendChild(root);
    figma.viewport.scrollAndZoomIntoView([root]);
    progress("완료!", 100);
    figma.notify(sections.length + "개 섹션 생성 완료!");
    figma.ui.postMessage({ type: "done", count: sections.length });
  } catch (err) {
    figma.notify("생성 실패: " + err.message, { error: true });
    figma.ui.postMessage({ type: "fail", message: err.message });
  }
}

// ── 핵심: HTML → Figma 노드 변환 (재귀) ──

// 전역 CSS 클래스 맵 (<style> 블록에서 추출)
var globalClasses = {};

function parseGlobalStyles(html) {
  var styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!styleMatch) return;
  var css = styleMatch[1];
  var ruleRe = /\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g;
  var m;
  while ((m = ruleRe.exec(css)) !== null) {
    globalClasses[m[1]] = parseStyleString(m[2]);
  }
}

function mergeClassStyles(attrs, inlineStyle) {
  var classMatch = attrs.match(/class="([^"]*)"/);
  if (!classMatch) return inlineStyle;
  var classes = classMatch[1].split(/\s+/);
  var merged = {};
  for (var i = 0; i < classes.length; i++) {
    var cls = globalClasses[classes[i]];
    if (cls) {
      for (var k in cls) merged[k] = cls[k];
    }
  }
  // 인라인 스타일이 클래스보다 우선
  for (var k in inlineStyle) merged[k] = inlineStyle[k];
  return merged;
}

function parseStyleString(str) {
  var styles = {};
  var parts = str.split(";");
  for (var i = 0; i < parts.length; i++) {
    var ci = parts[i].indexOf(":");
    if (ci === -1) continue;
    var k = parts[i].substring(0, ci).trim().toLowerCase();
    var v = parts[i].substring(ci+1).trim();
    if (k && v) styles[k] = v;
  }
  return styles;
}

async function htmlToFigmaNode(html, parentWidth) {
  // 현재 태그 정보 추출
  var tagMatch = html.match(/^<(\w+)([^>]*)>/);
  if (!tagMatch) return null;

  var tag = tagMatch[1].toLowerCase();
  var attrs = tagMatch[2] || "";
  var inlineStyle = parseStyleAttr(attrs);
  var style = mergeClassStyles(attrs, inlineStyle);

  // 무시할 태그
  if (attrs.indexOf("data-element-toolbar") !== -1) return null;
  if (attrs.indexOf("data-resize-handle") !== -1) return null;
  if (attrs.indexOf("data-img-selection") !== -1) return null;

  // <img> 태그
  if (tag === "img") {
    return await buildImgNode(attrs, style, parentWidth);
  }

  // <hr> 태그
  if (tag === "hr") {
    var hr = figma.createRectangle();
    hr.name = "구분선";
    hr.resize(parentWidth, 1);
    hr.fills = [solid(getColor(style, "border-top-color") || getColor(style, "border-color") || "#E5E7EB")];
    return hr;
  }

  // 자식 HTML 추출
  var innerHtml = extractInnerHtml(html, tag);
  var directText = getDirectText(innerHtml);
  var childTags = splitChildTags(innerHtml);

  // 텍스트 전용 요소 (자식 태그 없이 텍스트만)
  // <style> 태그 건너뛰기
  if (tag === "style" || tag === "script" || tag === "br") return null;

  var textTags = ["h1","h2","h3","h4","h5","h6","p","span","strong","em","li","blockquote","a"];
  if (textTags.indexOf(tag) !== -1 && childTags.length === 0 && directText) {
    return buildTextNode(directText, tag, style, parentWidth);
  }

  // 텍스트 태그인데 자식에 inline 요소만 있으면 전체 텍스트 추출
  if (textTags.indexOf(tag) !== -1 && directText) {
    var fullText = stripTags(innerHtml).trim();
    if (fullText && fullText !== "⠿") {
      return buildTextNode(fullText, tag, style, parentWidth);
    }
  }

  // 컨테이너 요소 (div, section, header, nav, footer 등)
  if (childTags.length === 0 && directText) {
    // 자식 없는 div에 텍스트만 있으면 텍스트 노드
    return buildTextNode(directText, tag, style, parentWidth);
  }

  if (childTags.length === 0) return null;

  // 프레임 생성
  var frame = figma.createFrame();
  frame.name = style["data-section-type"] || getAttr(attrs, "data-section-type") || tag;

  // 너비 결정
  var w = getNum(style, "width") || parentWidth;
  if (style["width"]) {
    var pctMatch = style["width"].match(/(\d+)%/);
    if (pctMatch) w = Math.round(parentWidth * parseInt(pctMatch[1]) / 100);
    if (style["width"].indexOf("100%") !== -1) w = parentWidth;
  }
  w = Math.min(w, parentWidth);
  frame.resize(w, 10);

  // 배경색
  var bg = getColor(style, "background-color") || getColor(style, "background");
  if (bg) {
    frame.fills = [solid(bg)];
  } else {
    frame.fills = [];
  }

  // 레이아웃 모드 결정
  var display = style["display"] || "";
  var gridCols = style["grid-template-columns"] || "";
  var flexDir = style["flex-direction"] || "";

  if (display.indexOf("grid") !== -1 && gridCols) {
    // Grid → HORIZONTAL Auto Layout
    frame.layoutMode = "HORIZONTAL";
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "AUTO";
    frame.layoutWrap = "WRAP";
    var gap = getNum(style, "gap") || getNum(style, "column-gap") || 16;
    frame.itemSpacing = gap;
  } else if (display.indexOf("flex") !== -1 && (flexDir === "row" || flexDir === "row-reverse" || !flexDir || flexDir === "")) {
    // Flex row → HORIZONTAL
    frame.layoutMode = "HORIZONTAL";
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "AUTO";
    var gap = getNum(style, "gap") || 16;
    frame.itemSpacing = gap;

    // align-items
    var alignItems = style["align-items"] || "";
    if (alignItems === "center") frame.counterAxisAlignItems = "CENTER";

    // flex:1 자식 개수 세서 균등 분배
    var flexChildCount = 0;
    for (var fi = 0; fi < childTags.length; fi++) {
      var fAttrs = childTags[fi].match(/style="([^"]*)"/);
      if (fAttrs && fAttrs[1].indexOf("flex") !== -1) flexChildCount++;
    }
    if (flexChildCount >= 2) colCount = flexChildCount;
  } else {
    // 기본 VERTICAL
    frame.layoutMode = "VERTICAL";
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "FIXED";
    var gap = getNum(style, "gap") || getNum(style, "row-gap") || 12;
    frame.itemSpacing = gap;
  }

  // 패딩
  var pt = getNum(style, "padding-top") || getNum(style, "padding") || 0;
  var pr = getNum(style, "padding-right") || getNum(style, "padding") || 0;
  var pb = getNum(style, "padding-bottom") || getNum(style, "padding") || 0;
  var pl = getNum(style, "padding-left") || getNum(style, "padding") || 0;
  frame.paddingTop = pt;
  frame.paddingRight = pr;
  frame.paddingBottom = pb;
  frame.paddingLeft = pl;

  // border-radius
  var br = getNum(style, "border-radius");
  if (br) frame.cornerRadius = br;

  // 자식 너비 계산
  var contentWidth = w - pl - pr;
  var colCount = 1;
  if (gridCols) {
    // grid-template-columns: 1fr 1fr 또는 repeat(2, 1fr) 등
    var frMatch = gridCols.match(/(\d+)fr/g);
    var pxMatch = gridCols.match(/(\d+)px/g);
    if (frMatch) colCount = frMatch.length;
    else if (pxMatch) colCount = pxMatch.length;
    var repeatMatch = gridCols.match(/repeat\((\d+)/);
    if (repeatMatch) colCount = parseInt(repeatMatch[1]);
  }
  var childWidth = colCount > 1 ? Math.floor((contentWidth - (colCount-1) * (getNum(style,"gap")||16)) / colCount) : contentWidth;

  // flex-direction: row-reverse → 자식 순서 반전
  var orderedChildren = childTags.slice();
  if (flexDir === "row-reverse") orderedChildren.reverse();

  // 자식 노드 생성
  for (var c = 0; c < orderedChildren.length; c++) {
    var childNode = await htmlToFigmaNode(orderedChildren[c], childWidth);
    if (childNode) {
      // grid/flex 자식 너비 설정
      if (colCount > 1 && childNode.resize) {
        try { childNode.resize(childWidth, childNode.height); } catch(e) { /* skip */ }
      }
      frame.appendChild(childNode);
    }
  }

  return frame;
}

// ── 이미지 노드 ──

async function buildImgNode(attrs, style, parentWidth) {
  var src = getAttr(attrs, "src");
  if (!src) return null;

  var w = getNum(style, "width") || parentWidth;
  // 퍼센트 너비 처리
  if (style["width"]) {
    var pctMatch = style["width"].match(/(\d+)%/);
    if (pctMatch) w = Math.round(parentWidth * parseInt(pctMatch[1]) / 100);
    if (style["width"].indexOf("100%") !== -1) w = parentWidth;
  }
  w = Math.min(w, parentWidth);

  // height: auto → 너비 기준 3:4 비율
  var h = getNum(style, "height");
  if (!h || style["height"] === "auto") h = Math.round(w * 0.75);

  var br = getNum(style, "border-radius") || 0;
  var alt = getAttr(attrs, "alt") || "사진";

  if (src) {
    try {
      var image = await figma.createImageAsync(src);
      var rect = figma.createRectangle();
      rect.name = alt;
      rect.resize(w, h);
      if (br) rect.cornerRadius = br;
      rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
      return rect;
    } catch (e) { /* fall through to placeholder */ }
  }

  var ph = figma.createFrame();
  ph.name = alt;
  ph.resize(w, h);
  ph.fills = [solid("#F1F3F5")];
  if (br) ph.cornerRadius = br;
  return ph;
}

// ── 텍스트 노드 ──

function buildTextNode(text, tag, style, parentWidth) {
  if (!text || text === "⠿") return null;

  var node = figma.createText();
  node.name = tag;

  // 폰트 크기
  var size = getNum(style, "font-size");
  if (!size) {
    var defs = {h1:48, h2:36, h3:28, h4:24, h5:20, h6:18, p:16, span:15, strong:16, em:16, li:16, div:16, a:16};
    size = defs[tag] || 16;
  }

  // 폰트 굵기
  var weight = getNum(style, "font-weight");
  if (!weight) weight = (tag.charAt(0)==="h" || tag==="strong") ? 700 : 400;

  // 색상
  var color = getColor(style, "color") || "#111827";

  // 정렬
  var align = style["text-align"] || "left";

  node.fontName = { family: "Inter", style: wts(weight) };
  node.fontSize = size;
  node.characters = text;
  node.fills = [solid(color)];

  var tw = getNum(style, "width") || parentWidth;
  node.resize(Math.min(tw, parentWidth), node.height);
  node.textAutoResize = "HEIGHT";

  if (align === "center") node.textAlignHorizontal = "CENTER";
  else if (align === "right") node.textAlignHorizontal = "RIGHT";

  node.lineHeight = { value: size * (size >= 28 ? 1.3 : 1.7), unit: "PIXELS" };

  var ls = getNum(style, "letter-spacing");
  if (ls) node.letterSpacing = { value: ls, unit: "PIXELS" };

  return node;
}

// ── HTML 파싱 유틸리티 ──

function extractInnerHtml(html, tag) {
  // 첫 번째 여는 태그 이후, 마지막 닫는 태그 이전의 내용
  var openEnd = html.indexOf(">");
  if (openEnd === -1) return "";
  var closeTag = "</" + tag + ">";
  var closeIdx = html.lastIndexOf(closeTag);
  if (closeIdx === -1) return html.substring(openEnd + 1);
  return html.substring(openEnd + 1, closeIdx);
}

function splitChildTags(html) {
  // 직접 자식 태그를 분리 (depth 추적)
  var children = [];
  var depth = 0;
  var current = "";
  var i = 0;
  var len = html.length;

  while (i < len) {
    if (html[i] === "<") {
      // 닫는 태그 확인
      if (html[i+1] === "/") {
        depth--;
        if (depth < 0) depth = 0;
        // 닫는 태그 끝까지 포함
        var closeEnd = html.indexOf(">", i);
        if (closeEnd !== -1) {
          current += html.substring(i, closeEnd + 1);
          i = closeEnd + 1;
        } else {
          current += html[i];
          i++;
        }
        if (depth === 0 && current.trim()) {
          children.push(current.trim());
          current = "";
        }
        continue;
      }

      // self-closing 태그 확인 (img, hr, br, input)
      var selfMatch = html.substring(i).match(/^<(img|hr|br|input|meta|link)([^>]*)\/?>/i);
      if (selfMatch) {
        if (depth === 0) {
          children.push(selfMatch[0]);
        } else {
          current += selfMatch[0];
        }
        i += selfMatch[0].length;
        continue;
      }

      // 여는 태그
      depth++;
      current += html[i];
      i++;
    } else {
      if (depth === 0) {
        // 최상위 레벨의 텍스트는 무시 (자식 태그만 추출)
        i++;
      } else {
        current += html[i];
        i++;
      }
    }
  }

  return children;
}

function getDirectText(html) {
  // 자식 태그를 제거하고 직접 텍스트만 추출
  var text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  return text;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function parseStyleAttr(attrs) {
  var m = attrs.match(/style="([^"]*)"/);
  if (!m) return {};
  var styles = {};
  var parts = m[1].split(";");
  for (var i = 0; i < parts.length; i++) {
    var ci = parts[i].indexOf(":");
    if (ci === -1) continue;
    var k = parts[i].substring(0, ci).trim().toLowerCase();
    var v = parts[i].substring(ci+1).trim();
    if (k && v) styles[k] = v;
  }
  return styles;
}

function getAttr(attrs, name) {
  var re = new RegExp(name + '="([^"]*)"');
  var m = attrs.match(re);
  return m ? m[1] : "";
}

// ── 스타일 값 추출 ──

function getNum(style, prop) {
  if (!style || !style[prop]) return 0;
  var m = style[prop].match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function getColor(style, prop) {
  if (!style || !style[prop]) return "";
  var val = style[prop].trim();
  var hm = val.match(/#([0-9a-fA-F]{3,8})/);
  if (hm) {
    var h = hm[1];
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return "#" + h.substring(0,6);
  }
  var rm = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rm) return "#"+pad(rm[1])+pad(rm[2])+pad(rm[3]);
  var named = {black:"#000000",white:"#FFFFFF",transparent:"",inherit:""};
  if (named[val.toLowerCase()] !== undefined) return named[val.toLowerCase()];
  return "";
}

function pad(n) { return parseInt(n).toString(16).padStart(2,"0"); }

// ── Figma 유틸 ──

function solid(hex) {
  return { type: "SOLID", color: hexRgb(hex) };
}

function hexRgb(hex) {
  hex = hex.replace("#","");
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  if (hex.length < 6) hex = "111827";
  return {
    r: parseInt(hex.substring(0,2),16)/255,
    g: parseInt(hex.substring(2,4),16)/255,
    b: parseInt(hex.substring(4,6),16)/255,
  };
}

function wts(w) {
  if (w >= 700) return "Bold";
  if (w >= 600) return "Semi Bold";
  if (w >= 500) return "Medium";
  return "Regular";
}

function progress(step, pct) {
  figma.ui.postMessage({ type: "progress", step: step, percent: pct });
}
