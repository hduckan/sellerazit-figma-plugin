# 셀러들의 아지트 디자이너 - Figma 플러그인

AI가 만든 상세페이지를 Figma에서 바로 편집할 수 있는 플러그인입니다.

[셀러들의 아지트 디자이너](https://designer.sellerazit.com)에서 만든 상세페이지를 Figma 레이아웃으로 자동 변환합니다.

## 사용 방법

### 1. 상세페이지 만들기
- [designer.sellerazit.com](https://designer.sellerazit.com)에서 상품 정보를 입력하면 AI가 상세페이지를 만들어줍니다.

### 2. Figma JSON 내보내기
- 에디터에서 **이미지 내보내기 ▾ → Figma JSON** 클릭
- JSON이 클립보드에 복사되고 파일도 다운로드됩니다.

### 3. Figma에서 플러그인 실행
- Figma에서 마우스 우클릭 → Plugins → **셀러들의 아지트 디자이너**
- 클립보드에서 자동으로 JSON을 감지합니다.
- **"Figma에 생성하기"** 클릭하면 레이아웃이 자동 생성됩니다.

### 4. 편집
- 생성된 레이아웃에서 텍스트, 이미지, 색상 등을 자유롭게 수정하세요.

## 설치 방법

### Figma Community (권장)
1. Figma에서 **Plugins → Browse plugins** 클릭
2. "셀러들의 아지트" 검색
3. **Install** 클릭

### 수동 설치 (개발자용)
1. 이 저장소를 다운로드합니다.
2. Figma Desktop 앱을 엽니다.
3. **Plugins → Development → Import plugin from manifest...** 클릭
4. 다운로드한 폴더의 `manifest.json`을 선택합니다.

## 기능

- 상세페이지 JSON을 Figma 레이아웃으로 자동 변환
- 텍스트, 이미지 영역, 프레임, 구분선 자동 생성
- Auto Layout 적용 (반응형 편집 가능)
- URL로 직접 가져오기 지원
- 클립보드 자동 감지

## 파일 구조

```
manifest.json  — 플러그인 설정
code.js        — 레이아웃 생성 엔진
ui.html        — 사용자 인터페이스
```

## 관련 링크

- [셀러들의 아지트 디자이너](https://designer.sellerazit.com) — AI 상세페이지 빌더
- [셀러들의 아지트](https://sellerazit.com) — 이커머스 통합 관리 플랫폼

## 라이선스

MIT License
