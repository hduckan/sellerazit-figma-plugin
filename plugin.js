/**
 * 셀러들의 아지트 디자이너 — HTML to Figma 플러그인
 * HTML+인라인CSS를 직접 파싱하여 편집 가능한 Figma 레이아웃으로 변환합니다.
 * JSON 중간 변환 없이, 원본 HTML의 스타일을 최대한 보존합니다.
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

// ── 메인 HTML 임포트 ──

async function handleHtmlImport(html, title) {
  try {
    figma.ui.postMessage({ type: "progress", step: "폰트 로딩 중...", percent: 5 });

    var fonts = [
      { family: "Inter", style: "Regular" },
      { family: "Inter", style: "Medium" },
      { family: "Inter", style: "Semi Bold" },
      { family: "Inter", style: "Bold" },
    ];
    for (var i = 0; i < fonts.length; i++) {
      try { await figma.loadFontAsync(fonts[i]); } catch (e) { /* skip */ }
    }

    figma.ui.postMessage({ type: "progress", step: "HTML 파싱 중...", percent: 10 });

    // HTML 파싱 — 간단한 DOM 파서
    var sections = parseHtmlSections(html);

    figma.ui.postMessage({ type: "progress", step: "Figma 레이아웃 생성 중...", percent: 20 });

    // 최상위 프레임
    var canvasWidth = 860;
    var widthMatch = html.match(/width\s*:\s*(\d+)\s*px/);
    if (widthMatch) canvasWidth = parseInt(widthMatch[1]);

    var root = figma.createFrame();
    root.name = title || "상세페이지";
    root.resize(canvasWidth, 100);
    root.layoutMode = "VERTICAL";
    root.primaryAxisSizingMode = "AUTO";
    root.counterAxisSizingMode = "FIXED";
    root.fills = [solid("#FFFFFF")];

    for (var s = 0; s < sections.length; s++) {
      figma.ui.postMessage({
        type: "progress",
        step: "섹션 " + (s + 1) + "/" + sections.length + " 생성 중...",
        percent: Math.round(20 + (s / sections.length) * 70),
      });
      var sectionFrame = await buildSectionFromHtml(sections[s], canvasWidth);
      if (sectionFrame) root.appendChild(sectionFrame);
    }

    figma.currentPage.appendChild(root);
    figma.viewport.scrollAndZoomIntoView([root]);
    figma.ui.postMessage({ type: "progress", step: "완료!", percent: 100 });
    figma.notify(sections.length + "개 섹션 생성 완료!");
    figma.ui.postMessage({ type: "done", count: sections.length });
  } catch (err) {
    figma.notify("생성 실패: " + err.message, { error: true });
    figma.ui.postMessage({ type: "fail", message: err.message });
  }
}

// ── HTML 섹션 파싱 ──

function parseHtmlSections(html) {
  // data-section-type으로 분리
  var parts = html.split(/(?=<div[^>]*data-section-type)/i);
  var sections = [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) continue;
    var typeMatch = part.match(/data-section-type="([^"]*)"/);
    if (!typeMatch) continue;
    sections.push({
      type: typeMatch[1],
      html: part,
    });
  }
  return sections;
}

// ── 섹션 빌더 ──

async function buildSectionFromHtml(section, canvasWidth) {
  var frame = figma.createFrame();
  frame.name = section.type || "Section";
  frame.resize(canvasWidth, 10);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = 16;

  // 섹션 스타일 추출
  var sectionStyle = extractInlineStyle(section.html);
  var bg = getColorFromStyle(sectionStyle, "background") || getColorFromStyle(sectionStyle, "background-color") || "#FFFFFF";
  frame.fills = [solid(bg)];

  // 패딩
  var padding = getNumFromStyle(sectionStyle, "padding") || 50;
  frame.paddingTop = padding;
  frame.paddingBottom = padding;
  frame.paddingLeft = padding;
  frame.paddingRight = padding;

  // 텍스트 정렬 기본값
  var sectionAlign = sectionStyle["text-align"] || "left";

  // 섹션 내 요소들 파싱
  var elements = parseElements(section.html);
  var contentWidth = canvasWidth - padding * 2;

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var node = await buildElement(el, contentWidth, sectionAlign, sectionStyle);
    if (node) frame.appendChild(node);
  }

  return frame;
}

// ── 요소 파싱 (HTML 태그 추출) ──

