# PC PWA ↔ Android Chrome/PWA 영상 통화 장애 — 2026-09-08

## 범위와 관측

사용자 확인: 양쪽에서 자기 영상은 보이지만 상대 영상이 보이지 않음. PC 설치형 PWA와 Android Chrome/설치형 PWA이며 iPhone 또는 APK 장애로 분류하지 않는다.

점검 기준 운영 소스/API/PWA: `c560697a68e3f2ce2b139c951deafa526dbaa196`.

- 12:03–12:15 UTC의 최근 영상 통화에서 서버의 LiveKit 대조 결과가 참가자 1명인 사례가 반복되었다.
- 대표 사례 A는 수락 후 발신자 방 접속, 마이크 발행, 카메라 발행까지 기록됐다. 영상 송신 바이트는 235,141 → 403,741로 증가했으나 원격 참가자는 계속 0명이었다. 수신자의 `web_join_start`는 관측되지 않았다.
- 다른 사례 B는 서버 관측 참가자 2명, 발신자 원격 음성·영상 구독 성공 후 로컬 마이크 발행 완료 진단이 없었다. 수신자는 원격 마이크를 기다리는 상태였다. 공개 저장소 보고서에는 실제 통화 식별자를 싣지 않는다.
- 서버 토큰의 영상 통화 grant는 microphone/camera 발행과 구독을 허용했다. 위 자료만으로 TURN 장애나 전체 카메라 권한 차단으로 단정할 수 없다.
- 진단 부재 자체는 특정 브라우저 Promise의 pending을 확정하지 않는다. 아래 코드 결함과 관측이 일치하지만, 사용자의 정확한 실패 순간 브라우저 내부 상태는 별도 실기기 재현이 필요하다.

## 확인된 코드 결함과 수정

| 변경 | 근거/기존 동작 | 변경 동작 | 수정 파일 |
|---|---|---|---|
| 카메라 준비와 방 접속 분리 | 공통 Provider가 카메라 사전 요청을 무기한 기다린 뒤 accept/join을 진행함 | 웹 카메라 사전 준비는 비차단. 방·마이크 연결과 상대 미디어 렌더링을 카메라 완료와 분리 | `CallProvider.tsx`, `voiceCall.web.ts` |
| 단계별 대기 제한 | join이 마이크/카메라 발행과 오디오 재생 Promise 완료까지 기다림 | 마이크 발행 20초, 카메라 캡처 12초·발행 12초. 카메라 실패는 음성 연결을 종료하지 않음. 브라우저 오디오 resume도 UI 전달을 막지 않음 | `voiceCall.web.ts` |
| 카메라 요청 및 늦은 결과 보호 | 브라우저 원본 getUserMedia는 취소할 수 없고 늦게 완료될 수 있음 | 캡처 단일 실행, 통화/카메라 세대 검사, 늦은 스트림 stop 및 늦은 발행 unpublish. 종료된 통화의 결과를 다음 통화에 적용하지 않음 | `voiceCall.web.ts`, `CallProvider.tsx` |
| 카메라 토글/전환 | mute된 live 트랙 존재만으로 ON 성공으로 볼 수 있음 | 실제 unmute 또는 제한된 재캡처 경로 사용. 전환에서도 마이크 보존 | `voiceCall.web.ts` |
| 복귀/토글 UI 보호 | 이전 통화·이전 토글의 완료가 새 UI를 덮을 수 있음 | generation, Room, 사용자 의도, 토글 작업 번호와 dispose 확인 | `CallProvider.tsx` |
| 재생 실패 표시 | 구독 성공과 DOM 재생 가능 상태가 다르고 실패가 조용히 묻힘 | 명시적 영상 재생 재시도 버튼, 지연된 play 실패 무시, 리스너 정리. LiveKit 브라우저별 autoplay 선택 존중 | `CallVideoView.web.tsx`, `callVideoPlayback.ts` |
| APK 회귀 예방 | 공통 UI의 비차단 전환이 Android 네이티브 권한 대화상자를 중복 호출할 수 있음 | native join은 기존 prewarm 권한 Promise를 기다린 후 후속 권한 확인 | `voiceCall.ts` |

모바일 파일 경로 기준: `artifacts/mobile/components/`, `artifacts/mobile/lib/`.

브라우저의 getUserMedia는 사용자가 권한 선택을 하지 않을 때 resolve/reject되지 않을 수 있다. 원본 요청 취소 API는 없으므로 기한을 넘긴 후 새 요청을 계속 쌓지 않는다. 권한 창 확인 또는 페이지 재실행이 필요할 수 있음을 UI에 표시한다. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

## 테스트와 지표

### 실제 LiveKit 별도 테스트 방

`scripts/verify-livekit-video-smoke.mjs --ssh anotherme-prod`로 현재 웹 통화 코드와 재생 helper를 직접 번들링하여 두 독립 브라우저 컨텍스트를 연결했다. 고유한 임시 방만 생성·삭제하며 토큰은 프로세스/브라우저 메모리에만 보관한다.

