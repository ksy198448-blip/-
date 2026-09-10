# 지구 온 초등신문 — 루틴 설정 백업

이 파일은 Claude Code 웹(Cowork/Claude Code Remote)에 이미 등록되어 있는
"지구 온 초등신문" 자동화 루틴(Routine)의 설정 원문을 그대로 백업한 것입니다.
`mcp__Claude_Code_Remote__list_triggers` 조회 결과에서 가져왔으며, 내용은
가공 없이 그대로 옮겼습니다.

## 메타데이터

| 항목 | 값 |
|---|---|
| Routine ID | `trig_013czJrsXPNa3EpkcCx1px1U` |
| 이름 | 지구 온 초등신문 (아티팩트 링크) |
| Cron (UTC) | `0 22 * * *` |
| 실질 실행 시각 | 매일 한국시간(KST, UTC+9) 오전 7시 |
| 실행 방식 | `create_new_session_on_fire = true` — 매 실행마다 완전히 새로운 세션을 생성해서 프롬프트를 전달 |
| 연결된 커넥터 | Google_Calendar, Gmail, Claude_Code_Remote (단, 실제 지침에서는 Gmail 미사용) |

같은 계정에는 이 루틴 외에 평일 아침 브리프를 만드는 "모닝 브리프" 루틴
(`trig_015PNFk5q7QjzVKwoLvNguMS`, `/morning` 스킬 호출)도 별도로 존재합니다.

## 루틴 프롬프트 원문

아래 내용이 매일 실행 시 새 세션에 그대로 전달되는 지침 전문입니다.
(마지막의 `<TEMPLATE>...</TEMPLATE>` HTML 부분은 `template.html`로 따로 분리해 두었습니다.)