function parseElements(html) {
  var elements = [];
  // img 태그 추출
  var imgRe = /<img[^>]*>/gi;
  // 텍스트 태그 추출
  var textRe = /<(h[1-6]|p|span|strong|em|li|blockquote|div)([^>]*)>([\s\S]*?)<\/\1>/gi;
  // hr 태그
  var hrRe = /<hr[^>]*\/?>/gi;

  // 순서를 유지하기 위해 모든 태그의 위치를 기록
  var allMatches = [];

  // img
  var m;
  while ((m = imgRe.exec(html)) !== null) {
    var src = "";
    var srcMatch = m[0].match(/src="([^"]*)"/);
    if (srcMatch) src = srcMatch[1];
    if (!src) continue;
    var imgStyle = extractInlineStyleFromTag(m[0]);
    allMatches.push({
      index: m.index,
      type: "image",
      src: src,
      style: imgStyle,
      alt: (m[0].match(/alt="([^"]*)"/) || ["", ""])[1],
    });
  }

  // hr
  while ((m = hrRe.exec(html)) !== null) {
    allMatches.push({ index: m.index, type: "hr" });
  }

  // text
  while ((m = textRe.exec(html)) !== null) {
    var tag = m[1].toLowerCase();
    var attrs = m[2];
    var innerHtml = m[3];

    // 내부 텍스트만 추출 (중첩 태그 제거)
    var text = innerHtml.replace(/<[^>]+>/g, "").trim();
    // HTML 엔티티 디코드
    text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    if (!text || text === "⠿") continue;

    // data-section-type이 있는 div는 건너뛰기 (섹션 자체)
    if (tag === "div" && attrs.indexOf("data-section-type") !== -1) continue;
    // 에디터 UI 요소 건너뛰기
    if (attrs.indexOf("data-element-toolbar") !== -1) continue;
    if (attrs.indexOf("data-resize-handle") !== -1) continue;

    var elStyle = extractInlineStyleFromAttrs(attrs);
    allMatches.push({
      index: m.index,
      type: "text",
      tag: tag,
      text: text,
      style: elStyle,
    });
  }

  // 위치순 정렬
  allMatches.sort(function(a, b) { return a.index - b.index; });

  // 중복 제거 (같은 텍스트가 부모-자식에서 중복 추출될 수 있음)
  var seen = {};
  for (var i = 0; i < allMatches.length; i++) {
    var el = allMatches[i];
    if (el.type === "text") {
      var key = el.text.substring(0, 50);
      if (seen[key]) {
        // 이전 것보다 스타일이 더 구체적이면 교체
        if (Object.keys(el.style).length > Object.keys(seen[key].style).length) {
          var prevIdx = elements.indexOf(seen[key]);
          if (prevIdx !== -1) elements[prevIdx] = el;
          seen[key] = el;
        }
        continue;
      }
      seen[key] = el;
    }
    elements.push(el);
  }

  return elements;
}

// ── 요소 빌더 ──

async function buildElement(el, contentWidth, parentAlign, parentStyle) {
  if (el.type === "image") {
    return await buildImage(el, contentWidth);
  }
  if (el.type === "hr") {
    var line = figma.createRectangle();
    line.name = "구분선";
    line.resize(contentWidth, 1);
    line.fills = [solid("#E5E7EB")];
    return line;
  }
  if (el.type === "text") {
    return buildText(el, contentWidth, parentAlign, parentStyle);
  }
  return null;
}

// ── 텍스트 빌더 ──

function buildText(el, contentWidth, parentAlign, parentStyle) {
  var node = figma.createText();
  node.name = el.tag || "text";

  // 폰트 크기 결정
  var fontSize = getNumFromStyle(el.style, "font-size");
  if (!fontSize) {
    // 부모 스타일에서 상속
    fontSize = getNumFromStyle(parentStyle, "font-size");
  }
  if (!fontSize) {
    // 태그 기본값
    var defaults = { h1: 48, h2: 36, h3: 28, h4: 24, h5: 20, h6: 18, p: 16, span: 16, strong: 16, em: 16, li: 16, div: 16 };
    fontSize = defaults[el.tag] || 16;
  }

  // 폰트 굵기
  var fontWeight = getNumFromStyle(el.style, "font-weight");
  if (!fontWeight) fontWeight = getNumFromStyle(parentStyle, "font-weight");
  if (!fontWeight) {
    fontWeight = (el.tag && (el.tag.charAt(0) === "h" || el.tag === "strong")) ? 700 : 400;
  }

  // 색상
  var color = getColorFromStyle(el.style, "color");
  if (!color) color = getColorFromStyle(parentStyle, "color");
  if (!color) color = "#111827";

  // 정렬
  var align = el.style["text-align"] || parentAlign || "left";

  // 적용
  node.fontName = { family: "Inter", style: weightToStyle(fontWeight) };
  node.fontSize = fontSize;
  node.characters = el.text;
  node.fills = [solid(color)];

  // 텍스트 너비
  var textWidth = getNumFromStyle(el.style, "width") || contentWidth;
  node.resize(Math.min(textWidth, contentWidth), node.height);
  node.textAutoResize = "HEIGHT";

  // 정렬
  if (align === "center") node.textAlignHorizontal = "CENTER";
  else if (align === "right") node.textAlignHorizontal = "RIGHT";

  // 행간
  node.lineHeight = { value: fontSize * (fontSize >= 28 ? 1.3 : 1.7), unit: "PIXELS" };

  // 자간
  var letterSpacing = getNumFromStyle(el.style, "letter-spacing");
  if (letterSpacing) node.letterSpacing = { value: letterSpacing, unit: "PIXELS" };

  return node;
}