| 시험 | A 수신 | B 수신 | 결과 |
|---|---|---|---|
| 양방향 영상·음성 | 음성 7,411B, 영상 4,954B, decoded/rendered 13/13 | 음성 6,044B, 영상 2,394B, decoded/rendered 3/3 | 양측 상대 참가자 1, 마이크/카메라 발행 및 실제 프레임 재생 확인 |
| B 카메라 getUserMedia 무한 pending 주입 | 음성 3,171B | 음성 3,421B, 영상 1,091B, decoded/rendered 2/3 | 약 4.7초 안에 양방향 음성 및 A→B 영상 확인. B 카메라 미발행이어도 유지 |

이 수치는 짧은 스모크 시험의 누적 카운터이며 대역폭/품질/장시간 안정성 지표가 아니다. 기존 버전과 같은 기기로 수행한 A/B 성능 측정도 아니다. Windows headless Chrome fake camera/microphone 사용 및 autoplay 허용 플래그 때문에 실물 카메라·마이크, 실제 사용자 권한 흐름, autoplay 정책과 전체 Provider/API UI 흐름을 검증하지 않는다. 사용자 통화 방에는 개입하지 않았다.

### 회귀 검증

- 웹 미디어 장애 주입: 15건 통과. 카메라 요청 미완료·권한 거부·늦은 캡처/발행, 마이크 미완료, 통화 A→B, muted+ended 재활성화, 캡처/발행 중 OFF→ON, 지연된 SDK ON/OFF 순서, 전환 시 마이크 보존, 발행 timeout 후 원본 Promise 미완료 중 재발행 방지 검사.
- 영상 DOM 재생 lifecycle: 5건 통과. 차단 후 사용자 재시도, 늦은 play rejection, AbortError, 복귀/track unmute, dispose 검사.
- 채팅/통화 복구/소유자 정책 등 기존 신뢰성 시험과 영상 재생을 함께 실행: 61건 통과.
- 서비스워커 캐시/Push 소유자·네이티브 통화 플러그인: 11건 통과.
- 통화 API 소유자 경계: 3건 통과.
- 모바일 TypeScript 검사 및 `git diff --check` 통과.
- `.github/workflows/quality.yml`에 웹 미디어와 영상 재생 회귀 시험을 명시적으로 추가했다.
- 기존 `security:tracked-files` 검사는 이미 HEAD에 존재하는 `.env.docker.example`도 금지 대상으로 잡아 실패했다. 이번 변경에는 환경 파일·토큰·개인 식별자·메시지 본문을 포함하지 않았다. 이 기존 검사 실패를 통과로 기록하지 않는다.

## 남은 위험과 미검증

- 실제 PC 설치형 PWA ↔ Android 설치형 PWA/Chrome, 사용자 장치의 카메라/마이크 동시 요청, 제조사별 권한 UI는 직접 검증하지 못했다.
- 통신사별 셀룰러, Wi-Fi 전환, UDP 차단/TURN 강제 경로, 장시간 통화는 이번 시험 범위가 아니다.
- 웹 재생 제한 보완은 여러 브라우저에 유효하지만 Safari가 이번 장애 원인이라는 주장은 하지 않는다.
- 브라우저가 원본 캡처 요청을 영원히 미완료로 유지하는 경우 음성/원격 영상은 유지하되 카메라 복구에 페이지 재실행이 필요할 수 있다.
- 마이크 캡처/발행 20초 제한을 넘기면 통화 접속 실패 처리한다. 느린 권한 선택의 사용자 영향은 실기기 확인이 필요하다.
- 설치형 PWA는 기존 페이지를 계속 열어두면 이전 JavaScript로 통화할 수 있다. 교체 후 양쪽 앱을 닫고 다시 열어 새 번들을 사용해야 한다.

## 배포와 롤백

이번 변경은 PWA를 교체하며 운영 API 이미지·DB 스키마·LiveKit 설정은 변경하지 않는다. 배포 전 전체 active/ringing 개수를 읽기 전용 `docker/ops/inspect-active-calls.mjs`로 확인한다. PWA는 새 불변 디렉터리에 풀고 기존 compose의 `PWA_WEB_ROOT`만 교체한다. proxy 재생성으로 API websocket 신호 연결이 잠시 끊길 수 있다.

롤백: 동일 API digest와 compose release를 유지하고 `PWA_WEB_ROOT=/opt/anotherme-pwa-release-c560697`으로 proxy만 재생성한다. 실패한 번들의 파일을 기존 디렉터리에 덮어쓰지 않는다. DB 롤백이나 사용자 통화 방 삭제는 필요하지 않다. 버전별 PWA 경로·번들 해시·운영 health 확인은 배포 결과에 별도 기록한다.