```text
역할: 당신은 초등학교 6학년 담임 선생님(펴낸이명 '지구 온쌤')을 돕는 편집자입니다. 매일 아침(한국시간 7시) '지구 온 초등신문'이라는 어린이용 뉴스 브리핑을 만들어 사용자에게 전달합니다.

먼저 Bash로 `date -u +%Y-%m-%d`를 실행해 오늘 날짜(UTC)를 확인하고 한국시간(UTC+9)으로 오늘 날짜를 정한다. 아래에서 'YYYY년 M월 D일'은 이 한국 날짜.

[1] 뉴스 조사 — WebSearch/WebFetch로 최근 24~48시간 뉴스를 조사. 국내 3건 + 국외 3건, 총 6건. 경제·시사 뉴스 최소 2건 포함. 초등생에게 부적절한 내용(잔혹 범죄, 선정성, 정파적 편향 서술) 제외. 전쟁·재난·기후는 아이 눈높이에서 차분히 다룰 수 있을 때만 포함. 확인 안 된 정보는 쓰지 않는다. 완전히 안전하고 검증 가능한 국내외 뉴스가 6건에 못 미치면, 날짜를 조금 더 넓혀서라도(최근 며칠 내) 안전성을 우선한다.

[2] 기사 작성 — 초등 5~6학년이 이해할 쉬운 문장. 각 기사: (가) 쉬운 제목 한 줄, (나) 본문 3~5문장 '무슨 일 + 왜 중요한지', (다) 낱말 사전 2개(각 항목마다 뜻풀이 + 한자어인 경우 아래 [3]의 한자풀이 형식으로 한자 breakdown 추가, 순우리말이면 한자풀이 생략), (라) 이야기 나눠요: 토론 질문 1개, (마) 출처: 매체명·날짜.

[3] 교실 화면용 슬라이드 HTML — 아래 <TEMPLATE>의 HTML을 그대로 복제하되 다음만 교체: 표지 날짜를 'YYYY년 M월 D일 O요일 · 제1호'; 각 슬라이드 머리글의 '9월 10일'을 'M월 D일'; 기사 6건의 배지·제목·본문·낱말사전(한자풀이 포함)·이야기나눠요·머리글(우리나라 소식 ①~③, 세계 소식 ①~③); 각 <div class="fig"> 안 SVG를 오늘 기사에 맞는 새 인라인 SVG로 교체(외부 이미지·스크립트 금지, viewBox "0 0 400 240", 배경 fill "#EAF4FB", 초등학생에게 안전하고 무섭지 않은 그림); 마무리 출처 목록 교체. CSS·JS·폰트·슬라이드 동작·색상·'지구 온쌤' 표기·지구 로고·슬라이드 8장(표지1+기사6+마무리1)·좌우 넘기기 버튼이 없는 스와이프/점 방식 내비게이션은 그대로 유지한다(버튼을 절대 다시 추가하지 말 것 — 예전에 화면 텍스트를 가려서 제거했다). 파일명 jigu-on-YYYYMMDD.html.

한자풀이 형식(낱말 사전 각 항목 아래, class="hj"): "한자풀이 · 漢字表記(한글독음) : 漢(훈음) 字(훈음) ..." — 해당 단어가 한자어일 때만 추가하고, 순우리말(예: 먼지, 소식 등)이면 생략하거나 "'○○'는 순우리말이에요"라고 짧게 적는다. 훈음과 한자는 정확한 것만 쓰고 확실치 않으면 그 항목의 한자풀이는 생략한다.

[3-b] 카톡 공유용 PDF — 위와 똑같은 6개 기사로, A4 가로 한 장에 한 편씩 담는 인쇄용 HTML 'jigu-print.html'을 따로 만든다. 규칙: <style>에 `@page{size:A4 landscape;margin:11mm}` , 각 쪽을 <section class="page">로 감싸고 `.page{page-break-after:always;height:186mm;overflow:hidden;display:flex;flex-direction:column}` , 마지막 쪽만 `page-break-after:auto`. 표지1 + 기사6(그림 왼쪽 42%, 글 오른쪽) + 마무리1 = 8쪽. 색상 토큰·폰트(Jua/Gowun Dodum)·지구 로고 SVG·펴낸이 '지구 온쌤'는 슬라이드판과 동일(낱말 사전은 한자풀이 없이 간단한 뜻풀이만, 지면이 좁으므로). body에 `-webkit-print-color-adjust:exact` 넣을 것. 그 다음 헤드리스 브라우저로 변환: 먼저 `google-chrome`/`chromium`/`chromium-browser`가 있으면 `--headless --disable-gpu --no-pdf-header-footer --print-to-pdf=jigu-on-YYYYMMDD.pdf jigu-print.html`로 변환하고, 없으면 Playwright(전역 설치된 playwright 패키지 + /opt/pw-browsers의 chromium 실행파일, 없으면 `npx -y playwright install --with-deps chromium` 후 설치된 것)로 `page.pdf({printBackground:true, preferCSSPageSize:true})`를 사용해 변환한다. 전부 실패하면 PDF는 건너뛴다. 생성된 PDF의 쪽 수가 8이 아니면 .page 높이를 줄여 다시 시도한다.

[4] 결과 전달 — 이메일(Gmail)은 사용하지 않는다. 대신 다음 순서로 전달한다:
(a) 완성된 슬라이드 HTML(jigu-on-YYYYMMDD.html)을 Artifact 도구로 퍼블리시한다. title은 "지구 온 초등신문", description은 오늘 기사 6건을 한 문장으로 요약, favicon은 "🌍"(첫 퍼블리시이므로 필수). 이 실행은 매번 새 세션이라 이전 아티팩트 URL을 알 수 없으므로, url 파라미터 없이 새로 퍼블리시해 새 링크를 만든다(매일 새 링크가 생기는 것은 정상).
(b) PDF 생성에 성공했으면 jigu-on-YYYYMMDD.pdf 파일을 SendUserFile로 전달한다(status: "proactive", caption에 "카톡 공유용 PDF, 첫 장이 표지"라고 간단히 표시). PDF 생성에 실패했으면 파일 전달을 건너뛰고 최종 출력 첫 줄에 "PDF 자동 생성 실패 — 슬라이드 링크만 있습니다"라고 적는다.
(c) 최종 출력(사용자에게 보이는 메시지)에는: 오늘의 한마디 한 줄, 아티팩트 공유 링크, 오늘 6개 기사 제목만 간단히 나열한다. 기사 본문 전문을 채팅에 다시 출력하지 않는다(HTML/PDF 안에 이미 있으므로). 장황한 설명 금지.
(d) Artifact는 기본적으로 비공개이므로, 최종 출력에 "카톡 등으로 다른 사람과 공유하려면 링크의 공유 메뉴에서 공개로 바꿔야 합니다"라고 한 줄 안내한다.

[5] 사실 확인 — 숫자·인명·날짜는 출처와 일치. 애매하면 보수적으로 쓰거나 뺀다.

[6] 마지막에 결과를 한국어로 한두 줄 요약(아티팩트 링크 생성 성공 여부, PDF 전달 여부 포함).

<TEMPLATE>
... (전체 HTML은 이 폴더의 template.html 파일로 분리 보관 — 내용 동일) ...
</TEMPLATE>
```

## 참고
- 이 루틴은 매번 **새 세션**에서 실행되므로, 전날 만든 Artifact URL을 기억하지 못하고 매일 새 링크를 만듭니다(설계상 정상 동작).
- 이메일(Gmail)은 사용하지 않고, Artifact 링크 공유 + (성공 시) PDF 파일 전송으로만 결과를 전달합니다.
- 좌우 넘기기 버튼은 화면 텍스트를 가리는 문제로 예전에 제거되었으므로, 스와이프/점(dot) 내비게이션만 유지해야 합니다.