// ── 이미지 빌더 ──

async function buildImage(el, contentWidth) {
  var w = getNumFromStyle(el.style, "width") || contentWidth;
  var h = getNumFromStyle(el.style, "height") || 400;
  w = Math.min(w, contentWidth);

  // 100% 너비 처리
  if (el.style["width"] && el.style["width"].indexOf("100%") !== -1) {
    w = contentWidth;
  }

  if (el.src) {
    try {
      var image = await figma.createImageAsync(el.src);
      var rect = figma.createRectangle();
      rect.name = el.alt || "사진";
      rect.resize(w, h);

      var borderRadius = getNumFromStyle(el.style, "border-radius") || 0;
      rect.cornerRadius = borderRadius;

      rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
      return rect;
    } catch (e) {
      // 이미지 로드 실패 — 자리표시자
    }
  }

  // 자리표시자
  var placeholder = figma.createFrame();
  placeholder.name = el.alt || "이미지";
  placeholder.resize(w, h);
  placeholder.fills = [solid("#F1F3F5")];

  var hint = figma.createText();
  hint.fontName = { family: "Inter", style: "Medium" };
  hint.fontSize = 13;
  hint.characters = "사진을 추가하세요";
  hint.fills = [solid("#9CA3AF")];
  hint.textAlignHorizontal = "CENTER";
  hint.resize(w, 18);
  hint.x = 0;
  hint.y = h / 2 - 9;
  placeholder.appendChild(hint);

  return placeholder;
}

// ── 인라인 스타일 파서 ──

function extractInlineStyle(html) {
  // 첫 번째 태그의 style 속성 추출
  var match = html.match(/style="([^"]*)"/);
  if (!match) return {};
  return parseStyleString(match[1]);
}

function extractInlineStyleFromTag(tag) {
  var match = tag.match(/style="([^"]*)"/);
  if (!match) return {};
  return parseStyleString(match[1]);
}

function extractInlineStyleFromAttrs(attrs) {
  var match = attrs.match(/style="([^"]*)"/);
  if (!match) return {};
  return parseStyleString(match[1]);
}

function parseStyleString(str) {
  var styles = {};
  var parts = str.split(";");
  for (var i = 0; i < parts.length; i++) {
    var colonIdx = parts[i].indexOf(":");
    if (colonIdx === -1) continue;
    var key = parts[i].substring(0, colonIdx).trim().toLowerCase();
    var val = parts[i].substring(colonIdx + 1).trim();
    if (key && val) styles[key] = val;
  }
  return styles;
}

// ── 스타일 값 추출 유틸리티 ──

function getNumFromStyle(style, prop) {
  if (!style || !style[prop]) return 0;
  var val = style[prop];
  var m = val.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function getColorFromStyle(style, prop) {
  if (!style || !style[prop]) return "";
  var val = style[prop].trim();

  // hex
  var hexMatch = val.match(/#([0-9a-fA-F]{3,8})/);
  if (hexMatch) {
    var hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return "#" + hex.substring(0, 6);
  }

  // rgb/rgba
  var rgbMatch = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return "#" + parseInt(rgbMatch[1]).toString(16).padStart(2, "0") +
                 parseInt(rgbMatch[2]).toString(16).padStart(2, "0") +
                 parseInt(rgbMatch[3]).toString(16).padStart(2, "0");
  }

  // 명명된 색상
  var named = {
    black: "#000000", white: "#FFFFFF", red: "#FF0000", blue: "#0000FF",
    green: "#008000", yellow: "#FFFF00", gray: "#808080", grey: "#808080",
    transparent: "", inherit: "",
  };
  if (named[val.toLowerCase()] !== undefined) return named[val.toLowerCase()];

  return "";
}

// ── Figma 유틸리티 ──

function solid(hex) {
  return { type: "SOLID", color: hexRgb(hex) };
}

function hexRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length < 6) hex = "111827"; // 폴백
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}

function weightToStyle(w) {
  if (w >= 700) return "Bold";
  if (w >= 600) return "Semi Bold";
  if (w >= 500) return "Medium";
  return "Regular";
}
