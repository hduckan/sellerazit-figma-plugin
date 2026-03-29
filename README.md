# 셀러들의 아지트 디자이너 - Figma 플러그인

AI가 만든 상세페이지를 Figma에서 바로 편집할 수 있는 플러그인입니다.

[셀러들의 아지트 디자이너](https://designer.sellerazit.com)에서 만든 상세페이지를 Figma 레이아웃으로 자동 변환합니다.

---

## 설치 방법 (최초 1회)

### 1단계: 다운로드

이 페이지에서 초록색 **Code** 버튼 → **Download ZIP** 클릭 → 압축 풀기

### 2단계: 고정 폴더에 넣기

압축 푼 파일 3개(`manifest.json`, `plugin.js`, `panel.html`)를 아래 폴더에 넣어주세요:

```
C:\Users\내사용자명\Documents\sellerazit-figma-plugin\
```

> 이 폴더는 삭제하면 안 됩니다! Figma가 이 폴더를 계속 참조합니다.
> 플러그인 업데이트 시 이 폴더에 새 파일을 덮어쓰면 됩니다.

### 3단계: Figma에 등록

1. **Figma Desktop** 앱을 실행합니다 (웹 버전이 아닌 데스크톱 앱)
2. 아무 디자인 파일을 엽니다
3. 상단 메뉴에서 **Plugins → Development → Import plugin from manifest...** 클릭
4. 위에서 만든 폴더의 `manifest.json`을 선택합니다
5. 완료! 이제부터 사용 가능합니다

---

## 사용 방법 (매번)

### 1. 상세페이지 만들기
- [designer.sellerazit.com](https://designer.sellerazit.com)에서 상품 정보를 입력하면 AI가 상세페이지를 만들어줍니다

### 2. Figma JSON 내보내기
- 에디터에서 **이미지 내보내기 ▾ → Figma JSON** 클릭
- JSON이 클립보드에 복사되고 파일도 다운로드됩니다

### 3. Figma에서 플러그인 실행
- Figma에서 마우스 **우클릭 → Plugins → 셀러들의 아지트 디자이너**
- 클립보드에서 자동으로 JSON을 감지합니다
- **"Figma에 생성"** 클릭하면 레이아웃이 자동 생성됩니다

### 4. 편집
- 생성된 레이아웃에서 텍스트, 이미지, 색상 등을 자유롭게 수정하세요
- 완성되면 PNG로 내보내기 하여 쿠팡/네이버에 업로드합니다

---

## 업데이트 방법

1. 이 페이지에서 최신 ZIP을 다시 다운로드
2. 기존 폴더(`Documents\sellerazit-figma-plugin\`)에 파일 3개를 덮어쓰기
3. Figma에서 플러그인을 다시 실행하면 자동 반영 (재등록 불필요)

---

## 파일 구조

```
manifest.json  — 플러그인 설정
plugin.js      — 레이아웃 생성 엔진
panel.html     — 사용자 인터페이스
```

## 관련 링크

- [셀러들의 아지트 디자이너](https://designer.sellerazit.com) — AI 상세페이지 빌더
- [셀러들의 아지트](https://sellerazit.com) — 이커머스 통합 관리 플랫폼

## 라이선스

MIT License
